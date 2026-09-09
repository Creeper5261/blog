---
title: Tokenizer：从零手写一个 BPE 分词器
date: '2026-09-09T16:44:50+08:00'
updated: '2026-09-09T11:39:59.616Z'
description: 为了弄清 Transformer 的输入是怎么来的，先把 Tokenizer 单独拿出来学一遍：从原始文本开始，手写一个 BPE 分词器。
permalink: /2026/09/09/tokenizer/
comments: true
mathjax: false
toc: true
categories:
  - 学习
tags:
  - Transformer
  - Tokenizer
  - BPE
sourceHash: 6048119a6f43b230de2e31a66b1c91e25b295612f4b44fa002fc35fe303a24e7
metadataHash: 7b73cac082eea62a24fce0a453a575913d180d371f44ef5aa1e7ee86f2335980
rendererIdentity: markdown-frontmatter-v1
---

最开始是想通过手写一个 Tiny Transformer，弄清楚语言模型是怎么工作的。不过在写 Embedding 之前，还有一步得先搞明白：数据集里是一句句文本，送进模型时却已经变成了一串 token ID。这些 ID 是怎么来的？一句话为什么会被切成现在这样的片段？

平时用现成的 tokenizer，调用一次 `encode()` 就能拿到结果。但既然这次是为了理解整个过程，这一步也值得拿出来单独学一下。于是先从 Transformer 往前退一步，写一个 BPE 分词器，看看原始文本怎样经过切分、统计和合并，最后变成模型的输入。

训练语料用 Universal Dependencies English EWT，从单个字符开始实现。等分词规则和词表都建立起来，再把结果保存下来，接着做后面的 Embedding 和 Transformer。

# 一、语料预处理与基础符号

## BPE 究竟在训练什么

BPE 的做法可以从“哪些字符经常挨在一起”开始理解。先把文本拆成字符，数一数每对相邻字符出现了多少次，把最多的一对合起来；合并后再重新统计，继续选下一对。这样反复做下去，单个字符就逐渐组成了更长的片段。

假设语料中有 `the`、`the`、`there` 和 `them`，初始时把每个词拆成字符。`t` 和 `h` 经常挨在一起，如果这一轮选中它们，就产生 `t + h -> th`；下一轮又可能把 `th` 与 `e` 合并，得到 `the`。变化可以放在一起看：

```text
初始状态       合并 t + h      合并 th + e
 t h e          th e           the
 t h e          th e           the
 t h e r e      th e r e        the r e
 t h e m        th e m          the m
```

第一次合并后，`th` 就要当成一个整体参与下一轮统计了。后面说的 symbol，指的就是这样的单位：最开始是 `t`、`h`、`e`，合并后也可以是 `th`、`the`。

规则按学习顺序存入 `merge_rules`。例如先记录 `(t, h)`，再记录 `(th, e)`；给新文本分词时也按这个顺序执行，先形成 `th`，再合成 `the`。

## 从 EWT 读取原始句子

EWT 里既有原始句子 `example["text"]`，也有已经切好的 `example["tokens"]`。这次想把分词过程也自己做一遍，所以从原始句子开始读，词、标点和空格都留给后面的函数处理。

读取语料的部分放在 `dataset.py` 里：取出指定 split，过滤空文本，剩下的句子收集成一个列表：

```python
def get_raw_texts(split="train"):
    dataset = load_ewt()[split]
    return [
        example["text"]
        for example in dataset
        if example["text"]
    ]
```

输出是 `list[str]`，例如 `["Sentence one.", "Sentence two."]`，统计函数从中逐句取文本。我曾把单个字符串直接传入，结果 `for` 遍历的是字符；测试一句话时也要写成 `[text]`。

## 先确定边界：Pre-tokenization 与空格标记

直接对句子调用 `text.split()` 很方便，却会丢掉空白信息，并让逗号、句号继续粘在词上。比如 `"Hi, I'm here."` 会得到 `"Hi,"`、`"I'm"`、`"here."`。为了让后续合并发生在相对明确的文本块内部，我先增加了一层 pre-tokenization。

这一步使用下面的正则，匹配连续的单词字符、带一个撇号连接部分的形式，以及单独的非单词、非空白字符：

```python
r"\w+(?:'\w+)?|[^\w\s]"
```

这个正则把句子切成 `Hi`、`,`、`I'm`、`here`、`.`，其中 `I'm` 保持为一个块。后面的 BPE 在各块内部独立合并，因此 `Hi` 和逗号不会被合成同一个 token。

