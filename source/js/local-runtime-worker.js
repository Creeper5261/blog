const cancelled = new Set()

function send(message) {
  self.postMessage(message)
}

function progress(id, value, label) {
  send({ type: 'progress', id, value, label })
}

function assertNotCancelled(id) {
  if (cancelled.has(id)) {
    cancelled.delete(id)
    throw new DOMException('任务已取消', 'AbortError')
  }
}

function formatJson(id, input) {
  const text = String(input ?? '')
  progress(id, 0.1, '读取输入')
  assertNotCancelled(id)
  const value = JSON.parse(text)
  progress(id, 0.65, '格式化 JSON')
  assertNotCancelled(id)
  const output = JSON.stringify(value, null, 2)
  progress(id, 1, '完成')
  return { output, bytes: new TextEncoder().encode(output).byteLength }
}

function stateStep(id, state, action) {
  const items = Array.isArray(state?.items) ? [...state.items] : []
  progress(id, 0.25, '准备状态')
  assertNotCancelled(id)
  if (action === 'enqueue') items.push(`项目 ${items.length + 1}`)
  if (action === 'dequeue') items.shift()
  progress(id, 0.75, '应用状态变更')
  assertNotCancelled(id)
  progress(id, 1, '完成')
  return { items, action }
}

self.onmessage = (event) => {
  const message = event.data ?? {}
  if (message.type === 'cancel') {
    cancelled.add(message.id)
    return
  }
  if (message.type !== 'run' || !message.id) return

  try {
    const result = message.task === 'format-json'
      ? formatJson(message.id, message.input)
      : message.task === 'state-step'
        ? stateStep(message.id, message.state, message.action)
        : (() => { throw new Error(`未知任务：${message.task}`) })()
    send({ type: 'result', id: message.id, result })
  } catch (error) {
    send({ type: 'error', id: message.id, name: error.name, message: error.message })
  }
}
