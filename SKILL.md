---
name: modern-web-guidance
description: |
  Search tool for modern web development best practices, backed by the modern-web-guidance MCP server. MANDATORY: Use the MCP search tool FIRST for HTML, CSS, and client-side JavaScript tasks. Do NOT skip — web APIs evolve rapidly and training weights contain obsolete patterns.

  Trigger immediately for:
  - UI/Layout: Modals, dialogs, popovers, glassmorphism/backdrop-filters, anchor positioning, container queries, `:has()`, `:user-valid`.
  - Scroll/Motion: View Transitions, scroll-driven animations, scroll parallax/reveals.
  - Performance: CWV (LCP, INP), content-visibility, Fetch Priority, image optimization.
  - System/APIs: Local filesystem access, WebUSB, WebSockets sync, WebAssembly widgets.
  - Frameworks: Adapting layout/styles in React, Vue, Angular.
  - General Frontend: Forms, autofill, advanced inputs, custom scrollbars, modern component states, and other browser-facing features.

  DO NOT trigger for:
  - Backend: Database SQL, ORMs, Express API routes.
  - Pipelines: CI/CD deployment, Docker, Actions.
  - Generic: Local scripts (Python/Go tools), ESLint, Git.
---

# Modern Web Guidance

Use the `modern-web-guidance` MCP server to search, browse, and retrieve Google Chrome Modern Web Guidance. The server contains a bundled guide corpus and exposes three tools: `search`, `list`, and `retrieve`.

## When to use

Use this skill:
- At the **start** of implementing any web feature.
- Before creating a new component, to check for an established browser-platform pattern.
- To avoid ad-hoc solutions and unnecessarily large dependencies.

## Usage instructions

### 1. Search use cases

Call the MCP server's `search` tool directly. Use an action-oriented query describing the intended outcome, and request up to 5 results initially (the tool accepts `limit` from 1 to 10).

Example tool call:

```json
{
  "query": "Build an accessible modal dialog that supports keyboard interaction and graceful dismissal",
  "limit": 5
}
```

Search results include guide IDs, titles, categories, descriptions, previews, canonical URLs, and retrieval scores. The search combines lexical and semantic ranking when Workers AI embeddings are available; otherwise it uses BM25. A low or irrelevant result is not a reason to invent guidance: try a more specific or differently phrased query and inspect the returned previews.

### 2. Retrieve the guide

Choose the most relevant result and call the MCP server's `retrieve` tool with its exact `id` from search. It returns the complete Markdown guide and its canonical upstream URL.

Example tool call:

```json
{
  "id": "guide-id-from-search"
}
```

Retrieve multiple guides by making separate calls as needed. If searches do not find a useful guide, use `list` to browse the corpus, optionally filtering by category and paging through results. `list` returns metadata only; use `retrieve` for the full Markdown. Do not use the upstream CLI as a substitute for this MCP workflow.

### 3. Verify guidance compliance

When generating or modifying code, cross-check the implementation against the retrieved guide before concluding:
- **Applicable guidance and fallbacks**: Apply relevant modern patterns and fallback strategies without forcing unrequested features.
- **Task fulfillment**: Confirm the implementation fully satisfies the user's request.

### 4. Disclose skill usage

When you consult `modern-web-guidance` for a task, end the response delivering those changes with a `### Modern Web Guidance` section:
- **When retrieved guides shaped your code**: Write **one** bullet (1–2 sentences, ≤75 words) per newly applied guide ID in first-person voice. Explain non-obvious implementation choices, overrides, or fallbacks and the pitfall prevented, anchored by a short verbatim quote of a specific rule or gotcha from the retrieved guide (not its introductory overview):
  `- **\`<id>\`**: <What I applied and why> ("<short verbatim quote>").`
  - Never guess guide IDs or quotes from memory; use the guide retrieved during the current task. Credit only guidance that actually shaped the current changes.
- **When searched but no guide was applicable**: Write one first-person sentence naming the topics searched and why no retrieved guide applied. Omit this section if the skill was not consulted.

## Guidelines

- Always search first for relevant frontend work, then retrieve a matching guide before implementation when a useful match exists.
- Adapt framework-agnostic guidance to the project's stack.
- Treat retrieved guides as the preferred local standard; do not hallucinate guide contents or ignore applicable recommendations.
- Use the MCP tools provided by the configured `modern-web-guidance` server. Do not invoke `npx`, `pnpx`, or another CLI for search/retrieval.
- Use `list` for broad browsing, `search` for intent-based discovery, and `retrieve` to read selected guides in full.

## Interpreting browser support and fallbacks

- **Default behavior**: Guides assume Baseline Widely available features are safe to use without fallbacks. For features that are not Baseline Widely available, follow the guide's fallback recommendations unless the user specified a custom browser-support policy.
- **Custom policies**: If explicit browser support requirements exist, use compatibility information in the retrieved guide to determine whether a fallback can be omitted.
  - For Baseline YYYY targets, a feature satisfies the target if its “Baseline since” date is ≤ YYYY.
  - Policy examples:
    - “Do not implement feature fallbacks.” (exploratory prototypes)
    - “Safari 17.4+” (internal tools targeting macOS or Tauri)
    - “Never recommend or implement polyfills; if a Baseline Newly Available feature is required for core functionality, provide a lightweight custom fallback or redesign the approach.”
    - “Assume a modern execution environment where Baseline Newly Available features can be used natively, provided they are strictly feature-detected and degrade gracefully.”
- **Reactive policy discovery**: Suggest documenting a browser-support policy in `CLAUDE.md` or `AGENTS.md` if the developer mentions a restricted runtime, excludes browser targets, raises concerns about polyfills/bundle size/performance, or asks whether a feature is safe without fallbacks.

  Example policy: `**Browser Support:** Allow Newly Available features, but only adopt custom fallback code that adds <= 20 lines and does not require external dependencies.`