分开文本块后，还需要留下词间空格的信息。当前实现检查每个匹配在原文中的起点：如果前一个字符是空白，就在这个块前面加上 `Ġ`。于是同一句话的内部表示变成：

```python
["Hi", ",", "ĠI'm", "Ġhere", "."]
```

`Ġ` 也作为字符参与 BPE 训练。例如 `Ġ + t -> Ġt`，之后还可以继续合并成 `Ġthe`。词表中的 `the` 和 `Ġthe` 因而对应两种形式：`the` 本身，以及前面带有空格的 `the`。

## 统计频次，再拆成基础 symbol

句子切好之后，就可以数每种文本块出现了多少次了。`build_word_counts(texts)` 用 `Counter` 做这件事，标点和带 `Ġ` 的块也一起计数：

```python
# 频次仅用于示意
{
    "the": 31,
    "Ġthe": 120,
    "ĠAmerican": 4,
    ",": 18,
}
```

比如 `Ġthe` 出现 120 次，就保留一条序列和频次 120。之后统计相邻 pair 时，每个位置贡献 120 次计数，省去了存储和遍历 120 份相同文本的开销。

接下来由 `build_symbol_vocab(word_counts)` 把每个文本块拆成 Unicode 字符。例如 `American` 对应 `("A", "m", "e", "r", "i", "c", "a", "n")`，频次保持不变；如果原来带有 `Ġ`，它也会成为序列中的第一个 symbol。

拆开的字符还要放回频次表里，所以这里用 tuple 作为 `Counter` 的键。这样得到的 `symbol_vocab`，每一项都是一条字符序列和它的出现次数，后面的 BPE 就从这张表开始训练。

# 二、BPE 训练：从相邻统计到合并规则

## 四条文本的训练过程

把 `low`、`lower`、`lowest` 放到一起，就能看到 BPE 怎样把它们共有的部分合出来。下面从这几个词开始跑两轮，把每一步的数据列出来，其中 `low` 放两次：

```python
texts = [
    "low",
    "low",
    "lower",
    "lowest",
]
```

这里每条文本都只有一个词，`pre_tokenize()` 切完还是原来的词，可以直接开始计数。

**第 1 步：统计词频，存到 `word_counts`。**

调用 `word_counts = build_word_counts(texts)`，把相同的词合在一起计数。四条文本变成三个词及其频次：

```python
word_counts = Counter({
    "low": 2,
    "lower": 1,
    "lowest": 1,
})
```

列表里两个 `low` 合成了一项，次数记为 2，后面的统计也要把这两次都算上。

**第 2 步：把词拆成字符序列，存到 `symbol_vocab`。**

调用 `symbol_vocab = build_symbol_vocab(word_counts)`，把每个字符串键换成字符 tuple，右边的频次原样保留：

```python
symbol_vocab = Counter({
    ("l", "o", "w"): 2,
    ("l", "o", "w", "e", "r"): 1,
    ("l", "o", "w", "e", "s", "t"): 1,
})
```

例如 `"low": 2` 变成 `("l", "o", "w"): 2`，表示这条字符序列在语料里出现两次。这就是 BPE 开始训练时看到的数据。

**第 3 步：统计相邻两个 symbol 的出现次数，存到 `pair_counts`。**

调用 `pair_counts = count_pair(symbol_vocab)`，在每条序列内部从左到右看相邻两项，再按该序列的频次累加：

```text
low × 2     → (l, o) +2，(o, w) +2
lower × 1   → (l, o) +1，(o, w) +1，(w, e) +1，(e, r) +1
lowest × 1  → (l, o) +1，(o, w) +1，(w, e) +1，(e, s) +1，(s, t) +1
```

把各行贡献加起来，得到：

```python
pair_counts = Counter({
    ("l", "o"): 4,
    ("o", "w"): 4,
    ("w", "e"): 2,
    ("e", "r"): 1,
    ("e", "s"): 1,
    ("s", "t"): 1,
})
```

`(l, o)` 的频次为 4：`low` 贡献 2 次，`lower` 和 `lowest` 各贡献 1 次。

**第 4 步：选最高频 pair，记录到 `merge_rules`。**

调用 `best_pair, count = get_best_pair(pair_counts)`。这里 `(l, o)` 与 `(o, w)` 都是 4 次；按照当前代码的遍历顺序，`(l, o)` 先进入 Counter，同频时选中它。

