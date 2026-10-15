import { CHUNKS } from './generated/chunks.gen'
import { GUIDES } from './generated/guides.gen'
import { VECTORS, SCALES } from './generated/vectors.gen'
import type { Env, Guide } from './types'

export interface SearchHit {
  id: string
  category: string
  title: string
  description: string
  url: string
  preview: string
  retrievalScore: number
}

export interface SearchResponse {
  query: string
  mode: 'hybrid' | 'bm25'
  matches: SearchHit[]
  corpusCount: number
}

function tokenize(text: string): string[] {
  const result: string[] = []
  const groups = text.normalize('NFKC').toLowerCase()
    .match(/[a-z0-9]+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) ?? []
  for (const group of groups) {
    if (/^[a-z0-9]+$/.test(group)) {
      if (group.length > 1) result.push(group)
    } else if (group.length === 1) {
      result.push(group)
    } else {
      result.push(group)
      for (let i = 0; i < group.length - 1; i++) result.push(group.slice(i, i + 2))
    }
  }
  return result
}

type DocTerms = { counts: Map<string, number>; length: number }
let lexicalIndex: { docs: DocTerms[]; df: Map<string, number>; avgLength: number } | undefined
function indexCorpus() {
  if (lexicalIndex) return lexicalIndex
  const metadata = new Map(GUIDES.map(g => [g.id, `${g.title} ${g.title} ${g.category} ${g.description}`]))
  const docs = CHUNKS.map(({ guideId, text }) => {
    const terms = tokenize(`${metadata.get(guideId) ?? ''} ${text}`)
    const counts = new Map<string, number>()
    for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1)
    return { counts, length: terms.length }
  })
  const df = new Map<string, number>()
  for (const doc of docs) for (const t of doc.counts.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  lexicalIndex = {
    docs, df,
    avgLength: docs.reduce((s, d) => s + d.length, 0) / (docs.length || 1),
  }
  return lexicalIndex
}

function lexicalSearch(query: string, count = 100): { idx: number; score: number }[] {
  const { docs, df, avgLength } = indexCorpus()
  const terms = [...new Set(tokenize(query))]
  const scores: { idx: number; score: number }[] = []
  for (let idx = 0; idx < docs.length; idx++) {
    const doc = docs[idx]
    let score = 0
    for (const term of terms) {
      const freq = doc.counts.get(term) ?? 0
      if (!freq) continue
      const idf = Math.log(1 + ((docs.length - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5)))
      score += idf * freq * 2.2 / (freq + 1.2 * (0.25 + 0.75 * doc.length / avgLength))
    }
    if (score > 0) scores.push({ idx, score })
  }
  return scores.sort((a, b) => b.score - a.score).slice(0, count)
}

let decodedVectors: Uint8Array[] | undefined
function cachedVectors(): Uint8Array[] {
  if (decodedVectors) return decodedVectors
  decodedVectors = VECTORS.map(v => Uint8Array.from(atob(v), c => c.charCodeAt(0)))
  return decodedVectors
}

async function semanticSearch(query: string, env: Env, count = 100): Promise<{ idx: number; score: number }[]> {
  if (!env.AI || (VECTORS.length !== CHUNKS.length || SCALES.length !== CHUNKS.length) || !CHUNKS.length) return []
  const { data } = await env.AI.run('@cf/qwen/qwen3-embedding-0.6b', { text: [query] })
  const input = data?.[0]
  if (!input?.length) throw new Error('Workers AI returned no embedding')
  const norm = Math.hypot(...input) || 1
  const vectors = cachedVectors()
  const results: { idx: number; score: number }[] = []
  for (let idx = 0; idx < vectors.length; idx++) {
    const vector = vectors[idx]
    if (vector.length !== input.length) continue
    let dot = 0
    for (let i = 0; i < vector.length; i++) dot += (vector[i] - 128) * input[i]
    results.push({ idx, score: dot * SCALES[idx] / (norm * 127) })
  }
  return results.sort((a, b) => b.score - a.score).slice(0, count)
}

function combineRanks(lexical: { idx: number; score: number }[], semantic: { idx: number; score: number }[]) {
  const ranked = new Map<number, number>()
  for (const [rank, hit] of lexical.entries()) ranked.set(hit.idx, (ranked.get(hit.idx) ?? 0) + 1 / (60 + rank + 1))
  for (const [rank, hit] of semantic.entries()) ranked.set(hit.idx, (ranked.get(hit.idx) ?? 0) + 1 / (60 + rank + 1))
  return [...ranked].map(([idx, score]) => ({ idx, score }))
    .sort((a, b) => b.score - a.score)
}

const guideById = new Map<string, Guide>(GUIDES.map(g => [g.id, g]))
export function getGuide(id: string) {
  return guideById.get(id)
}

export async function search(query: string, env: Env, limit = 5): Promise<SearchResponse> {
  if (!CHUNKS.length) {
    return { query, mode: 'bm25', corpusCount: GUIDES.length, matches: [] }
  }
  const lex = lexicalSearch(query)
  let semantic: { idx: number; score: number }[] = []
  try { semantic = await semanticSearch(query, env) }
  catch (error) { console.warn('Embedding failed, falling back to BM25:', String(error)) }
  const combined = combineRanks(lex, semantic)
  const candidateCount = Math.min(15, Math.max(limit * 3, 10))
  const seen = new Set<string>()
  const matches: SearchHit[] = []
  for (const { idx, score } of combined) {
    const chunk = CHUNKS[idx]
    if (seen.has(chunk.guideId)) continue
    const guide = getGuide(chunk.guideId)
    if (!guide) continue
    seen.add(chunk.guideId)
    matches.push({
      id: guide.id, title: guide.title, category: guide.category,
      description: guide.description, url: guide.url,
      preview: chunk.text.slice(0, 1200),
      retrievalScore: Number(score.toFixed(6)),
    })
    if (matches.length >= candidateCount) break
  }
  return {
    query,
    corpusCount: GUIDES.length,
    mode: semantic.length ? 'hybrid' : 'bm25',
    matches: matches.slice(0, limit).map(m => ({ ...m, preview: m.preview.slice(0, 450) })),
  }
}
