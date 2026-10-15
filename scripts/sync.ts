import { mkdir } from 'node:fs/promises'
import { chunkMarkdown, extractDescription, extractTitle } from './corpus'
import type { Chunk, Guide } from '../src/types'

const ROOT = 'https://api.github.com/repos/GoogleChrome/modern-web-guidance'
const RAW = 'https://raw.githubusercontent.com/GoogleChrome/modern-web-guidance/main/'
const PREFIX = 'skills/modern-web-guidance/guides/'
const headers: Record<string, string> = {
  'User-Agent': 'modern-web-guidance-mcp-sync',
  Accept: 'application/vnd.github+json',
}
if (Bun.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${Bun.env.GITHUB_TOKEN}`

async function get(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) })
    if (response.ok) return response
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) {
      throw new Error(`HTTP ${response.status}: ${url}`)
    }
    await Bun.sleep(750 * 2 ** attempt)
  }
  throw new Error(`Could not fetch ${url}`)
}

interface GitTree {
  sha: string
  truncated?: boolean
  tree?: { type: string; path: string }[]
}

const tree = await (await get(`${ROOT}/git/trees/main?recursive=1`)).json() as GitTree
if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('Git tree was truncated or malformed')
const paths = tree.tree
  .filter(({ type, path }) => type === 'blob' && path.startsWith(PREFIX) && path.endsWith('.md'))
  .map(({ path }) => path)
  .sort()
if (paths.length < 100) throw new Error(`Too few guides (${paths.length}) — refusing to overwrite corpus`)

const guides: Guide[] = Array(paths.length)
let cursor = 0
async function worker(): Promise<void> {
  while (cursor < paths.length) {
    const index = cursor++
    const path = paths[index]
    const markdown = await (await get(RAW + path.split('/').map(encodeURIComponent).join('/'))).text()
    const category = path.slice(PREFIX.length).split('/')[0]
    const id = path.slice(PREFIX.length).replace(/\.md$/, '').split('/').at(-1)!
    guides[index] = {
      id,
      category,
      title: extractTitle(markdown, path.split('/').at(-1)!),
      description: extractDescription(markdown),
      path,
      url: `https://github.com/GoogleChrome/modern-web-guidance/blob/main/${path}`,
      markdown,
    }
    if ((index + 1) % 25 === 0) console.log(`Fetched ${index + 1} / ${paths.length}`)
  }
}
await Promise.all(Array.from({ length: 6 }, () => worker()))
const unique = new Set(guides.map(guide => guide.id))
if (unique.size !== guides.length) throw new Error('Duplicate guide IDs: change the ID strategy first')
const chunks: Chunk[] = guides.flatMap(({ id, title, category, markdown }) =>
  chunkMarkdown(markdown).map(text => ({ guideId: id, text: `${title} (${category})\n${text}` })))

await mkdir('src/generated', { recursive: true })
await Bun.write('UPSTREAM_LICENSE.txt', await (await get(RAW + 'LICENSE')).text())
await Bun.write('src/generated/guides.gen.ts',
  `import type { Guide } from '../types'\nexport const SOURCE_TREE_SHA = ${JSON.stringify(tree.sha)}\nexport const GUIDES: Guide[] = ${JSON.stringify(guides)}\n`)
await Bun.write('src/generated/chunks.gen.ts',
  `import type { Chunk } from '../types'\nexport const CHUNKS: Chunk[] = ${JSON.stringify(chunks)}\n`)
await Bun.write('src/generated/vectors.gen.ts',
  `// Run bun run embed after each corpus update to regenerate vectors.\nexport const VECTORS: string[] = []\nexport const SCALES: number[] = []\n`)
console.log(`Generated ${guides.length} guides, ${chunks.length} chunks. Upstream tree: ${tree.sha}`)
console.log('Run bun run embed to add semantic vectors (optional).')
