export const SITE_ROUTES = [
  { id: 'site.home', title: '首页', route: '/', kind: 'home' },
  { id: 'site.explore', title: '主题探索', route: '/explore/', kind: 'explore' },
  { id: 'site.topics', title: '主题展厅', route: '/topics/', kind: 'topics' },
  { id: 'site.tools', title: '工具目录', route: '/tools/', kind: 'tools' },
  { id: 'site.lab', title: '本地实验台', route: '/lab/', kind: 'lab' },
  { id: 'site.pulse', title: 'Pulse 热点快照', route: '/pulse/', kind: 'pulse' },
  { id: 'site.explain', title: '可执行解释层', route: '/explain/', kind: 'explain' },
  { id: 'site.knowledge-data', title: 'site-data 检视器', route: '/knowledge-data/', kind: 'knowledge-data' }
]

export function buildRoutesPayload(toolManifests) {
  const items = [
    ...SITE_ROUTES.map((route) => ({ ...route, source: 'site-routes' })),
    ...(toolManifests.tools ?? []).map((tool) => ({
      id: tool.id,
      title: tool.title,
      route: tool.route,
      kind: 'tool',
      source: 'tool-manifest'
    }))
  ].sort((left, right) => left.route.localeCompare(right.route) || left.id.localeCompare(right.id))
  return { schemaVersion: 1, items }
}