```python
best_pair = ("l", "o")
count = 4

# 训练开始时是空列表，每轮追加本轮选中的 pair
merge_rules = [("l", "o")]
```

这条规则的含义就是 `l + o -> lo`。`count` 用来说明这一轮为什么选它，规则列表里只记录 pair，不记录频次。

**第 5 步：执行合并，更新训练中的 `symbol_vocab`。**

调用 `symbol_vocab = merge_pair(symbol_vocab, best_pair)`，把每条序列里相邻的 `l`、`o` 合成一个 symbol：

```python
symbol_vocab = Counter({
    ("lo", "w"): 2,
    ("lo", "w", "e", "r"): 1,
    ("lo", "w", "e", "s", "t"): 1,
})
```

合并后，`low` 对应的序列从三个 symbol 变成两个，出现次数仍然是 2。

**第 6 步：用更新后的序列重新统计，执行第二轮合并。**

回到第 3 步，再调用 `count_pair()`。现在 `lo` 已经是一个整体，因此统计的候选也跟着变化：

```python
pair_counts = Counter({
    ("lo", "w"): 4,
    ("w", "e"): 2,
    ("e", "r"): 1,
    ("e", "s"): 1,
    ("s", "t"): 1,
})
```

这次最高频的是 `("lo", "w")`，于是记录 `lo + w -> low`，再完成合并：

```python
merge_rules = [
    ("l", "o"),
    ("lo", "w"),
]

symbol_vocab = Counter({
    ("low",): 2,
    ("low", "e", "r"): 1,
    ("low", "e", "s", "t"): 1,
})
```

`("low",)` 里的逗号表示这是只有一项的 tuple。两轮合并把三个词共有的 `low` 变成了一个 symbol。如果继续训练，就再次回到第 3 步；下一轮的最高频 pair 会是 `("low", "e")`，频次为 2。

**第 7 步：到达设定轮数，返回结果，准备建立词表。**

设置 `num_merges=2`，训练在第二轮后停止，返回最终切分状态和两条规则：

```python
final_vocab, merge_rules = train_bpe(symbol_vocab, num_merges=2)
vocab = build_token_vocab(symbol_vocab, merge_rules)
```

这两行里的 `symbol_vocab` 指第 2 步得到的初始字符表；第 5、6 步展示的是训练函数内部逐轮更新的局部状态。外部保留初始表，最终状态另存为 `final_vocab`，这样建词表时还能取到所有基础字符。

这个例子的基础字符是 `e、l、o、r、s、t、w`，两轮合并新增 `lo` 和 `low`。把它们放在一起，才是后面要分配 token ID 的集合，而不只是最终切分里剩下的几个片段。

把这几步连起来，数据就是这样流动的：

```text
texts：四条原始文本
    │ build_word_counts()
    ↓
word_counts：词 → 出现次数
    │ build_symbol_vocab()
    ↓
symbol_vocab：字符 tuple → 出现次数
    │
    ├─ 保留初始字符表 ──────────────────────────┐
    ↓                                          │
进入 train_bpe()                               │
    │                                          │
    ┌→ count_pair() → pair_counts               │
    │      ↓                                   │
    │  get_best_pair() → best_pair, count       │
    │      ↓                                   │
    │  merge_rules 追加本轮规则                 │
    │      ↓                                   │
    │  merge_pair() → 更新局部 symbol_vocab     │
    │      ↓                                   │
    └─ 继续下一轮；达到轮数或无 pair 时停止     │
           ↓                                   │
    返回 final_vocab、merge_rules              │
           │                   │               │
           │                   └───────────────┤
           ↓                                   ↓
    观察最终切分状态                 build_token_vocab()
                                               ↓
                                     vocab：token → ID
```

## 相邻 pair 的频率怎样计算

有了 `symbol_vocab`，第一步就是枚举每条序列里的相邻位置。`("t", "h", "e")` 包含 `("t", "h")` 和 `("h", "e")` 两个 pair；长度为一个 symbol 的序列没有相邻 pair，自然不会贡献新的候选。

```python
def count_pair(symbol_vocab):
    pair_counts = Counter()
    for symbols, count in symbol_vocab.items():
        for i in range(len(symbols) - 1):
            pair = (symbols[i], symbols[i + 1])
            pair_counts[pair] += count
    return pair_counts
```

