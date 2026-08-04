export const TOOL_MANIFESTS = [
  {
    schemaVersion: 1,
    id: 'tool.local-json',
    title: 'JSON 格式化',
    route: '/tools/local-json/',
    task: 'format-json',
    input: { kinds: ['application/json', 'text/json'], maxBytes: 2097152 },
    output: { kinds: ['application/json'], download: true },
    privacy: { mode: 'local-only', uploads: false, thirdPartyProcessing: false },
    offline: { supported: true, requirements: ['versioned-runtime-cache', 'browser-storage'] },
    runtime: { shell: 's3-local-task-runner', worker: true, mainThreadFallback: true },
    accessibility: { staticDescription: true, statusRole: 'status', keyboardDropzone: true }
  },
  {
    schemaVersion: 1,
    id: 'tool.sha256',
    title: 'SHA-256',
    route: '/tools/sha256/',
    task: 'hash-sha256',
    input: { kinds: ['text/plain'], maxBytes: 2097152 },
    output: { kinds: ['text/plain'], download: true },
    privacy: { mode: 'local-only', uploads: false, thirdPartyProcessing: false },
    offline: { supported: true, requirements: ['versioned-runtime-cache', 'browser-storage'] },
    runtime: { shell: 's3-local-task-runner', worker: true, mainThreadFallback: true },
    accessibility: { staticDescription: true, statusRole: 'status', keyboardDropzone: true }
  }
]

export function buildToolManifestPayload() {
  return { schemaVersion: 1, tools: TOOL_MANIFESTS }
}
