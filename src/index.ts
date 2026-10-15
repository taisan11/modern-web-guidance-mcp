import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import { GUIDES, SOURCE_TREE_SHA } from './generated/guides.gen'
import { getGuide, search } from './search'
import type { Env } from './types'

function mcpServer(env: Env) {
  const server = new McpServer({ name: 'modern-web-guidance', version: '0.2.0' })

  server.registerTool('search', {
    title: 'Search modern web guidance',
    description: 'Search Google Chrome Modern Web Guidance for browser APIs, progressive enhancement, CSS, HTML, JavaScript, accessibility and performance practices. Returns IDs; use retrieve to read an entire guide. Uses embedded BM25/vector search.',
    inputSchema: z.object({
      query: z.string().trim().min(2).max(500).describe('Question or technology to look up, in any language'),
      limit: z.number().int().min(1).max(10).default(5),
    }),
  }, async ({ query, limit }) => {
    const result = await search(query, env, limit)
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  })

  server.registerTool('list', {
    title: 'List modern web guidance',
    description: 'List guide metadata from the bundled corpus, optionally filtered by category. Results are paginated; use retrieve to read a guide.',
    inputSchema: z.object({
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(100).default(50),
      category: z.string().trim().min(1).max(80).optional().describe('Exact category name, such as accessibility or performance'),
    }),
  }, async ({ offset, limit, category }) => {
    const categories = [...new Set(GUIDES.map(guide => guide.category))].sort()
    const filtered = category
      ? GUIDES.filter(guide => guide.category.toLowerCase() === category.toLowerCase())
      : GUIDES
    const guides = filtered.slice(offset, offset + limit).map(({ id, category, title, description, url }) => ({
      id, category, title, description, url,
    }))
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ total: filtered.length, offset, limit, category: category ?? null, categories, guides }),
      }],
    }
  })

  server.registerTool('retrieve', {
    title: 'Retrieve an entire modern web guide',
    description: 'Return the complete Markdown source of a matching guide by exact ID from search results, with canonical upstream URL.',
    inputSchema: z.object({
      id: z.string().min(1).max(150).describe('Guide id as returned by search'),
    }),
  }, async ({ id }) => {
    const guide = getGuide(id)
    if (!guide) return { isError: true, content: [{ type: 'text', text: `Guide not found: ${id}` }] }
    return {
      content: [{ type: 'text', text: `Source: ${guide.url}\nGuide ID: ${guide.id}\n\n${guide.markdown}` }],
    }
  })
  return server
}

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers })
}

async function handleMcp(request: Request, env: Env): Promise<Response> {
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(request.url).hostname)
  if (!env.MCP_TOKEN && !local) return json({ error: 'Set MCP_TOKEN in the environment' }, 503)
  if (env.MCP_TOKEN && request.headers.get('Authorization') !== `Bearer ${env.MCP_TOKEN}`) {
    return json({ error: 'Unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' })
  }
  if (Number(request.headers.get('Content-Length') ?? 0) > 65536) {
    return json({ error: 'Request too large' }, 413)
  }
  const raw = await request.clone().text()
  if (raw.length > 65536) return json({ error: 'Request too large' }, 413)
  try {
    JSON.parse(raw)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const handler = createMcpHandler(() => mcpServer(env))
  return handler.fetch(request)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/' && request.method === 'GET') {
      return json({ name: 'modern-web-guidance-mcp', mcpEndpoint: '/mcp', count: GUIDES.length, tree: SOURCE_TREE_SHA })
    }
    if (url.pathname === '/mcp' && request.method === 'POST') return handleMcp(request, env)
    if (url.pathname === '/mcp') {
      return new Response('Use POST /mcp (stateless Streamable HTTP).', { status: 405, headers: { Allow: 'POST' } })
    }
    return json({ error: 'Not found' }, 404)
  },
}