关键是 `+= count`。如果 `the` 在语料中出现 100 次，那么它里面的 `(t, h)` 就应该贡献 100 次，而不是只贡献一次。我们在上一阶段压缩了重复文本，现在必须通过权重把这些重复计算回来。如果同一条符号序列中有多个相同的相邻 pair，循环也会把每个位置分别计入。

统计完成后，`get_best_pair()` 使用 `pair_counts.most_common(1)[0]` 取出最高频候选。它返回的是 `(pair, count)`，例如 `(("t", "h"), 327)`，所以调用时写成 `best_pair, count = get_best_pair(pair_counts)`。我曾把整个返回值误当成 pair，修正时将 pair 和频次分别解包。

## 选中一对之后，怎样执行合并

`merge_pair(symbol_vocab, pair)` 把选中的规则应用到全部训练序列。假设选中 `(t, h)`，那么 `("t", "h", "e")` 会变成 `("th", "e")`，对应的语料频次仍然保留。

实现时从左到右扫描，每次检查当前位置和下一位置。如果恰好匹配 `left` 与 `right`，就写入拼接后的 symbol，并前进两格；否则保留当前位置，只前进一格。

```python
if i < len(symbols) - 1 and symbols[i] == left and symbols[i + 1] == right:
    new_symbol.append(left + right)
    i += 2
else:
    new_symbol.append(symbols[i])
    i += 1
```

一次扫描中采用不重叠的合并。例如对 `a a a` 应用 `(a, a)`，会先得到 `aa a`，中间那个 `a` 不会再参与第二次合并。早期曾因提前移动索引而触发 `IndexError`，后来改为先读取和处理当前位置，再递增索引。

完成一条序列后，把新的 tuple 和原有频次写入新的 `Counter`。当前实现使用 `+= count` 汇总结果，并返回新的训练状态，交给下一轮统计。

## 把统计、选择和合并接成训练循环

有了统计、选择和合并这几个函数，`train_bpe(symbol_vocab, num_merges)` 就可以把它们接成一个循环。每轮重新统计 pair，选出最高频的一对，记下规则，再更新切分结果。达到设定轮数就停下来；如果中途已经没有相邻 pair，也就没有什么可合并了。

```text
当前 symbol_vocab
    ↓
count_pair：统计相邻组合
    ↓
get_best_pair：选择最高频候选
    ↓
记录 merge rule，并调用 merge_pair
    ↓
更新 symbol_vocab，进入下一轮
```

每一轮都必须面对更新后的序列重新统计。比如 `p r e a c h e r` 中的 `h e` 合成 `he` 后，末尾原来的 `(e, r)` 变成了 `(he, r)`；新 symbol 的出现改变了邻接关系。不能只在训练开始时排一次频率榜，然后照着旧榜单连续合并。

每轮都重新扫描全部序列，序列越多、合并轮数越大，训练耗时也越长。

循环结束后，留下两份结果：`final_vocab` 里能看到训练文本最后被切成了什么样，`merge_rules` 则记下了整个合并过程。之后遇到新文本，就要用这些规则来分词。

## 从统计结果中看到词的结构

用少量 EWT 文本训练后，规则中出现了 `t + h`、`th + e`、`i + n`、`in + g`。继续合并，还能看到 `kill + ed -> killed`，或者 `I + r -> Ir`、`Ir + a -> Ira`、`Ira + q -> Iraq`。

看到 `i + n` 后面接着 `in + g`，就能认出熟悉的 `ing` 了。`Iraq` 也是这样一点点拼出来的：代码里没有专门写这些词，语料中反复相邻的片段经过几轮合并，自己出现在了结果里。

# 三、构建词表与 Token ID 映射

## 分清训练状态和模型词表

训练跑完，接下来该给 token 编号了。不过 `final_vocab` 里存的还是各个词的切分结果。例如 `Counter({("the",): 31, ("A", "m", "er", "ic", "an"): 1})`，能看出 `the` 已经合成一块，`American` 还分成五块，右边保留着各自的频次。

要送进模型，还得把可能用到的 token 收集起来，每个分配一个整数 ID，单独建成 `vocab`。这也是最初容易混淆的地方：训练后的切分表和供模型查 ID 的词表，存的东西并不相同。

三个变量分别保存以下数据：

