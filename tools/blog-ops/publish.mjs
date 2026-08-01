function quoteCommitMessage(message) {
  return String(message || 'post: update blog').replace(/["\\]/g, '\\$&')
}

export function createPublishPlan({
  message = 'post: update blog'
} = {}) {
  const safeMessage = quoteCommitMessage(message)

  return [
    {
      label: '生成 Hexo baseline',
      command: 'pnpm run legacy:build'
    },
    {
      label: '刷新 Astro legacy pages',
      command: 'pnpm run recovery:prepare-legacy-pages'
    },
    {
      label: '运行测试和维护检查',
      command: 'pnpm run check'
    },
    {
      label: '构建 Astro 静态产物',
      command: 'pnpm run build'
    },
    {
      label: '检查 Git 变更',
      command: 'git status --short'
    },
    {
      label: '暂存文章和兼容页面',
      command: 'git add source/_posts src/legacy/pages'
    },
    {
      label: '提交私有源码仓库',
      command: `git commit -m "${safeMessage}"`
    },
    {
      label: '推送并触发 public 输出仓库部署',
      command: 'git push origin main'
    }
  ]
}
