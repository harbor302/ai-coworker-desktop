import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  CheckCircle,
  Package,
  Power,
  PowerOff,
  Trash2,
  Plus,
  Loader2,
  FolderOpen,
  Globe,
  RefreshCw,
  X,
  List,
  LayoutGrid,
  Folder,
  Eye,
  Search,
} from 'lucide-react';
import type { Skill, PluginCatalogItemV2, InstalledPlugin, PluginComponentKind } from '../../types';
import { useAppStore } from '../../store';
import { SettingsContentSection } from './shared';
import type { LocalizedBanner } from './shared';
import { MessageMarkdown } from '../MessageMarkdown';

const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

export function SettingsSkills({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const skillsStorageChangedAt = useAppStore((state) => state.skillsStorageChangedAt);
  const skillsStorageChangeEvent = useAppStore((state) => state.skillsStorageChangeEvent);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [storagePath, setStoragePath] = useState('');
  const [plugins, setPlugins] = useState<PluginCatalogItemV2[]>([]);
  const [installedPluginsByKey, setInstalledPluginsByKey] = useState<
    Record<string, InstalledPlugin>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [isPluginLoading, setIsPluginLoading] = useState(false);
  const [isPluginModalOpen, setIsPluginModalOpen] = useState(false);
  const [pluginActionKey, setPluginActionKey] = useState<string | null>(null);
  const [pluginToastMessage, setPluginToastMessage] = useState('');
  const [error, setError] = useState<LocalizedBanner | null>(null);
  const [success, setSuccess] = useState<LocalizedBanner | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'masonry'>('masonry');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [skillDetailBody, setSkillDetailBody] = useState<string | null>(null);
  const [skillDetailMeta, setSkillDetailMeta] = useState<Record<string, string>>({});
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const pluginToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const componentOrder: PluginComponentKind[] = ['skills', 'commands', 'agents', 'hooks', 'mcp'];

  function normalizePluginLookupKey(value: string | undefined): string {
    if (!value) {
      return '';
    }
    return value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function getCatalogLookupKeys(plugin: PluginCatalogItemV2): string[] {
    const keys = new Set<string>();
    const addKey = (value: string | undefined) => {
      if (!value) {
        return;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }
      keys.add(trimmed);
      keys.add(trimmed.toLowerCase());
      const normalized = normalizePluginLookupKey(trimmed);
      if (normalized) {
        keys.add(normalized);
      }
    };

    addKey(plugin.name);
    addKey(plugin.pluginId);

    const marketplaceId = plugin.pluginId?.split('@')[0];
    addKey(marketplaceId);

    return [...keys];
  }

  useEffect(() => {
    if (!skillsStorageChangeEvent) {
      return;
    }
    if (skillsStorageChangeEvent.reason === 'fallback') {
      setError({ text: t('skills.storagePathFallback') });
      return;
    }
    if (skillsStorageChangeEvent.reason === 'watcher_error') {
      setError({
        text: t('skills.storageWatcherError', {
          message: skillsStorageChangeEvent.message || '',
        }),
      });
    }
  }, [skillsStorageChangeEvent, t]);

  function showPluginInstallToast(message: string) {
    setPluginToastMessage(message);
    if (pluginToastTimerRef.current) {
      clearTimeout(pluginToastTimerRef.current);
    }
    pluginToastTimerRef.current = setTimeout(() => {
      setPluginToastMessage('');
      pluginToastTimerRef.current = null;
    }, 5000);
  }

  const loadSkills = useCallback(async (silent = false) => {
    try {
      const [skillsResult, storagePathResult] = await Promise.allSettled([
        window.electronAPI.skills.getAll(),
        window.electronAPI.skills.getStoragePath(),
      ]);
      const errors: string[] = [];

      if (skillsResult.status === 'fulfilled') {
        setSkills(skillsResult.value || []);
      } else {
        errors.push(
          skillsResult.reason instanceof Error
            ? skillsResult.reason.message
            : tRef.current('skills.failedToLoad')
        );
      }
      if (storagePathResult.status === 'fulfilled') {
        setStoragePath(storagePathResult.value || '');
      } else {
        errors.push(
          storagePathResult.reason instanceof Error
            ? storagePathResult.reason.message
            : tRef.current('skills.storagePathUnavailable')
        );
      }

      if (errors.length > 0) {
        throw new Error(errors.join(' | '));
      }

      if (!silent) {
        setError(null);
      }
    } catch (err) {
      console.error('Failed to load skills:', err);
      if (!silent) {
        setError({
          text:
            err instanceof Error && err.message
              ? `${tRef.current('skills.failedToLoad')}: ${err.message}`
              : tRef.current('skills.failedToLoad'),
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!isElectron || !isActive) {
      return () => {
        if (pluginToastTimerRef.current) {
          clearTimeout(pluginToastTimerRef.current);
        }
      };
    }

    void loadSkills();

    return () => {
      if (pluginToastTimerRef.current) {
        clearTimeout(pluginToastTimerRef.current);
      }
    };
  }, [isActive, loadSkills]);

  useEffect(() => {
    if (isElectron && isActive && skillsStorageChangedAt > 0) {
      void loadSkills(true);
    }
  }, [isActive, loadSkills, skillsStorageChangedAt]);

  async function loadPlugins() {
    try {
      setIsPluginLoading(true);
      const [catalog, installed] = await Promise.all([
        window.electronAPI.plugins.listCatalog({ installableOnly: false }),
        window.electronAPI.plugins.listInstalled(),
      ]);
      setPlugins(catalog || []);
      const nextInstalledByKey: Record<string, InstalledPlugin> = {};
      const addLookupKey = (key: string, plugin: InstalledPlugin) => {
        if (!key || nextInstalledByKey[key]) {
          return;
        }
        nextInstalledByKey[key] = plugin;
      };
      for (const plugin of installed || []) {
        const candidates = [
          plugin.name,
          plugin.name?.toLowerCase(),
          normalizePluginLookupKey(plugin.name),
          plugin.pluginId,
          plugin.pluginId?.toLowerCase(),
          normalizePluginLookupKey(plugin.pluginId),
        ].filter((value): value is string => Boolean(value));
        for (const key of candidates) {
          addLookupKey(key, plugin);
        }
      }
      setInstalledPluginsByKey(nextInstalledByKey);
      setError(null);
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.pluginInstallFailed') });
    } finally {
      setIsPluginLoading(false);
    }
  }

  async function handleBrowsePlugins() {
    setIsPluginModalOpen(true);
    await loadPlugins();
  }

  async function handleInstall() {
    try {
      const folderPath = await window.electronAPI.invoke<string | null>({
        type: 'folder.select',
        payload: {},
      });
      if (!folderPath) return;

      setIsLoading(true);
      const validation = await window.electronAPI.skills.validate(folderPath);

      if (!validation.valid) {
        setError({ text: `Invalid skill folder: ${validation.errors.join(', ')}` });
        return;
      }

      const result = await window.electronAPI.skills.install(folderPath);
      if (result.success) {
        await loadSkills();
        setError(null);
        setSuccess(null);
      }
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.failedToInstall') });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSelectStoragePath() {
    try {
      const folderPath = await window.electronAPI.invoke<string | null>({
        type: 'folder.select',
        payload: {},
      });
      if (!folderPath) return;

      setIsLoading(true);
      const result = await window.electronAPI.skills.setStoragePath(folderPath, true);
      if (result.success) {
        setStoragePath(result.path);
        await loadSkills(true);
        setError(null);
        setSuccess({
          text: t('skills.storagePathUpdated', {
            migrated: result.migratedCount,
            skipped: result.skippedCount,
          }),
        });
        setTimeout(() => setSuccess(null), 5000);
      }
    } catch (err) {
      setError({
        text: err instanceof Error ? err.message : t('skills.storagePathUpdateFailed'),
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOpenStoragePath() {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.skills.openStoragePath();
      if (!result.success) {
        setError({ text: result.error || t('skills.storagePathOpenFailed') });
        return;
      }
      setStoragePath(result.path);
      setError(null);
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.storagePathOpenFailed') });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefreshSkills() {
    setIsLoading(true);
    try {
      await loadSkills();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(skillId: string, skillName: string) {
    if (!confirm(t('skills.deleteSkill', { name: skillName }))) return;

    setIsLoading(true);
    try {
      await window.electronAPI.skills.delete(skillId);
      await loadSkills();
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.failedToDelete') });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleEnabled(skill: Skill) {
    if (skill.locked) {
      return;
    }
    setIsLoading(true);
    try {
      await window.electronAPI.skills.setEnabled(skill.id, !skill.enabled);
      await loadSkills();
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.failedToToggle') });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleViewDetail(skill: Skill) {
    if (!skill.sourcePath) {
      setError({ text: t('skills.noDetailAvailable') });
      return;
    }
    setSelectedSkill(skill);
    setIsDetailLoading(true);
    setSkillDetailBody(null);
    setSkillDetailMeta({});
    try {
      const result = await window.electronAPI.skills.getDetail(skill.id);
      if (result.success && result.content) {
        const parsed = parseSkillMarkdown(result.content);
        setSkillDetailMeta(parsed.meta);
        setSkillDetailBody(parsed.body);
      } else {
        setError({ text: t('skills.failedToLoadDetail') });
        setSelectedSkill(null);
      }
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.failedToLoadDetail') });
      setSelectedSkill(null);
    } finally {
      setIsDetailLoading(false);
    }
  }

  function handleCloseDetail() {
    setSelectedSkill(null);
    setSkillDetailBody(null);
    setSkillDetailMeta({});
    setIsDetailLoading(false);
  }

  async function handleInstallPlugin(plugin: PluginCatalogItemV2) {
    const installTarget = plugin.pluginId ?? plugin.name;
    setPluginActionKey(`install:${installTarget}`);
    setError(null);
    setSuccess(null);
    try {
      const result = await window.electronAPI.plugins.install(installTarget);
      await loadSkills();
      await loadPlugins();
      const message = t('skills.pluginInstallSuccess', { name: result.plugin.name });
      setSuccess({ text: message });
      showPluginInstallToast(message);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.pluginInstallFailed') });
    } finally {
      setPluginActionKey(null);
    }
  }

  async function handleSetPluginEnabled(plugin: InstalledPlugin, enabled: boolean) {
    setPluginActionKey(`enabled:${plugin.pluginId}`);
    setError(null);
    try {
      await window.electronAPI.plugins.setEnabled(plugin.pluginId, enabled);
      await loadPlugins();
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.pluginInstallFailed') });
    } finally {
      setPluginActionKey(null);
    }
  }

  async function handleSetComponentEnabled(
    plugin: InstalledPlugin,
    component: PluginComponentKind,
    enabled: boolean
  ) {
    setPluginActionKey(`component:${plugin.pluginId}:${component}`);
    setError(null);
    try {
      await window.electronAPI.plugins.setComponentEnabled(plugin.pluginId, component, enabled);
      await loadPlugins();
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.pluginInstallFailed') });
    } finally {
      setPluginActionKey(null);
    }
  }

  async function handleUninstallPlugin(plugin: InstalledPlugin) {
    if (!confirm(t('skills.pluginUninstall', { name: plugin.name }))) {
      return;
    }

    setPluginActionKey(`uninstall:${plugin.pluginId}`);
    setError(null);
    try {
      await window.electronAPI.plugins.uninstall(plugin.pluginId);
      await loadPlugins();
      showPluginInstallToast(t('skills.pluginUninstalled', { name: plugin.name }));
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.pluginInstallFailed') });
    } finally {
      setPluginActionKey(null);
    }
  }

  const filteredSkills = skills.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q);
  });

  const builtinSkills = filteredSkills.filter((s) => s.type === 'builtin');
  const customSkills = filteredSkills.filter((s) => s.type !== 'builtin');

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-error/10 text-error text-sm">
          <AlertCircle className="w-4 h-4" />
          {error.key ? t(error.key) : error.text}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-success/10 text-success text-sm">
          <CheckCircle className="w-4 h-4" />
          {success.key ? t(success.key) : success.text}
        </div>
      )}

      {/* Storage Path Info Bar */}
      <div className="flex items-center gap-3 p-3 rounded-lg border border-border-subtle bg-surface-hover/50">
        <Folder className="w-4 h-4 text-text-muted shrink-0" />
        <div className="flex-1 min-w-0 text-xs text-text-muted truncate" title={storagePath || ''}>
          {storagePath || t('skills.storagePathUnavailable')}
        </div>
        {/* Search */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border-subtle bg-surface min-w-0 max-w-[200px]">
          <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('skills.search') || '搜索技能...'}
            className="bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted text-xs min-w-0 w-full"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-0.5 rounded hover:bg-surface-hover shrink-0"
            >
              <X className="w-3 h-3 text-text-muted" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleSelectStoragePath}
            disabled={isLoading}
            className="p-2 rounded-md text-text-secondary hover:text-accent hover:bg-accent/5 transition-colors disabled:opacity-50"
            title={t('skills.selectStoragePath')}
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          <button
            onClick={handleOpenStoragePath}
            disabled={isLoading}
            className="p-2 rounded-md text-text-secondary hover:text-accent hover:bg-accent/5 transition-colors disabled:opacity-50"
            title={t('skills.openStoragePath')}
          >
            <Globe className="w-4 h-4" />
          </button>
          <ViewToggle viewMode={viewMode} onChange={setViewMode} />
          <button
            onClick={handleRefreshSkills}
            disabled={isLoading}
            className="p-2 rounded-md text-text-secondary hover:text-accent hover:bg-accent/5 transition-colors disabled:opacity-50"
            title={t('skills.refreshSkills')}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Built-in Skills */}
      <SettingsContentSection
        title={t('skills.builtinSkills')}
        description={t('skills.builtinSkillsDesc')}
      >
        <SkillGrid
          skills={builtinSkills}
          viewMode={viewMode}
          isLoading={isLoading}
          onToggleEnabled={handleToggleEnabled}
          onViewDetail={handleViewDetail}
        />
      </SettingsContentSection>

      {/* Custom Skills */}
      <SettingsContentSection
        title={t('skills.customSkills')}
        description={t('skills.installSkillsDesc')}
      >
        {customSkills.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>{t('skills.noCustomSkills')}</p>
            <p className="text-sm mt-1">{t('skills.installSkillsDesc')}</p>
          </div>
        ) : (
          <SkillGrid
            skills={customSkills}
            viewMode={viewMode}
            isLoading={isLoading}
            onToggleEnabled={handleToggleEnabled}
            onDelete={handleDelete}
            onViewDetail={handleViewDetail}
          />
        )}
      </SettingsContentSection>

      <SettingsContentSection
        title={t('skills.pluginsTitle')}
        description={t('skills.pluginsDesc')}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <button
            onClick={handleBrowsePlugins}
            disabled={isLoading || isPluginLoading}
            className="w-full py-3 px-4 rounded-lg border border-border-subtle hover:border-accent hover:bg-accent/5 transition-all flex items-center justify-center gap-2 text-text-secondary hover:text-accent disabled:opacity-50"
          >
            {isPluginLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Package className="w-5 h-5" />
            )}
            {t('skills.browsePlugins')}
          </button>
          <button
            onClick={handleInstall}
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-lg border-2 border-dashed border-border-subtle hover:border-accent hover:bg-accent/5 transition-all flex items-center justify-center gap-2 text-text-secondary hover:text-accent disabled:opacity-50"
          >
            <Plus className="w-5 h-5" />
            {t('skills.installSkillFromFolder')}
          </button>
        </div>
      </SettingsContentSection>

      {isPluginModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[80vh] overflow-hidden rounded-lg border border-border bg-surface shadow-elevated">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-lg font-semibold text-text-primary">
                {t('skills.pluginListTitle')}
              </h3>
              <button
                onClick={() => setIsPluginModalOpen(false)}
                className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
              >
                <X className="w-5 h-5 text-text-secondary" />
              </button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto max-h-[65vh]">
              {isPluginLoading ? (
                <div className="py-8 flex items-center justify-center gap-2 text-text-secondary">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{t('common.loading')}</span>
                </div>
              ) : plugins.length === 0 ? (
                <div className="py-8 text-center text-text-muted">{t('skills.noPluginsFound')}</div>
              ) : (
                plugins.map((plugin) => (
                  <div
                    key={plugin.pluginId || plugin.name}
                    className="rounded-lg border border-border bg-surface-hover p-4"
                  >
                    {(() => {
                      const installedPlugin = getCatalogLookupKeys(plugin)
                        .map((key) => installedPluginsByKey[key])
                        .find((item): item is InstalledPlugin => Boolean(item));
                      const installTarget = plugin.pluginId ?? plugin.name;
                      const isInstalling = pluginActionKey === `install:${installTarget}`;
                      const componentEntries = componentOrder.filter(
                        (component) => plugin.componentCounts[component] > 0
                      );
                      const isMarketplaceCatalog = plugin.catalogSource === 'claude-marketplace';
                      const hasKnownComponents = componentEntries.length > 0;
                      const isInstallable = plugin.installable;
                      return (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium text-text-primary truncate">
                                  {plugin.name}
                                </h4>
                                {plugin.version && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-surface text-text-muted">
                                    v{plugin.version}
                                  </span>
                                )}
                              </div>
                              {plugin.description && (
                                <p className="text-sm text-text-muted line-clamp-2">
                                  {plugin.description}
                                </p>
                              )}
                              {hasKnownComponents ? (
                                <p className="text-xs text-text-muted mt-2">
                                  {t('skills.pluginComponents', {
                                    skills: plugin.componentCounts.skills,
                                    commands: plugin.componentCounts.commands,
                                    agents: plugin.componentCounts.agents,
                                    hooks: plugin.componentCounts.hooks,
                                    mcp: plugin.componentCounts.mcp,
                                  })}
                                </p>
                              ) : (
                                isMarketplaceCatalog &&
                                !installedPlugin && (
                                  <p className="text-xs text-text-muted mt-2">
                                    {t('skills.pluginComponentsAvailableAfterInstall')}
                                  </p>
                                )
                              )}
                              {hasKnownComponents &&
                                plugin.componentCounts.hooks > 0 &&
                                !installedPlugin && (
                                  <p className="text-xs text-warning mt-1">
                                    {t('skills.pluginComponentHooksDisabledByDefault')}
                                  </p>
                                )}
                              {hasKnownComponents &&
                                plugin.componentCounts.mcp > 0 &&
                                !installedPlugin && (
                                  <p className="text-xs text-warning mt-1">
                                    {t('skills.pluginComponentMcpDisabledByDefault')}
                                  </p>
                                )}
                              {!isInstallable && !isMarketplaceCatalog && (
                                <p className="text-xs text-error mt-1">
                                  {t('skills.pluginNoComponents')}
                                </p>
                              )}
                            </div>
                            {installedPlugin ? (
                              <span className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-success/10 text-success text-sm">
                                <CheckCircle className="w-4 h-4" />
                                {t('skills.pluginInstalled')}
                              </span>
                            ) : (
                              <button
                                onClick={() => handleInstallPlugin(plugin)}
                                disabled={!isInstallable || pluginActionKey !== null}
                                className="px-3 py-2 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                              >
                                {isInstalling ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {t('common.install')}
                                  </span>
                                ) : (
                                  t('skills.pluginInstall')
                                )}
                              </button>
                            )}
                          </div>
                          {installedPlugin && (
                            <div className="mt-3 pt-3 border-t border-border space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs text-text-muted">
                                  {installedPlugin.enabled
                                    ? t('skills.pluginAppliedInRuntime')
                                    : t('skills.pluginDisabled')}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() =>
                                      handleSetPluginEnabled(
                                        installedPlugin,
                                        !installedPlugin.enabled
                                      )
                                    }
                                    disabled={pluginActionKey !== null}
                                    className={`px-3 py-1.5 rounded-md text-xs ${
                                      installedPlugin.enabled
                                        ? 'bg-warning/10 text-warning hover:bg-warning/20'
                                        : 'bg-success/10 text-success hover:bg-success/20'
                                    } disabled:opacity-50`}
                                  >
                                    {installedPlugin.enabled
                                      ? t('skills.pluginDisable')
                                      : t('skills.pluginEnable')}
                                  </button>
                                  <button
                                    onClick={() => handleUninstallPlugin(installedPlugin)}
                                    disabled={pluginActionKey !== null}
                                    className="px-3 py-1.5 rounded-md text-xs bg-error/10 text-error hover:bg-error/20 disabled:opacity-50"
                                  >
                                    {t('skills.pluginManageUninstall')}
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-1">
                                {componentEntries.map((component) => {
                                  const enabled = installedPlugin.componentsEnabled[component];
                                  return (
                                    <div
                                      key={`${installedPlugin.pluginId}:${component}`}
                                      className="flex items-center justify-between gap-2"
                                    >
                                      <div className="text-xs text-text-secondary">
                                        <span className="font-medium">{component}</span>
                                        <span className="text-text-muted">
                                          {' '}
                                          ({plugin.componentCounts[component]})
                                        </span>
                                      </div>
                                      <button
                                        onClick={() =>
                                          handleSetComponentEnabled(
                                            installedPlugin,
                                            component,
                                            !enabled
                                          )
                                        }
                                        disabled={pluginActionKey !== null}
                                        className={`px-2 py-1 rounded text-xs ${
                                          enabled
                                            ? 'bg-success/10 text-success hover:bg-success/20'
                                            : 'bg-surface text-text-muted hover:bg-surface-active'
                                        } disabled:opacity-50`}
                                      >
                                        {enabled
                                          ? t('skills.pluginDisable')
                                          : t('skills.pluginEnable')}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Skill Detail Modal */}
      {selectedSkill && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-lg border border-border bg-surface shadow-elevated flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="w-5 h-5 text-accent shrink-0" />
                <h3
                  className="text-lg font-semibold text-text-primary truncate"
                  title={selectedSkill.name}
                >
                  {selectedSkill.name}
                </h3>
                <span
                  className={`px-1.5 py-0.5 text-[10px] rounded shrink-0 ${
                    selectedSkill.type === 'builtin'
                      ? 'bg-accent/10 text-accent'
                      : selectedSkill.type === 'mcp'
                        ? 'bg-mcp/10 text-mcp'
                        : 'bg-success/10 text-success'
                  }`}
                >
                  {selectedSkill.type.toUpperCase()}
                </span>
              </div>
              <button
                onClick={handleCloseDetail}
                className="p-2 rounded-lg hover:bg-surface-hover transition-colors shrink-0"
              >
                <X className="w-5 h-5 text-text-secondary" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 min-h-0">
              {isDetailLoading ? (
                <div className="py-12 flex items-center justify-center gap-2 text-text-secondary">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{t('common.loading')}</span>
                </div>
              ) : skillDetailBody ? (
                <div className="space-y-5">
                  {/* Frontmatter Meta Card */}
                  {Object.keys(skillDetailMeta).length > 0 && (
                    <div className="rounded-xl border border-border bg-surface-hover/60 p-4">
                      <div className="space-y-2">
                        {Object.entries(skillDetailMeta).map(([key, value]) => (
                          <div key={key} className="flex items-start gap-2 text-sm">
                            <span className="shrink-0 px-2 py-0.5 rounded bg-accent/10 text-accent text-xs font-medium uppercase tracking-wide">
                              {key}
                            </span>
                            <span className="text-text-secondary break-all">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Markdown Body */}
                  <div className="prose-chat max-w-none">
                    <MessageMarkdown normalizedText={skillDetailBody} />
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-text-muted">
                  {t('skills.noDetailAvailable')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {pluginToastMessage && (
        <div className="fixed right-6 bottom-6 z-[80] max-w-md rounded-lg border border-success/30 bg-surface px-4 py-3 shadow-elevated">
          <div className="flex items-start gap-2 text-success text-sm">
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{pluginToastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SkillCard({
  skill,
  onToggleEnabled,
  onDelete,
  onViewDetail,
  isLoading,
}: {
  skill: Skill;
  onToggleEnabled: () => void;
  onDelete: (() => void) | null;
  onViewDetail: () => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const isBuiltin = skill.type === 'builtin';
  const isLocked = skill.locked === true;
  const toggleTitle = isLocked
    ? skill.lockReason || t('skills.managedByConnector')
    : skill.enabled
      ? t('common.disable')
      : t('common.enable');

  return (
    <div
      className="group rounded-xl border border-border bg-surface p-4 h-full cursor-pointer
        hover:border-accent/50 hover:shadow-md hover:shadow-accent/5
        hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.995]
        transition-all duration-200 ease-out"
      onClick={onViewDetail}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className={`w-2.5 h-2.5 rounded-full shrink-0 transition-all duration-300 ${
                skill.enabled
                  ? 'bg-success shadow-[0_0_6px_rgba(34,197,94,0.4)]'
                  : 'bg-text-muted group-hover:bg-text-secondary'
              }`}
            />
            <h3
              className="font-medium text-text-primary text-sm truncate group-hover:text-accent transition-colors duration-200"
              title={skill.name}
            >
              {skill.name}
            </h3>
            <span
              className={`px-1.5 py-0.5 text-[10px] rounded-md shrink-0 w-[52px] text-center font-semibold tracking-wide transition-transform duration-200 group-hover:scale-105 ${
                isBuiltin
                  ? 'bg-accent/10 text-accent group-hover:bg-accent/20'
                  : skill.type === 'mcp'
                    ? 'bg-mcp/10 text-mcp group-hover:bg-mcp/20'
                    : 'bg-success/10 text-success group-hover:bg-success/20'
              }`}
            >
              {skill.type.toUpperCase()}
            </span>
            {isLocked && skill.managedBy && (
              <span className="px-1.5 py-0.5 text-[10px] rounded-md shrink-0 bg-surface-hover text-text-muted border border-border-subtle">
                {skill.managedBy}
              </span>
            )}
          </div>
          <div className="min-h-[36px] ml-[18px]">
            {skill.description && (
              <p className="text-xs text-text-muted line-clamp-2 group-hover:text-text-secondary transition-colors duration-200">
                {skill.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isLocked) return;
              onToggleEnabled();
            }}
            disabled={isLoading || isLocked}
            className={`p-1.5 rounded-lg transition-all duration-150 active:scale-90 ${
              isLocked
                ? 'bg-surface-muted text-text-muted opacity-45 cursor-not-allowed'
                : skill.enabled
                  ? 'bg-success/10 text-success hover:bg-success/20 hover:shadow-[0_0_8px_rgba(34,197,94,0.25)]'
                  : 'bg-surface-muted text-text-muted hover:bg-surface-active hover:text-text-primary'
            }`}
            title={toggleTitle}
          >
            {skill.enabled ? (
              <Power className="w-3.5 h-3.5" />
            ) : (
              <PowerOff className="w-3.5 h-3.5" />
            )}
          </button>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={isLoading}
              className="p-1.5 rounded-lg bg-error/10 text-error hover:bg-error/20 hover:shadow-[0_0_8px_rgba(239,68,68,0.25)] active:scale-90 transition-all duration-150"
              title={t('common.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {/* Bottom accent line on hover */}
      <div className="mt-3 h-0.5 rounded-full bg-gradient-to-r from-accent/0 via-accent/0 to-accent/0 group-hover:from-accent/0 group-hover:via-accent/60 group-hover:to-accent/0 transition-all duration-300" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// View Toggle
// ---------------------------------------------------------------------------

function parseSkillMarkdown(content: string): {
  meta: Record<string, string>;
  body: string;
} {
  const trimmed = content.trimStart();
  const frontMatterMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (!frontMatterMatch) {
    return { meta: {}, body: content };
  }

  const frontMatter = frontMatterMatch[1];
  const body = trimmed.slice(frontMatterMatch[0].length).trimStart();

  const meta: Record<string, string> = {};
  for (const line of frontMatter.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      // Remove surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key) meta[key] = value;
    }
  }

  return { meta, body };
}

function ViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: 'list' | 'masonry';
  onChange: (mode: 'list' | 'masonry') => void;
}) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-surface-hover border border-border-subtle">
      <button
        onClick={() => onChange('list')}
        className={`p-1.5 rounded transition-colors ${
          viewMode === 'list'
            ? 'bg-surface text-text-primary shadow-sm'
            : 'text-text-muted hover:text-text-secondary'
        }`}
        title="列表视图"
      >
        <List className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onChange('masonry')}
        className={`p-1.5 rounded transition-colors ${
          viewMode === 'masonry'
            ? 'bg-surface text-text-primary shadow-sm'
            : 'text-text-muted hover:text-text-secondary'
        }`}
        title="瀑布视图"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill Grid
// ---------------------------------------------------------------------------

function SkillGrid({
  skills,
  viewMode,
  isLoading,
  onToggleEnabled,
  onDelete,
  onViewDetail,
}: {
  skills: Skill[];
  viewMode: 'list' | 'masonry';
  isLoading: boolean;
  onToggleEnabled: (skill: Skill) => void;
  onDelete?: (skillId: string, skillName: string) => void;
  onViewDetail: (skill: Skill) => void;
}) {
  if (viewMode === 'masonry') {
    return (
      <div className="grid grid-cols-2 gap-3">
        {skills.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            onToggleEnabled={() => onToggleEnabled(skill)}
            onDelete={onDelete ? () => onDelete(skill.id, skill.name) : null}
            onViewDetail={() => onViewDetail(skill)}
            isLoading={isLoading}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {skills.map((skill) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          onToggleEnabled={() => onToggleEnabled(skill)}
          onDelete={onDelete ? () => onDelete(skill.id, skill.name) : null}
          onViewDetail={() => onViewDetail(skill)}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}