| 变量 | 保存的内容 | 用途 |
|---|---|---|
| `symbol_vocab` | 初始字符序列及频次 | 开始训练，并提供基础字符集合 |
| `final_vocab` | 训练结束后的切分序列及频次 | 检查训练结果 |
| `vocab` | token 到整数 ID 的映射 | 编码模型输入 |

入口中曾用训练结果覆盖了原始 `symbol_vocab`，导致后面建词表时拿错数据。现在分别接收为 `final_vocab, merge_rules`，保留初始字符状态，再交给 `build_token_vocab()`，就能避免把不同用途的数据混在一起。

## 为什么词表要包含中间合并产物

只收集 `final_vocab` 里剩下的片段还不够。假设训练先学到 `h + e -> he`，再学到 `t + he -> the`。在训练结束的某些序列中，`he` 已经被进一步合并成 `the`，因此未必还以独立片段出现。

但推理时遇到 `hero`，第一条规则仍然可能把开头合成 `he`。如果没有其他适用规则，最终输出就会包含这个 token。词表如果只保留最终训练状态里还能看见的片段，就可能漏掉这种仍然有效的中间产物。

所以，当前 `build_token_vocab(symbol_vocab, merge_rules)` 收集两类内容：训练中出现过的所有基础字符，以及每条合并规则产生的新 symbol。基础字符负责容纳没有被继续合并的位置，中间与最终合并产物负责容纳规则可能生成的片段。

实现上先用 set 去重，再用 `sorted(tokens)` 排序，按顺序从 0 开始分配 ID。同一 token 集合会得到相同的编号。

## Token ID 怎样接到 Embedding

词表建好以后，每个片段就有了自己的编号。比如这次训练的结果里，`the` 对应 530，前面带空格的 `Ġthe` 对应 1039。

后面的模型接收到 ID 530，会用它选择 Embedding 矩阵中的相应一行。那一行是可以在模型训练中更新的向量，语义和上下文关系体现在向量及后续计算中。

`build_id_to_token(vocab)` 把映射反转为 `id -> token`，用于查看编码结果，或者把模型输出的 ID 转回文本片段。它可以由 `vocab` 完整推导出来，因此没有必要在保存文件里再维护一份重复数据。

# 四、推理阶段的分词与编解码

## 用学好的规则处理新文本

规则学好以后，就可以拿一句新文本试试了。这时直接按 `merge_rules` 里的顺序合并，沿用训练得到的切分方式。

单个文本块由 `tokenize_word(word, merge_rules)` 处理。它先把输入拆回字符列表，然后按照训练顺序，逐条扫描并应用合并规则。假设只有 `t + h -> th` 和 `th + e -> the` 两条相关规则，`there` 的变化是：

```text
t h e r e  →  th e r e  →  the r e
```

最终得到 `["the", "r", "e"]`。训练时，一条规则应用到整个语料状态；推理时，一组固定规则应用到当前输入。两者复用的是同一种局部合并操作，区别在于规则从哪里来、要处理多少数据。

规则顺序不能随意交换。如果先检查 `th + e`，此时 `th` 尚未形成，这一步就无法生效；之后即使合成 `th`，当前这遍执行也不会自动回到前面重做。因此 `merge_rules` 必须按顺序保存和加载，不能转成无序集合。

这里曾把参数拼成 `merge_ruless`，函数内部却读取全局的 `merge_rules`，导致传入参数没有生效。修正拼写后，函数使用传入的规则。

## 从一个文本块扩展到整句编码

一个文本块能处理了，整句也就可以接起来了。`tokenize(text, merge_rules)` 先用前面的 `pre_tokenize()` 切句子，再把每一块交给 `tokenize_word()`，最后把返回的 token 接成一个列表。空格标记和块的边界都沿用训练时的处理方式。

例如 `"Hi, I'm here."` 先变成 `["Hi", ",", "ĠI'm", "Ġhere", "."]`，然后每一块各自应用 BPE。最终一个块可能对应一个 token，也可能保留成多个较短片段，具体取决于训练得到的规则。

`encode(text, merge_rules, vocab)` 在此基础上再做一次查表：对每个输出 token 取 `vocab[token]`，得到整数列表。这串 ID 随后用于 Embedding 查表。

## 把 token 还原成文本

切完以后，也可以反过来拼回句子。前面用 `Ġ` 记住了空格的位置，这里先把 token 连起来，再把标记换回空格就行：

```python
def detokenize(tokens):
    text = "".join(tokens)
    return text.replace("Ġ", " ")
```

