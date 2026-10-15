/** Pure functions shared by corpus generation and tests. */
export function extractTitle(markdown: string, filename: string): string {
  const match = markdown.match(/^#\s+([^\n]+)\s*$/m)
  return match ? match[1].trim() : filename.replace(/\.md$/, '').replaceAll('-', ' ')
}

export function extractDescription(markdown: string): string {
  const overview = markdown.match(/^##\s+Overview\s*\n+([\s\S]*?)(?=\n#{1,3}\s|\n```|$)/im)?.[1]
  const text = overview ?? markdown.replace(/^#\s+[^\n]+/, '')
  return text
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n\s*\n/)
    .map(s => s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`#>]/g, '').trim())
    .find(s => s.length > 35)?.slice(0, 360) ?? ''
}

/** Split on Markdown section boundaries, then into bounded chunks. */
export function chunkMarkdown(markdown: string, maxChars = 1800): string[] {
  const sections = markdown.split(/(?=^#{2,3}\s)/m)
  const chunks: string[] = []
  let buffer = ''
  const push = () => {
    if (buffer.trim()) chunks.push(buffer.trim())
    buffer = ''
  }
  for (const section of sections) {
    if ((buffer.length + section.length) > maxChars) push()
    if (section.length <= maxChars) {
      buffer += (buffer ? '\n' : '') + section
      continue
    }
    // Oversized sections, including long code fences, are split with overlap.
    const stride = maxChars - 120
    for (let i = 0; i < section.length; i += stride) {
      const part = section.slice(i, i + maxChars)
      if ((buffer.length + part.length) > maxChars) push()
      buffer += part
    }
  }
  push()
  return chunks
}
