import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Loader2, Settings2, ChevronRight } from 'lucide-react';
import { useAppStore } from '../store';
import type { ApiConfigSet, AppConfig, ProviderProfileKey, ProviderModelInfo } from '../types';

interface ChatModelSelectorProps {
  className?: string;
  align?: 'left' | 'right';
  disabled?: boolean;
}

const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

function getActiveProfile(set: ApiConfigSet | null | undefined) {
  if (!set) {
    return null;
  }
  return set.profiles?.[set.activeProfileKey as ProviderProfileKey] || null;
}

function getConfigSetModel(set: ApiConfigSet): string {
  return getActiveProfile(set)?.model || '';
}

function getProviderLabel(set: ApiConfigSet): string {
  if (set.provider === 'custom') {
    return set.customProtocol;
  }
  return set.provider;
}

function getCurrentModelLabel(appConfig: AppConfig | null): string {
  if (!appConfig) {
    return '';
  }
  const activeSet = appConfig.configSets?.find((set) => set.id === appConfig.activeConfigSetId);
  return activeSet?.name || appConfig.model || '';
}

interface FetchedModels {
  models: ProviderModelInfo[];
  loading: boolean;
  error?: string;
}

export function ChatModelSelector({
  className = '',
  align = 'left',
  disabled = false,
}: ChatModelSelectorProps) {
  const { t } = useTranslation();
  const appConfig = useAppStore((state) => state.appConfig);
  const setAppConfig = useAppStore((state) => state.setAppConfig);
  const setIsConfigured = useAppStore((state) => state.setIsConfigured);
  const setShowSettings = useAppStore((state) => state.setShowSettings);
  const setSettingsTab = useAppStore((state) => state.setSettingsTab);
  const setGlobalNotice = useAppStore((state) => state.setGlobalNotice);
  const [isOpen, setIsOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [modelMap, setModelMap] = useState<Map<string, FetchedModels>>(new Map());
  const [expandedSetIds, setExpandedSetIds] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  const configSets = useMemo(() => appConfig?.configSets || [], [appConfig?.configSets]);
  const activeConfigSetId = appConfig?.activeConfigSetId || '';
  const activeSet = useMemo(
    () => configSets.find((set) => set.id === activeConfigSetId) || null,
    [activeConfigSetId, configSets]
  );
  const currentModelLabel = getCurrentModelLabel(appConfig) || t('chat.noModel');
  const currentModelId = activeSet ? getConfigSetModel(activeSet) : appConfig?.model || '';
  const canSwitch = isElectron && configSets.length > 0 && !disabled;

  // Fetch models for all config sets when dropdown opens
  const fetchAllModels = useCallback(async () => {
    const newMap = new Map<string, FetchedModels>();

    // Initialize loading state for all sets
    for (const set of configSets) {
      newMap.set(set.id, { models: [], loading: true });
    }
    setModelMap(newMap);

    // Auto-expand the active set
    if (activeConfigSetId) {
      setExpandedSetIds(new Set([activeConfigSetId]));
    }

    await Promise.allSettled(
      configSets.map(async (set) => {
        const profile = getActiveProfile(set);
        const apiKey = profile?.apiKey?.trim() || '';
        const baseUrl = profile?.baseUrl;

        if (!apiKey && set.provider !== 'ollama') {
          setModelMap((prev) => {
            const next = new Map(prev);
            next.set(set.id, { models: [], loading: false, error: t('chat.missingApiKey') });
            return next;
          });
          return;
        }

        try {
          const models = await window.electronAPI.config.listModels({
            provider: set.provider,
            customProtocol: set.customProtocol,
            apiKey,
            baseUrl,
          });
          setModelMap((prev) => {
            const next = new Map(prev);
            next.set(set.id, { models, loading: false });
            return next;
          });
        } catch (error) {
          setModelMap((prev) => {
            const next = new Map(prev);
            next.set(set.id, {
              models: [],
              loading: false,
              error: error instanceof Error ? error.message : String(error),
            });
            return next;
          });
        }
      })
    );
  }, [configSets, activeConfigSetId, t]);

  useEffect(() => {
    if (isOpen) {
      void fetchAllModels();
    }
  }, [isOpen, fetchAllModels]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  const selectModel = async (setId: string, modelId: string) => {
    if (!canSwitch || switchingId) {
      return;
    }

    setSwitchingId(`${setId}::${modelId}`);
    try {
      let nextConfig = appConfig;

      // Switch provider if needed
      if (setId !== activeConfigSetId) {
        const switchResult = await window.electronAPI.config.switchSet({ id: setId });
        nextConfig = switchResult.config;
        setAppConfig(nextConfig);
        setIsConfigured(Boolean(nextConfig.isConfigured));
      }

      // Update model
      const saveResult = await window.electronAPI.config.save({ model: modelId });
      setAppConfig(saveResult.config);
      setIsConfigured(Boolean(saveResult.config.isConfigured));
      setIsOpen(false);
    } catch (error) {
      setGlobalNotice({
        id: `notice-model-switch-${Date.now()}`,
        type: 'error',
        message:
          error instanceof Error && error.message
            ? `${t('chat.modelSwitchFailed')}: ${error.message}`
            : t('chat.modelSwitchFailed'),
      });
    } finally {
      setSwitchingId(null);
    }
  };

  const toggleExpand = (setId: string) => {
    setExpandedSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(setId)) {
        next.delete(setId);
      } else {
        next.add(setId);
      }
      return next;
    });
  };

  const openModelSettings = () => {
    setIsOpen(false);
    setSettingsTab('api');
    setShowSettings(true);
  };

  const anyLoading = useMemo(() => {
    for (const entry of modelMap.values()) {
      if (entry.loading) return true;
    }
    return false;
  }, [modelMap]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          if (canSwitch) {
            setIsOpen((prev) => !prev);
          } else {
            openModelSettings();
          }
        }}
        disabled={disabled}
        className={`inline-flex h-9 max-w-[220px] items-center gap-2 rounded-2xl border border-transparent px-3 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60 ${
          isOpen ? 'bg-surface-hover text-text-primary' : 'bg-transparent'
        }`}
        title={currentModelId || currentModelLabel}
      >
        <span className="truncate">{currentModelLabel}</span>
        {switchingId ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-text-muted" />
        ) : (
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {isOpen && (
        <div
          className={`absolute bottom-full z-50 mb-2 w-[320px] overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated animate-fade-in ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="border-b border-border-muted px-3 py-2.5">
            <p className="text-xs font-medium text-text-primary">{t('chat.modelSelectorTitle')}</p>
            <p className="mt-0.5 truncate text-[11px] text-text-muted">
              {currentModelId
                ? `${currentModelLabel} · ${currentModelId}`
                : t('chat.modelNotConfigured')}
            </p>
          </div>

          <div className="max-h-[360px] overflow-y-auto p-1.5">
            {anyLoading && modelMap.size === 0 && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                <span className="ml-2 text-xs text-text-muted">{t('chat.loadingModels')}</span>
              </div>
            )}

            {configSets.map((set) => {
              const isActiveSet = set.id === activeConfigSetId;
              const isExpanded = expandedSetIds.has(set.id);
              const fetched = modelMap.get(set.id);
              const models = fetched?.models || [];
              const isLoading = fetched?.loading ?? true;
              const fetchError = fetched?.error;
              const activeModelId = getConfigSetModel(set);

              return (
                <div key={set.id} className="mb-1">
                  {/* Provider group header */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(set.id)}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
                      isActiveSet
                        ? 'bg-accent-muted text-accent'
                        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{set.name}</span>
                        {set.isSystem && (
                          <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[10px] text-text-muted ring-1 ring-border-muted">
                            {t('api.defaultSetTag')}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted">
                        <span className="shrink-0 rounded-md bg-background px-1.5 py-0.5 ring-1 ring-border-muted">
                          {getProviderLabel(set)}
                        </span>
                        <span className="truncate">
                          {isLoading
                            ? t('chat.loadingModels')
                            : `${models.length} ${t('chat.models')}`}
                        </span>
                      </div>
                    </div>
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-text-muted" />
                    ) : (
                      <ChevronRight
                        className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                      />
                    )}
                  </button>

                  {/* Model list */}
                  {isExpanded && (
                    <div className="mt-0.5 space-y-0.5 pl-2">
                      {fetchError && (
                        <div className="px-2.5 py-2 text-[11px] text-text-muted">{fetchError}</div>
                      )}

                      {models.length === 0 && !fetchError && !isLoading && (
                        <div className="px-2.5 py-2 text-[11px] text-text-muted">
                          {t('chat.noModelsAvailable')}
                        </div>
                      )}

                      {models.map((model) => {
                        const isSelected = isActiveSet && model.id === activeModelId;
                        const switchKey = `${set.id}::${model.id}`;
                        const isSwitching = switchingId === switchKey;

                        return (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() => {
                              void selectModel(set.id, model.id);
                            }}
                            disabled={Boolean(switchingId)}
                            className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors ${
                              isSelected
                                ? 'bg-accent/10 text-accent'
                                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm">
                                {model.name || model.id}
                              </span>
                              <span className="block truncate text-[11px] text-text-muted">
                                {model.id}
                              </span>
                            </span>
                            {isSwitching ? (
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                            ) : isSelected ? (
                              <Check className="h-3.5 w-3.5 shrink-0" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-border-muted p-1.5">
            <button
              type="button"
              onClick={openModelSettings}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>{t('chat.manageModels')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
