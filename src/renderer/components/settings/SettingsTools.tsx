import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Globe, Key, Loader2, CheckCircle } from 'lucide-react';
import { useAppStore } from '../../store';
import type { WebToolsConfig } from '../../types';

const SEARCH_ENGINES: { id: WebToolsConfig['searchEngine']; labelKey: string }[] = [
  { id: 'exa', labelKey: 'tools.engineExa' },
  { id: 'tavily', labelKey: 'tools.engineTavily' },
  { id: 'brave', labelKey: 'tools.engineBrave' },
];

const FETCH_ENGINES: { id: WebToolsConfig['fetchEngine']; labelKey: string }[] = [
  { id: 'exa', labelKey: 'tools.engineExa' },
  { id: 'native', labelKey: 'tools.engineNative' },
];

export function SettingsTools() {
  const { t } = useTranslation();
  const appConfig = useAppStore((s) => s.appConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const webTools: WebToolsConfig = appConfig?.webTools ?? {
    searchEngine: 'exa',
    fetchEngine: 'exa',
    apiKeys: { exa: '', tavily: '', brave: '' },
  };

  const save = async (next: WebToolsConfig) => {
    if (!window.electronAPI?.config?.save) return;
    setIsSaving(true);
    try {
      await window.electronAPI.config.save({ webTools: next });
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt((cur) => (cur === Date.now() ? null : cur)), 1500);
    } finally {
      setIsSaving(false);
    }
  };

  const updateEngines = (patch: Partial<Pick<WebToolsConfig, 'searchEngine' | 'fetchEngine'>>) => {
    void save({ ...webTools, ...patch });
  };

  const updateKey = (key: keyof WebToolsConfig['apiKeys'], value: string) => {
    const next = {
      ...webTools,
      apiKeys: { ...webTools.apiKeys, [key]: value },
    };
    void save(next);
  };

  return (
    <div className="space-y-6">
      {/* Search engine */}
      <section className="space-y-3">
        <h4 className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <Search className="w-4 h-4" />
          {t('tools.webSearchEngine', '默认网页搜索引擎')}
        </h4>
        <p className="text-xs text-text-muted">
          {t('tools.webSearchEngineDesc', 'websearch 未指定 engine 时使用的默认引擎')}
        </p>
        <div className="flex flex-wrap gap-2">
          {SEARCH_ENGINES.map((engine) => (
            <button
              key={engine.id}
              onClick={() => updateEngines({ searchEngine: engine.id })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                webTools.searchEngine === engine.id
                  ? 'bg-accent text-white'
                  : 'bg-surface-hover text-text-secondary hover:bg-surface-active'
              }`}
            >
              {t(engine.labelKey, engine.id)}
            </button>
          ))}
        </div>
      </section>

      {/* Fetch engine */}
      <section className="space-y-3">
        <h4 className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <Globe className="w-4 h-4" />
          {t('tools.webFetchEngine', '默认网页抓取引擎')}
        </h4>
        <p className="text-xs text-text-muted">
          {t('tools.webFetchEngineDesc', 'webfetch 未指定 engine 时使用的默认引擎')}
        </p>
        <div className="flex flex-wrap gap-2">
          {FETCH_ENGINES.map((engine) => (
            <button
              key={engine.id}
              onClick={() => updateEngines({ fetchEngine: engine.id })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                webTools.fetchEngine === engine.id
                  ? 'bg-accent text-white'
                  : 'bg-surface-hover text-text-secondary hover:bg-surface-active'
              }`}
            >
              {t(engine.labelKey, engine.id)}
            </button>
          ))}
        </div>
      </section>

      {/* API Keys */}
      <section className="space-y-3 pt-4 border-t border-border">
        <h4 className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <Key className="w-4 h-4" />
          {t('tools.apiKeys', 'API 密钥')}
        </h4>
        <p className="text-xs text-text-muted">
          {t('tools.apiKeysDesc', '按所选引擎填写对应的 API Key，仅保存在本地加密存储中')}
        </p>
        <div className="space-y-3">
          <ApiKeyInput
            label={t('tools.exaApiKey', 'Exa API Key')}
            value={webTools.apiKeys.exa}
            onChange={(v) => updateKey('exa', v)}
            placeholder={t('tools.enterApiKey', '输入 API Key')}
          />
          <ApiKeyInput
            label={t('tools.tavilyApiKey', 'Tavily API Key')}
            value={webTools.apiKeys.tavily}
            onChange={(v) => updateKey('tavily', v)}
            placeholder={t('tools.enterApiKey', '输入 API Key')}
          />
          <ApiKeyInput
            label={t('tools.braveApiKey', 'Brave API Key')}
            value={webTools.apiKeys.brave}
            onChange={(v) => updateKey('brave', v)}
            placeholder={t('tools.enterApiKey', '输入 API Key')}
          />
        </div>
      </section>

      {/* Save indicator */}
      <div className="flex items-center gap-2 text-xs text-text-muted h-5">
        {isSaving ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('common.saving', '保存中…')}
          </>
        ) : savedAt ? (
          <>
            <CheckCircle className="w-3.5 h-3.5 text-success" />
            {t('common.saved', '已保存')}
          </>
        ) : null}
      </div>
    </div>
  );
}

interface ApiKeyInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function ApiKeyInput({ label, value, onChange, placeholder }: ApiKeyInputProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all text-sm"
      />
    </div>
  );
}
