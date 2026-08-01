const API_VERSION = '2022-11-28'

export async function fetchGitHubRepositories(descriptor, {
  fetchImpl = globalThis.fetch,
  token = process.env.GITHUB_TOKEN
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('GitHub adapter requires fetch')

  const url = new URL('https://api.github.com/search/repositories')
  url.searchParams.set('q', descriptor.query)
  url.searchParams.set('sort', 'stars')
  url.searchParams.set('order', 'desc')
  url.searchParams.set('per_page', String(Math.min(descriptor.itemLimit ?? 20, 100)))
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'creeper5261-pulse-snapshot',
    'X-GitHub-Api-Version': API_VERSION
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetchImpl(url, { headers })
  if (!response.ok) throw new Error(`GitHub repository search failed with HTTP ${response.status}`)
  const payload = await response.json()
  if (!Array.isArray(payload.items)) throw new Error('GitHub repository search returned an invalid payload')

  return {
    sortBasis: { field: 'stars', direction: 'descending' },
    items: payload.items.map((repository) => ({
      id: repository.full_name ? `github:${repository.full_name}` : '',
      title: repository.full_name,
      url: repository.html_url,
      source: 'github',
      summary: repository.description ?? '',
      score: repository.stargazers_count
    }))
  }
}