这里不能使用 `" ".join(tokens)`，因为 token 可能只是单词的一部分，片段之间并不都对应空格。例如 `the`、`r`、`e` 应该拼回 `there`，而不是插入新的词间边界。

如果手里拿到的是 ID，则先通过 `id_to_token` 查回片段，再调用 `detokenize()`。

预处理把文本块前的连续空白记成一个 `Ġ`，解码后统一变成一个普通空格，尾部空白则会丢失。原文中的字面字符 `Ġ` 也会被替换为空格。

# 五、保存与加载：让 tokenizer 成为固定的模型输入接口

## 为什么训练结果需要固定下来

分词和编号都跑通了，最后还得把训练结果存下来。后面的模型会按 ID 去查 Embedding：假如训练时 `the` 对应 530，重新建词表后却变成了 617，同一个词就会取到另一行向量，和已经训练好的参数对不上了。

所以后续训练和推理都加载同一份规则和词表，也省得每次运行都把 BPE 重新训练一遍。

当前需要保存的核心数据只有 `merge_rules` 和 `vocab`：前者决定如何合并，后者决定合并后的片段映射到哪个 ID。训练结束的 `final_vocab` 可以用于分析，却不是推理必需数据；反向映射则能从 `vocab` 重建。

## 用 JSON 保存规则和词表

规则和词表都是现成的 Python 对象，用 JSON 存下来就够了。文件放在 `checkpoints/tokenizer.json`，里面大致是下面的样子，这里只取几项：

```json
{
  "merge_rules": [["Ġ", "t"], ["Ġ", "a"], ["h", "e"]],
  "vocab": {"a": 115, "the": 530, "Ġthe": 1039}
}
```

`save_tokenizer(path, merge_rules, vocab)` 将规则和词表放入字典，通过 `Path(path).parent.mkdir(parents=True, exist_ok=True)` 创建目录，再用 `with open(...)` 打开文件，以 UTF-8 写入 JSON。写文件用 `json.dump()`，`json.dumps()` 返回的是字符串。

加载时由 `json.load()` 读取对象，再取回规则和词表。保存时使用 `ensure_ascii=False`，可以让文件中的 `Ġ` 等字符直接显示出来，方便检查；缩进则让手动查看规则和 ID 时不必面对一整行内容。

JSON 这里曾经报过 tuple 相关的错，原因是把 tuple 当作对象的键来保存。规则列表里的 tuple 可以作为数组元素序列化，只是读回来会变成 list，所以加载函数再用 `tuple(pair)` 恢复即可。

## 加载后接回同一条推理路径

下次运行时，`load_tokenizer(path)` 把 `merge_rules` 和 `vocab` 读回来，再交给 `encode()` 就能继续编码。需要查看 ID 对应的文本时，用 `build_id_to_token(vocab)` 把反向映射建起来即可。

JSON 保存规则和词表，预切分正则及 `Ġ` 的处理仍由 `pre_tokenize()` 决定。加载文件后，继续使用训练时的预处理函数。

# 六、当前实现、完整代码与扩展方向

## 这次实验得到的结果

前面的小例子只跑了两轮。正式训练时，取 EWT 训练集前 10000 条文本，也就是 `get_raw_texts("train")[:10000]`，把合并次数设为 1000，最后得到了 1108 个 token，编号从 0 到 1107。

词表中同时存在字符、常见字符组合、词缀、短词和高频完整词，也包含带空格标记的形式。其中有 `the`、`Ġthe`、`ing`、`ation`、`ĠAmerican`、`ĠIraq`、`ĠUnited`、`ĠStates`、`Ġpeople` 和 `Ġbecause`。

高频片段经过合并，可以用一个 token 表示；较少见的组合则由几个更短的 token 拼起来。

## 把训练和使用两条流程接起来

训练从语料中生成规则和词表，编码时加载它们，将新文本转换为 ID：

```text
训练：
原始语料 → 预切分与空格标记 → 文本块频次 → 字符序列及频次
        → 统计 pair、迭代合并 → 有序规则 + token 词表 → 保存

使用：
加载规则与词表 → 新文本 → 同样的预切分 → 按规则合并
              → token 列表 → token IDs → Embedding

还原：
token IDs → 反向词表 → token 列表 → 拼接并恢复空格标记
```

Tiny Transformer 接收 token ID，查 Embedding 得到向量，再进入 Attention 和 MLP。

## 后续方向：从 Unicode 字符走向 byte-level BPE

