import { test, expect } from 'bun:test'
import { chunkMarkdown, extractDescription, extractTitle } from './corpus'

test('extract title and overview', () => {
  const markdown = '# Example Guide\n\n## Overview\n\nThis guide explains progressive enhancement for modern web apps.\n\n## Implementation\nContent'
  expect(extractTitle(markdown, 'example.md')).toBe('Example Guide')
  expect(extractDescription(markdown)).toMatch(/progressive enhancement/)
})

test('chunking preserves input and bounds the output', () => {
  const input = '# Test\n\n## First\n' + 'abcdef'.repeat(1000) + '\n## Second\nSome text'
  const parts = chunkMarkdown(input, 600)
  expect(parts.length).toBeGreaterThan(5)
  expect(parts.every(part => part.length <= 600)).toBe(true)
  expect(parts.some(part => part.includes('Second'))).toBe(true)
})
