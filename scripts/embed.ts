import { CHUNKS } from '../src/generated/chunks.gen'

const account = Bun.env.CLOUDFLARE_ACCOUNT_ID
const token = Bun.env.CLOUDFLARE_API_TOKEN
if (!account || !token) throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN')
if (!CHUNKS.length) throw new Error('No chunks. Run bun run sync first.')

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/@cf/qwen/qwen3-embedding-0.6b`
const vectors: string[] = []
const scales: number[] = []
for (let i = 0; i < CHUNKS.length; i += 16) {
  const batch = CHUNKS.slice(i, i + 16).map(({ text }) => text.slice(0, 1800))
  let data: number[][] | undefined
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: batch }),
      signal: AbortSignal.timeout(60000),
    })
    if (response.ok) {
      const json = await response.json() as { result?: { data?: number[][] } }
      data = json.result?.data
      if (!Array.isArray(data) || data.length !== batch.length) {
        throw new Error(`Unexpected response shape: ${JSON.stringify(json).slice(0, 500)}`)
      }
      break
    }
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) {
      throw new Error(`Embedding API ${response.status}: ${(await response.text()).slice(0, 250)}`)
    }
    await Bun.sleep(1200 * 2 ** attempt)
  }
  for (const vector of data ?? []) {
    if (!Array.isArray(vector) || vector.length !== 1024) throw new Error('Expected 1024-dimensional qwen3-embedding-0.6b vector')
    const norm = Math.hypot(...vector) || 1
    const normalized = vector.map(value => value / norm)
    const scale = Math.max(...normalized.map(Math.abs)) || 1
    const bytes = Uint8Array.from(normalized.map(value => Math.round(value / scale * 127) + 128))
    vectors.push(btoa(String.fromCharCode(...bytes)))
    scales.push(scale)
  }
  console.log(`Embedded ${vectors.length} / ${CHUNKS.length}`)
}
await Bun.write('src/generated/vectors.gen.ts',
  `// Aligned with CHUNKS; quantized qwen3-embedding-0.6b vectors, base64 int8+128 and scales.\nexport const VECTORS: string[] = ${JSON.stringify(vectors)}\nexport const SCALES: number[] = ${JSON.stringify(scales)}\n`)
console.log(`Wrote ${vectors.length} vectors to src/generated/vectors.gen.ts`)