这版还有一个接下来可以改的地方：基础字符都是从训练语料里收集的，遇到一个从没见过的字符怎么办？它不在 `vocab` 里，`encode()` 又直接用 `vocab[token]` 查表，于是就会报错。

一种更通用的方向是把输入转换为 UTF-8 bytes，固定以 0 到 255 共 256 种 byte 作为基础单位。例如“我”的 UTF-8 表示是 `E6 88 91`，可以先表示为三个基础 byte，再由 BPE 学习如何合并。这样基础表示不再依赖训练集中是否见过某个完整字符，英文、中文、其他文字和 emoji 都有对应的字节序列。

Byte 版本仍然统计相邻 pair 并迭代合并，symbol 改用字节序列，解码时将合并后的 bytes 拼回 UTF-8 文本。要同时保留换行和连续空格，还需要让这些空白字符的 bytes 直接参与编码。

## 代码

`dataset.py`
```python
from datasets import load_dataset


def load_ewt():
    return load_dataset(
        "universal-dependencies/universal_dependencies",
        "en_ewt",
        revision="2.18",
    )


def get_raw_texts(split="train"):
    dataset = load_ewt()[split]

    return [
        example["text"]
        for example in dataset
        if example["text"]
    ]


if __name__ == "__main__":
    dataset = load_ewt()

    print(dataset)

    sample = dataset["train"][0]

    print("\nText:")
    print(sample["text"])

    print("\nTokens:")
    print(sample["tokens"])

    print("\nUPOS:")
    print(sample["upos"])

    print("\nDependency relations:")
    print(sample["deprel"])
```

