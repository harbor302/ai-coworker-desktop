export type WebSearchEngineName = 'exa' | 'tavily' | 'brave';
export type WebFetchEngineName = 'exa' | 'native';
export type ExaSearchType = 'auto' | 'fast' | 'instant' | 'deep-lite' | 'deep' | 'deep-reasoning';

export interface WebSearchOptions {
  query: string;
  engine?: WebSearchEngineName;
  limit?: number;
  searchType?: ExaSearchType;
  includeDomains?: string[];
  excludeDomains?: string[];
  maxAgeHours?: number;
}

export interface WebFetchOptions {
  url: string;
  engine?: WebFetchEngineName;
  query?: string;
  maxCharacters?: number;
  maxAgeHours?: number;
}

export interface WebResult {
  title?: string;
  url: string;
  publishedDate?: string;
  author?: string;
  score?: number;
  highlights?: string[];
  summary?: string;
  text?: string;
}

export interface WebSearchResponse {
  engine: WebSearchEngineName;
  query: string;
  results: WebResult[];
}

export interface WebFetchResponse {
  engine: WebFetchEngineName;
  url: string;
  title?: string;
  text?: string;
  highlights?: string[];
  summary?: string;
}

export interface WebSearchEngine {
  name: WebSearchEngineName;
  search(options: WebSearchOptions, signal?: AbortSignal): Promise<WebSearchResponse>;
}

export interface WebFetchEngine {
  name: WebFetchEngineName;
  fetch(options: WebFetchOptions, signal?: AbortSignal): Promise<WebFetchResponse>;
}
