import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Key,
  Plug,
  Loader2,
  AlertCircle,
  CheckCircle,
  Search,
  Plus,
  Trash2,
  Settings2,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import { useApiConfigState } from '../../hooks/useApiConfigState';
import ApiDiagnosticsPanel from '../ApiDiagnosticsPanel';
import { PROVIDER_QUICK_PLANS } from '../../../shared/model-quick-plans';

interface SettingsSectionProps {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}

function SettingsSection({ icon, title, description, children }: SettingsSectionProps) {
  return (
    <section className="rounded-2xl border border-border-muted bg-surface/55 px-4 py-4 shadow-[0_14px_34px_rgba(0,0,0,0.04)]">
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border-muted bg-background/80 text-text-muted">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {description && <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function getProfileModel(set: {
  activeProfileKey: string;
  profiles:
    | Record<string, { model?: string } | undefined>
    | Partial<Record<string, { model?: string }>>;
}): string {
  return set.profiles?.[set.activeProfileKey]?.model || '';
}

function getProviderName(
  set: { provider: string; customProtocol: string; name: string },
  presets: unknown,
  fallbackCustom: string
): string {
  if (set.provider === 'custom') {
    return set.name || fallbackCustom;
  }
  const presetMap = presets as Partial<Record<string, { name?: string }>> | null | undefined;
  return presetMap?.[set.provider]?.name || set.provider;
}

function providerTone(provider: string): string {
  if (provider === 'openrouter') return 'bg-indigo-500';
  if (provider === 'anthropic') return 'bg-stone-700';
  if (provider === 'openai') return 'bg-emerald-600';
  if (provider === 'gemini') return 'bg-sky-500';
  if (provider === 'ollama') return 'bg-zinc-800';
  return 'bg-accent';
}

// ==================== API Settings Tab ====================

