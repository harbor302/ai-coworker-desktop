import { Type } from 'typebox';
import type { ToolDefinition } from '../pi-sdk';
import { getFetchEngine, getSearchEngine } from './registry';
import type {
  ExaSearchType,
  WebFetchEngineName,
  WebFetchResponse,
  WebResult,
  WebSearchEngineName,
  WebSearchResponse,
} from './types';

function compactLines(lines: Array<string | undefined | false>): string {
  return lines.filter(Boolean).join('\n');
}

function formatHighlights(highlights: string[] | undefined, indent: string): string[] {
  return (highlights ?? [])
    .filter((highlight) => highlight.trim())
    .slice(0, 3)
    .map((highlight) => `${indent}- ${highlight.replace(/\s+/g, ' ').trim()}`);
}

function formatSearchResult(result: WebResult, index: number): string {
  return compactLines([
    `${index + 1}. ${result.title || result.url}`,
    `   URL: ${result.url}`,
    result.publishedDate ? `   Published: ${result.publishedDate}` : undefined,
    result.author ? `   Author: ${result.author}` : undefined,
    typeof result.score === 'number' ? `   Score: ${result.score}` : undefined,
    result.summary ? `   Summary: ${result.summary}` : undefined,
    ...(result.highlights?.length
      ? ['   Highlights:', ...formatHighlights(result.highlights, '   ')]
      : []),
  ]);
}

function formatSearchResponse(response: WebSearchResponse): string {
  if (response.results.length === 0) {
    return `No web search results found for "${response.query}" using ${response.engine}.`;
  }

  return [
    `Web search results (${response.engine}) for: ${response.query}`,
    '',
    ...response.results.map(formatSearchResult),
  ].join('\n\n');
}

function formatFetchResponse(response: WebFetchResponse): string {
  const body = response.text || response.summary || response.highlights?.join('\n\n') || '';
  return compactLines([
    `Fetched URL (${response.engine}): ${response.url}`,
    response.title ? `Title: ${response.title}` : undefined,
    response.summary ? `Summary: ${response.summary}` : undefined,
    response.highlights?.length
      ? `Highlights:\n${formatHighlights(response.highlights, '').join('\n')}`
      : undefined,
    body ? `Content:\n${body}` : 'No readable content returned.',
  ]);
}

const searchParameters = Type.Object({
  query: Type.String({ minLength: 1, description: 'Search query.' }),
  engine: Type.Optional(
    Type.Union([Type.Literal('exa'), Type.Literal('tavily'), Type.Literal('brave')], {
      description: 'Search engine. Defaults to WEBSEARCH_ENGINE, then exa.',
    })
  ),
  limit: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 20, description: 'Number of results.' })
  ),
  search_type: Type.Optional(
    Type.Union(
      [
        Type.Literal('auto'),
        Type.Literal('fast'),
        Type.Literal('instant'),
        Type.Literal('deep-lite'),
        Type.Literal('deep'),
        Type.Literal('deep-reasoning'),
      ],
      {
        description: 'Exa search type. Ignored by non-Exa engines. Defaults to auto.',
      }
    )
  ),
  include_domains: Type.Optional(Type.Array(Type.String(), { description: 'Domains to include.' })),
  exclude_domains: Type.Optional(Type.Array(Type.String(), { description: 'Domains to exclude.' })),
  max_age_hours: Type.Optional(
    Type.Number({ description: 'Exa freshness control. 0 always livecrawls, -1 cache only.' })
  ),
});

const fetchParameters = Type.Object({
  url: Type.String({ minLength: 1, description: 'HTTP(S) URL to fetch.' }),
  engine: Type.Optional(
    Type.Union([Type.Literal('exa'), Type.Literal('native')], {
      description: 'Fetch engine. Defaults to WEBFETCH_ENGINE, then exa.',
    })
  ),
  query: Type.Optional(
    Type.String({ description: 'Optional focus query for Exa highlights/summary.' })
  ),
  max_characters: Type.Optional(
    Type.Integer({ minimum: 1000, maximum: 50000, description: 'Maximum content characters.' })
  ),
  max_age_hours: Type.Optional(
    Type.Number({ description: 'Exa freshness control. 0 always livecrawls, -1 cache only.' })
  ),
});

export function createWebTools(): ToolDefinition[] {
  const websearch: ToolDefinition<typeof searchParameters, WebSearchResponse> = {
    name: 'websearch',
    label: 'websearch',
    description:
      'Search the web for current or external information. Supports exa (default), tavily, and brave engines. Use this when the answer may require up-to-date sources, citations, or information outside the local workspace.',
    promptSnippet:
      'websearch: search the web using Exa by default, with Tavily/Brave optional engines.',
    promptGuidelines: [
      'Use websearch for current facts, external references, or source-backed answers.',
      'Prefer engine="exa" unless the user requests another configured engine.',
      'Cite result URLs in the final answer when websearch informs the response.',
    ],
    parameters: searchParameters,
    async execute(_toolCallId, params, signal) {
      const engine = getSearchEngine(params.engine as WebSearchEngineName | undefined);
      const response = await engine.search(
        {
          query: params.query,
          engine: params.engine as WebSearchEngineName | undefined,
          limit: params.limit,
          searchType: params.search_type as ExaSearchType | undefined,
          includeDomains: params.include_domains,
          excludeDomains: params.exclude_domains,
          maxAgeHours: params.max_age_hours,
        },
        signal
      );
      return {
        content: [{ type: 'text' as const, text: formatSearchResponse(response) }],
        details: response,
      };
    },
  };

  const webfetch: ToolDefinition<typeof fetchParameters, WebFetchResponse> = {
    name: 'webfetch',
    label: 'webfetch',
    description:
      'Fetch readable content from a specific HTTP(S) URL. Uses Exa contents by default and supports a native fallback engine. Private/local network URLs are blocked.',
    promptSnippet: 'webfetch: fetch readable content for a known URL using Exa by default.',
    promptGuidelines: [
      'Use webfetch when the user provides a URL or when a search result needs more context.',
      'Avoid fetching private, localhost, or non-http(s) URLs.',
      'Keep summaries concise and include the fetched URL when using the content.',
    ],
    parameters: fetchParameters,
    async execute(_toolCallId, params, signal) {
      const engine = getFetchEngine(params.engine as WebFetchEngineName | undefined);
      const response = await engine.fetch(
        {
          url: params.url,
          engine: params.engine as WebFetchEngineName | undefined,
          query: params.query,
          maxCharacters: params.max_characters,
          maxAgeHours: params.max_age_hours,
        },
        signal
      );
      return {
        content: [{ type: 'text' as const, text: formatFetchResponse(response) }],
        details: response,
      };
    },
  };

  return [websearch, webfetch] as ToolDefinition[];
}