`tokenizer.py`
```python
from collections import Counter
from latent_language_lab.dataset import get_raw_texts
import re
import json
from pathlib import Path


# BPE 之前的初步切分：分开单词和标点，但保留 I'm / It's 这种缩写，并且保留空格
def pre_tokenize(text):

    tokens = []

    # \w+ : 连续单词字符，比如Hi
    # (?:'\w+)? ：  ' + 一串连续单词字符，比如It's
    # [^\w\s] : 既不是\w单词，也不是\s空白字符的，也就是标点符号
    # 找出所有满足正则规则的字符

    matches = re.finditer(r"\w+(?:'\w+)?|[^\w\s]", text)

    # 遍历每一个切分出来的字符串
    for match in matches:
        # 获取字符串本身
        token = match.group()
        # 获取开始字符的索引位置
        start = match.start()

        # 如果原文中这个词前面是空格，前面就加个特殊字符用来表示这里有个空格
        if start > 0 and text[start - 1].isspace():
            token = "Ġ" + token

        tokens.append(token)

    return tokens

# 统计单词出现频次
def build_word_counts(texts):
    word_counts = Counter()

    # 从字符串列表中取出每个字符串
    for text in texts:
        # words = text.split()
        words = pre_tokenize(text)

        # 统计每个字符串的单词频次
        for word in words:
            word_counts[word] += 1

    return word_counts

# 把 abc:1 拆成 "a","b","c":1
def build_symbol_vocab(word_counts):
    symbol_vocab = Counter()

    for word, count in word_counts.items():
        symbol_vocab[tuple(word)] = count

    return symbol_vocab

# 统计相邻字母结合后出现频次
def count_pair(symbol_vocab):
    pair_counts = Counter()

    for symbols, count in symbol_vocab.items():
        for i in range(len(symbols) - 1):
            pair = (symbols[i], symbols[i + 1])
            pair_counts[pair] += count

    return pair_counts

# 找出频次最高的组合
def get_best_pair(pair_counts):
    return pair_counts.most_common(1)[0]


# 合并组合
def merge_pair(symbol_vocab, pair):
    new_vocab = Counter()

    left, right = pair
    merged_pair = left + right

    for symbols, count in symbol_vocab.items():
        i = 0
        new_symbol = []
        while i < len(symbols):
            if (
                i < len(symbols) - 1
                and symbols[i] == left and symbols[i + 1] == right
                ):
                new_symbol.append(merged_pair)
                i += 2
            else:
                new_symbol.append(symbols[i])
                i += 1
        new_vocab[tuple(new_symbol)] += count

    return new_vocab

# 训练BPE，每轮合并出现频次最高的相邻组合，然后放回去作为下一轮的初始状态
def train_bpe(symbol_vocab, num_merges):
    # 每一轮的最高频次组合记录
    merge_rules = []

    for step in range(num_merges):
        pair_counts = count_pair(symbol_vocab)

        if not pair_counts:
            break

        best_pair, count = get_best_pair(pair_counts)

        merge_rules.append(best_pair)

        symbol_vocab = merge_pair(symbol_vocab, best_pair)

        print(
            f"step: {step + 1} / {num_merges},"
            f"best pair -> {best_pair}, count:{count}"
        )

    return symbol_vocab, merge_rules

# 把所有基础字符和训练过程中所有的最佳切分都收集起来，然后给他们分配唯一id，token -> id
def build_token_vocab(symbol_vocab, merge_rules):
    tokens = set()

    for symbols in symbol_vocab:
        for symbol in symbols:
            tokens.add(symbol)

    for left, right in merge_rules:
        tokens.add(left + right)

    # 给每一个token分配一个唯一的id
    vocab = {}

    for token_id, token in enumerate(sorted(tokens)):
        vocab[token] = token_id

    return vocab


# id -> token
def build_id_to_token(vocab):
    id_to_token = {}

    for token, token_id in vocab.items():
        id_to_token[token_id] = token
    return id_to_token


# 推理，按照训练的规则来划分词
def tokenize_word(word, merge_rules):
    symbols = list(word)

    for left, right in merge_rules:
        # 等等可能被合并的新token
        new_symbol = []
        i = 0

        while i < len(symbols):
            if ( i < len(symbols) - 1
                 and left == symbols[i] and right == symbols[i + 1]):
                merged = left + right
                new_symbol.append(merged)
                i += 2
            else:
                new_symbol.append(symbols[i])
                i += 1

        # 更新局部分好的内容，下一轮继续分
        symbols = new_symbol

    return symbols

# 切句子
def tokenize(words, merge_rules):
    tokens = []

    # 按照标点和空格先切开
    words = pre_tokenize(words)

    # 把切开的每一个部分再tokenize
    for word in words:
        word_token = tokenize_word(word, merge_rules)
        tokens.extend(word_token)

    return tokens


# tokens -> text
def detokenize(tokens):
    text = "".join(tokens)
    # 把特殊字符恢复回空格
    text = text.replace("Ġ", " ")
    return text


def encode(text, merge_rules, vocab):
    tokens = tokenize(text, merge_rules)

    token_ids = []

    for token in tokens:
        token_id = vocab[token]
        token_ids.append(token_id)

    return token_ids


# 保存训练规则和词表到path
def save_tokenizer(path, merge_rules, vocab):
    data = {
        "merge_rules": merge_rules,
        "vocab": vocab,
    }

    path = Path(path)

    # 目录不存在就创建
    path.parent.mkdir(exist_ok=True, parents=True)

    # 把data覆盖写入对应文件f中
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# 加载训练规则和词表
def load_tokenizer(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    merge_rules = [
        tuple(pair)
        for pair in data["merge_rules"]
    ]

    vocab = data["vocab"]

    return merge_rules, vocab


def test_train(nums):
    text = get_raw_texts("train")[:nums]

    word_counts = build_word_counts(text)
    symbol_vocab = build_symbol_vocab(word_counts)

    final_vocab, merge_rules = train_bpe(symbol_vocab, num_merges=1000)

    # print("\nmerge rule:")
    # print(merge_rules)

    # print("\nfinal vocab:")
    # print(final_vocab)

    vocab = build_token_vocab(symbol_vocab, merge_rules)

    # print(vocab)

    id_to_token = build_id_to_token(vocab)

    # print(id_to_token)
    return merge_rules, final_vocab, vocab


if __name__ == "__main__":

    #test_words = "Hi, I'm here. It's a nice place, right?"
    #merge_rules, final_vocab, vocab = test_train(50)
    # print(final_vocab)
    # tokens = tokenize(test_words, merge_rules)
    # print(tokens)
    # print(detokenize(tokens))
    # print(encode(test_words, merge_rules, vocab))

    # words = pre_tokenize(test_word)
    # print(words)

    train_text = get_raw_texts("train")[:10000]
    word_counts = build_word_counts(train_text)
    symbol_vocab = build_symbol_vocab(word_counts)
    final_vocab, merge_rules = train_bpe(symbol_vocab, 1000)
    vocab = build_token_vocab(symbol_vocab, merge_rules)
    save_tokenizer("checkpoints/tokenizer.json", merge_rules, vocab)

```