export function SettingsAPI() {
  const { t } = useTranslation();
  const [providerSearch, setProviderSearch] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const {
    provider,
    customProtocol,
    apiKey,
    baseUrl,
    contextWindow,
    maxTokens,
    presets,
    currentPreset,
    isSaving,
    isLoadingConfig,
    error,
    successMessage,
    enableThinking,
    isOllamaMode,
    requiresApiKey,
    configSets,
    activeConfigSetId,
    currentConfigSet,
    pendingConfigSetAction,
    pendingConfigSet,
    isMutatingConfigSet,
    canDeleteCurrentConfigSet,
    setApiKey,
    setBaseUrl,
    setModel,
    setContextWindow,
    setMaxTokens,
    setEnableThinking,
    changeProtocol,
    discoverLocalOllama,
    isDiscoveringLocalOllama,
    refreshModelOptions,
    isRefreshingModels,
    modelOptions,
    hasFetchedModelOptions,
    model,
    modelInputPlaceholder,
    requestConfigSetSwitch,
    requestCreateBlankConfigSet,
    createConfigSetFromQuickPlan,
    cancelPendingConfigSetAction,
    saveAndContinuePendingConfigSetAction,
    discardAndContinuePendingConfigSetAction,
    deleteConfigSet,
    handleSave,
    diagnosticResult,
    isDiagnosing,
    handleDiagnose,
    handleDeepDiagnose,
  } = useApiConfigState();

  const providerQuery = providerSearch.trim().toLowerCase();
  const filteredConfigSets = useMemo(
    () =>
      configSets.filter((set) => {
        if (!providerQuery) return true;
        const providerName = getProviderName(set, presets, t('api.moreModels')).toLowerCase();
        return (
          set.name.toLowerCase().includes(providerQuery) || providerName.includes(providerQuery)
        );
      }),
    [configSets, presets, providerQuery, t]
  );
  const filteredProviderPlans = useMemo(
    () =>
      PROVIDER_QUICK_PLANS.filter((plan) => {
        if (!providerQuery) return true;
        return (
          plan.title.toLowerCase().includes(providerQuery) ||
          plan.subtitle.toLowerCase().includes(providerQuery) ||
          plan.baseUrl.toLowerCase().includes(providerQuery) ||
          plan.model.toLowerCase().includes(providerQuery)
        );
      }),
    [providerQuery]
  );

  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <span className="ml-2 text-text-secondary">{t('common.loading')}</span>
      </div>
    );
  }

  const currentProviderLabel = currentConfigSet
    ? getProviderName(currentConfigSet, presets, t('api.moreModels'))
    : presets?.[provider]?.name || provider;
  const resolvedBaseUrl =
    provider === 'custom' || provider === 'ollama' ? baseUrl : currentPreset?.baseUrl || baseUrl;
  return (
    <div className="space-y-4">
      <div className="grid min-h-[620px] grid-cols-1 overflow-hidden rounded-3xl border border-border-muted bg-background/70 shadow-[0_24px_70px_rgba(0,0,0,0.08)] xl:grid-cols-[285px_minmax(0,1fr)]">
        <aside className="flex min-h-[560px] flex-col border-b border-border-muted bg-surface/50 p-3 xl:border-b-0 xl:border-r">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={providerSearch}
              onChange={(event) => setProviderSearch(event.target.value)}
              placeholder={t('api.searchProviders')}
              className="h-10 w-full rounded-2xl border border-border-muted bg-background pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
              {t('api.configuredProviders')}
            </div>
            <div className="space-y-1.5">
              {filteredConfigSets.map((set) => {
                const isActive = set.id === activeConfigSetId;
                const modelId = getProfileModel(set);
                const label = getProviderName(set, presets, t('api.moreModels'));
                return (
                  <button
                    key={set.id}
                    type="button"
                    onClick={() => {
                      setDeleteConfirmOpen(false);
                      void requestConfigSetSwitch(set.id);
                    }}
                    disabled={isMutatingConfigSet}
                    className={`group flex w-full items-center gap-3 rounded-2xl border px-2.5 py-2.5 text-left transition-colors ${
                      isActive
                        ? 'border-accent/30 bg-accent/10 text-text-primary'
                        : 'border-transparent text-text-secondary hover:border-border-muted hover:bg-background/80 hover:text-text-primary'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${providerTone(set.provider)}`}
                    >
                      {label.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{set.name}</span>
                      <span className="block truncate text-[11px] text-text-muted">
                        {modelId || t('chat.modelNotConfigured')}
                      </span>
                    </span>
                    {isActive && (
                      <span className="rounded-full border border-accent/30 bg-background px-2 py-0.5 text-[11px] font-medium text-accent">
                        ON
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mb-2 mt-5 px-2 text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
              {t('api.addProviderFromTemplate')}
            </div>
            <div className="space-y-1.5 pb-3">
              {filteredProviderPlans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => {
                    setDeleteConfirmOpen(false);
                    void createConfigSetFromQuickPlan(plan);
                  }}
                  disabled={isMutatingConfigSet || isSaving}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-transparent px-2.5 py-2.5 text-left text-text-secondary transition-colors hover:border-border-muted hover:bg-background/80 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-accent ring-1 ring-border-muted">
                    {plan.title.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{plan.title}</span>
                    <span className="block truncate text-[11px] text-text-muted">{plan.badge}</span>
                  </span>
                  <Plus className="h-4 w-4 text-text-muted group-hover:text-accent" />
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setDeleteConfirmOpen(false);
              void requestCreateBlankConfigSet();
            }}
            disabled={isMutatingConfigSet || isSaving}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border-muted bg-background text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {t('api.newSet')}
          </button>
        </aside>

        <main className="min-w-0 space-y-5 p-4 lg:p-6">
          <div className="flex flex-col gap-3 border-b border-border-muted pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xl font-semibold text-text-primary">
                  {currentConfigSet?.name || currentProviderLabel}
                </h2>
                <span className="rounded-full border border-border-muted bg-surface px-2 py-0.5 text-[11px] text-text-muted">
                  {currentProviderLabel}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-text-muted">
                {resolvedBaseUrl || t('api.quickPlanBlankEndpoint')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {t('api.activeProvider')}
              </span>
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen((prev) => !prev)}
                disabled={!canDeleteCurrentConfigSet || isMutatingConfigSet}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs text-text-muted transition-colors hover:bg-error/10 hover:text-error disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('api.deleteSet')}
              </button>
            </div>
          </div>

          {deleteConfirmOpen && currentConfigSet && (
            <div className="rounded-2xl border border-error/30 bg-error/10 px-3 py-3">
              <p className="text-sm text-text-primary">
                {t('api.configSetDeleteConfirm', { name: currentConfigSet.name })}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="rounded-xl border border-border-muted bg-background px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const deleted = await deleteConfigSet(currentConfigSet.id);
                    if (deleted !== false) {
                      setDeleteConfirmOpen(false);
                    }
                  }}
                  disabled={isMutatingConfigSet}
                  className="rounded-xl bg-error px-3 py-2 text-xs font-medium text-white hover:bg-error/80 disabled:opacity-50"
                >
                  {t('api.deleteSet')}
                </button>
              </div>
            </div>
          )}

          {pendingConfigSetAction && (
            <div className="rounded-2xl border border-warning/30 bg-warning/10 px-3 py-3">
              <p className="text-sm text-text-primary">
                {t('api.unsavedSwitchPrompt', { name: pendingConfigSet?.name || '-' })}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => {
                    void saveAndContinuePendingConfigSetAction();
                  }}
                  disabled={isMutatingConfigSet || isSaving}
                  className="rounded-xl bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {t('api.saveAndContinue')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void discardAndContinuePendingConfigSetAction();
                  }}
                  disabled={isMutatingConfigSet || isSaving}
                  className="rounded-xl bg-surface-hover px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-active disabled:opacity-50"
                >
                  {t('api.discardAndContinue')}
                </button>
                <button
                  type="button"
                  onClick={cancelPendingConfigSetAction}
                  disabled={isMutatingConfigSet || isSaving}
                  className="rounded-xl border border-border-muted bg-background px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}

          <SettingsSection
            icon={<Key className="w-4 h-4" />}
            title={t('api.providerConfigTitle')}
            description={t('api.providerConfigHint')}
          >
            <div className="space-y-4">
              {provider === 'custom' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-primary">
                    {t('api.protocol')}
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(
                      [
                        { id: 'anthropic', label: 'Anthropic' },
                        { id: 'openai', label: 'OpenAI' },
                        { id: 'gemini', label: 'Gemini' },
                      ] as const
                    ).map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => changeProtocol(mode.id)}
                        className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                          customProtocol === mode.id
                            ? 'border-accent bg-accent/10 text-accent font-medium'
                            : 'border-border-muted bg-background text-text-secondary hover:border-border hover:text-text-primary'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="api-key-input" className="text-sm font-medium text-text-primary">
                    {t('api.apiKey')}
                  </label>
                </div>
                <input
                  id="api-key-input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={currentPreset?.keyPlaceholder || t('api.enterApiKey')}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-text-primary placeholder-text-muted transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="api-base-url-input"
                    className="text-sm font-medium text-text-primary"
                  >
                    {t('api.baseUrl')}
                  </label>
                  {isOllamaMode && (
                    <button
                      type="button"
                      onClick={() => {
                        void discoverLocalOllama();
                      }}
                      disabled={isDiscoveringLocalOllama}
                      className="flex items-center gap-1 rounded-md bg-accent-muted px-2 py-1 text-xs text-accent transition-colors hover:bg-accent-muted/80 disabled:opacity-50"
                    >
                      <Plug className="w-3 h-3" />
                      {isDiscoveringLocalOllama
                        ? t('api.discoveringLocalOllama')
                        : t('api.discoverLocalOllama')}
                    </button>
                  )}
                </div>
                <input
                  id="api-base-url-input"
                  type="text"
                  value={resolvedBaseUrl || ''}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  disabled={provider !== 'custom' && provider !== 'ollama'}
                  placeholder={
                    provider === 'ollama'
                      ? 'http://localhost:11434/v1'
                      : customProtocol === 'openai'
                        ? 'https://api.openai.com/v1'
                        : customProtocol === 'gemini'
                          ? 'https://generativelanguage.googleapis.com'
                          : currentPreset?.baseUrl || 'https://api.anthropic.com'
                  }
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-text-primary placeholder-text-muted transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:text-text-muted"
                />
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            key={`model-section-${activeConfigSetId}`}
            icon={<Cpu className="w-4 h-4" />}
            title={t('api.modelConfigTitle')}
            description={t('api.modelConfigHint')}
          >
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="api-model-input"
                    className="text-sm font-medium text-text-primary"
                  >
                    {t('api.model')}
                  </label>
                  {(provider === 'ollama' || provider === 'custom') && (
                    <button
                      type="button"
                      onClick={() => {
                        void refreshModelOptions();
                      }}
                      disabled={isRefreshingModels}
                      className="flex items-center gap-1 rounded-md bg-accent-muted px-2 py-1 text-xs text-accent transition-colors hover:bg-accent-muted/80 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${isRefreshingModels ? 'animate-spin' : ''}`}
                      />
                      {isRefreshingModels ? t('api.refreshingModels') : t('api.refreshModels')}
                    </button>
                  )}
                </div>
                <input
                  id="api-model-input"
                  type="text"
                  value={model || ''}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={modelInputPlaceholder || t('api.enterModelId')}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-text-primary placeholder-text-muted transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>

              {hasFetchedModelOptions && modelOptions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {modelOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setModel(option.id)}
                      className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                        option.id === model
                          ? 'border-accent bg-accent/10 text-accent font-medium'
                          : 'border-border-muted bg-background text-text-secondary hover:border-border hover:text-text-primary'
                      }`}
                      title={option.id}
                    >
                      {option.name || option.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </SettingsSection>

          <SettingsSection
            icon={<Settings2 className="w-4 h-4" />}
            title={t('api.advancedModelSettings')}
            description={t('api.contextWindowHint')}
          >
            <div className="space-y-4">
              {(provider === 'ollama' || provider === 'custom') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="api-context-window-input"
                      className="block text-xs font-medium text-text-secondary mb-1"
                    >
                      {t('api.contextWindow')}
                    </label>
                    <input
                      id="api-context-window-input"
                      type="number"
                      value={contextWindow}
                      onChange={(e) => setContextWindow(e.target.value)}
                      placeholder={t('api.contextWindowPlaceholder')}
                      min={1024}
                      step={1024}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-text-primary text-sm placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="api-max-tokens-input"
                      className="block text-xs font-medium text-text-secondary mb-1"
                    >
                      {t('api.maxOutputTokens')}
                    </label>
                    <input
                      id="api-max-tokens-input"
                      type="number"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(e.target.value)}
                      placeholder={t('api.maxOutputTokensPlaceholder')}
                      min={256}
                      step={256}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-text-primary text-sm placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 text-xs text-text-muted">
                <input
                  type="checkbox"
                  id="enable-thinking"
                  checked={enableThinking}
                  onChange={(e) => setEnableThinking(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-border text-accent focus:ring-accent"
                />
                <label htmlFor="enable-thinking" className="space-y-0.5 flex-1">
                  <div className="text-text-primary font-medium">{t('api.enableThinking')}</div>
                  <div>{t('api.enableThinkingHint')}</div>
                  {isOllamaMode && (
                    <div className="text-amber-500 dark:text-amber-400 text-xs mt-1">
                      {t('api.enableThinkingOllamaHint')}
                    </div>
                  )}
                </label>
              </div>
            </div>
          </SettingsSection>

          {error && (
            <div className="flex items-center gap-2 rounded-2xl bg-error/10 px-4 py-3 text-sm text-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {successMessage && (
            <div className="flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-3 text-sm text-success">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              {successMessage}
            </div>
          )}

          <ApiDiagnosticsPanel
            result={diagnosticResult}
            isRunning={isDiagnosing}
            onRunDiagnostics={handleDiagnose}
            onRunDeepDiagnostics={isOllamaMode ? handleDeepDiagnose : undefined}
            disabled={requiresApiKey && !apiKey.trim()}
            actionSlot={
              <button
                onClick={() => {
                  void handleSave();
                }}
                disabled={isSaving || (requiresApiKey && !apiKey.trim())}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[180px]"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    {t('api.saveSettings')}
                  </>
                )}
              </button>
            }
          />
        </main>
      </div>
    </div>
  );
}
