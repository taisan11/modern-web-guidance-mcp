export interface Guide {
  id: string
  category: string
  title: string
  description: string
  path: string
  url: string
  markdown: string
}

export interface Chunk {
  guideId: string
  text: string
}

export interface Env {
  AI: {
    run(model: '@cf/qwen/qwen3-embedding-0.6b', input: { text: string[] }): Promise<{ data: number[][] }>
  }
  /** Set this for publicly deployed servers; MCP POST requires bearer token. */
  MCP_TOKEN?: string
}
