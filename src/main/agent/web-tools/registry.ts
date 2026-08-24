import { BraveWebSearchEngine } from './brave-engine';
import { ExaWebFetchEngine, ExaWebSearchEngine } from './exa-engine';
import { NativeWebFetchEngine } from './native-fetch-engine';
import { TavilyWebSearchEngine } from './tavily-engine';
import type {
  WebFetchEngine,
  WebFetchEngineName,
  WebSearchEngine,
  WebSearchEngineName,
} from './types';

const searchEngines: Record<WebSearchEngineName, WebSearchEngine> = {
  exa: new ExaWebSearchEngine(),
  tavily: new TavilyWebSearchEngine(),
  brave: new BraveWebSearchEngine(),
};

const fetchEngines: Record<WebFetchEngineName, WebFetchEngine> = {
  exa: new ExaWebFetchEngine(),
  native: new NativeWebFetchEngine(),
};

export function getDefaultSearchEngineName(): WebSearchEngineName {
  const configured = (
    process.env.WEBSEARCH_ENGINE ||
    process.env.WEB_SEARCH_ENGINE ||
    'exa'
  ).trim();
  return isWebSearchEngineName(configured) ? configured : 'exa';
}

export function getDefaultFetchEngineName(): WebFetchEngineName {
  const configured = (process.env.WEBFETCH_ENGINE || process.env.WEB_FETCH_ENGINE || 'exa').trim();
  return isWebFetchEngineName(configured) ? configured : 'exa';
}

export function isWebSearchEngineName(value: string): value is WebSearchEngineName {
  return value === 'exa' || value === 'tavily' || value === 'brave';
}

export function isWebFetchEngineName(value: string): value is WebFetchEngineName {
  return value === 'exa' || value === 'native';
}

export function getSearchEngine(name?: string): WebSearchEngine {
  const resolved = name && isWebSearchEngineName(name) ? name : getDefaultSearchEngineName();
  return searchEngines[resolved];
}

export function getFetchEngine(name?: string): WebFetchEngine {
  const resolved = name && isWebFetchEngineName(name) ? name : getDefaultFetchEngineName();
  return fetchEngines[resolved];
}
