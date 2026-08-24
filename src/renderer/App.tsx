import { Suspense, lazy, useEffect, useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelLeftOpen, Minus, Square, Copy, X } from 'lucide-react';
import { useAppStore } from './store';
import {
  useActiveSessionId,
  useSettings,
  useSystemDarkMode,
  useSettingsState,
  useLayoutState,
  useConfigModalState,
  useGlobalNotice,
  useSandboxSetupState,
  useSandboxSyncStatus,
  usePendingDialogs,
} from './store/selectors';
import { PluginsPage } from './components/PluginsPage';
import { SchedulePage } from './components/SchedulePage';
import { useIPC } from './hooks/useIPC';
import { useWindowSize } from './hooks/useWindowSize';
import { Sidebar } from './components/Sidebar';
import { WelcomeView } from './components/WelcomeView';
import { PermissionDialog } from './components/PermissionDialog';
import { SudoPasswordDialog } from './components/SudoPasswordDialog';
import { SandboxSetupDialog } from './components/SandboxSetupDialog';
import { SandboxSyncToast } from './components/SandboxSyncToast';
import { GlobalNoticeToast } from './components/GlobalNoticeToast';
import { PanelErrorBoundary } from './components/PanelErrorBoundary';
import type { AppConfig } from './types';
import type { GlobalNoticeAction } from './store';

const ChatView = lazy(() =>
  import('./components/ChatView').then((module) => ({ default: module.ChatView }))
);
const ContextPanel = lazy(() =>
  import('./components/ContextPanel').then((module) => ({ default: module.ContextPanel }))
);
const ConfigModal = lazy(() =>
  import('./components/ConfigModal').then((module) => ({ default: module.ConfigModal }))
);
const SettingsPanel = lazy(() =>
  import('./components/SettingsPanel').then((module) => ({ default: module.SettingsPanel }))
);

function MainPanelFallback() {
  return (
    <div className="flex-1 min-h-0 bg-background px-6 py-6">
      <div className="h-full rounded-[1.75rem] border border-border-subtle bg-background/70" />
    </div>
  );
}

function ContextPanelFallback() {
  return (
    <div
      className="hidden xl:block w-[340px] shrink-0 border-l border-border-subtle bg-background/60"
      aria-hidden="true"
    />
  );
}

function App() {
  // --- Store state via selectors (each subscription is minimally scoped) ---
  const activeSessionId = useActiveSessionId();
  const settings = useSettings();
  const systemDarkMode = useSystemDarkMode();
  const { showSettings, showPlugins, pluginsTab, showSchedule } = useSettingsState();
  const { sidebarCollapsed } = useLayoutState();
  const { showConfigModal, isConfigured, appConfig } = useConfigModalState();
  const globalNotice = useGlobalNotice();
  const { progress: sandboxSetupProgress, isComplete: isSandboxSetupComplete } =
    useSandboxSetupState();
  const sandboxSyncStatus = useSandboxSyncStatus();
  const { pendingPermission, pendingSudoPassword } = usePendingDialogs();

  // Actions are still pulled directly from the store
  const setShowConfigModal = useAppStore((s) => s.setShowConfigModal);
  const setIsConfigured = useAppStore((s) => s.setIsConfigured);
  const setAppConfig = useAppStore((s) => s.setAppConfig);
  const clearGlobalNotice = useAppStore((s) => s.clearGlobalNotice);
  const setSandboxSetupComplete = useAppStore((s) => s.setSandboxSetupComplete);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const setShowPlugins = useAppStore((s) => s.setShowPlugins);
  const setShowSchedule = useAppStore((s) => s.setShowSchedule);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const setContextPanelCollapsed = useAppStore((s) => s.setContextPanelCollapsed);

  const { t } = useTranslation();
  const { listSessions, isElectron } = useIPC();
  const { width } = useWindowSize();
  const initialized = useRef(false);
  const sidebarBeforeSettings = useRef(false);
  const isMac = typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin';
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Only run once on mount
    if (initialized.current) return;
    initialized.current = true;

    if (isElectron) {
      listSessions();
    }
  }, []); // Empty deps - run once

  // Apply theme to document root
  useEffect(() => {
    const effectiveTheme =
      settings.theme === 'system' ? (systemDarkMode ? 'dark' : 'light') : settings.theme;

    if (effectiveTheme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [settings.theme, systemDarkMode]);

  // Auto-collapse panels based on window width
  useEffect(() => {
    setContextPanelCollapsed(width < 1100);
    setSidebarCollapsed(width < 800);
  }, [width, setContextPanelCollapsed, setSidebarCollapsed]);

  // Auto-collapse sidebar when Settings is open, restore on close
  // Plugin pages keep the sidebar visible
  useEffect(() => {
    if (showSettings) {
      sidebarBeforeSettings.current = !sidebarCollapsed;
      setSidebarCollapsed(true);
    } else if (sidebarBeforeSettings.current) {
      setSidebarCollapsed(false);
      sidebarBeforeSettings.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings]);

  // Handle config save
  const handleConfigSave = useCallback(
    async (newConfig: Partial<AppConfig>) => {
      if (!isElectron) {
        console.log('[App] Browser mode - config save simulated');
        return;
      }

      const result = await window.electronAPI.config.save(newConfig);
      if (result.success) {
        setIsConfigured(Boolean(result.config?.isConfigured));
        setAppConfig(result.config);
      }
    },
    [setIsConfigured, setAppConfig]
  );

  // Handle config modal close
  const handleConfigClose = useCallback(() => {
    setShowConfigModal(false);
  }, [setShowConfigModal]);

  // Handle sandbox setup complete
  const handleSandboxSetupComplete = useCallback(() => {
    setSandboxSetupComplete(true);
  }, [setSandboxSetupComplete]);

  const handleGlobalNoticeAction = useCallback(
    (action: GlobalNoticeAction) => {
      if (action === 'open_api_settings') {
        setShowConfigModal(true);
      }
      clearGlobalNotice();
    },
    [clearGlobalNotice, setShowConfigModal]
  );

  // Determine if we should show the sandbox setup dialog
  // Show if there's progress and setup is not complete
  const showSandboxSetup = sandboxSetupProgress && !isSandboxSetupComplete;
  const showWelcomeView = !showPlugins && !showSchedule && !showSettings && !activeSessionId;

  return (
    <div className="h-full w-full min-h-0 flex overflow-hidden bg-background">
      {/* Sidebar */}
      <PanelErrorBoundary name="Sidebar" fallback={<div className="w-0" />}>
        <Sidebar />
      </PanelErrorBoundary>

      {/* Right area */}
      <div
        className={`flex-1 min-h-0 flex flex-col overflow-hidden bg-background ${
          showWelcomeView ? 'dot-matrix-bg' : ''
        }`}
      >
        {/* Top drag bar */}
        <div className="h-[38px] titlebar-drag shrink-0 flex items-center justify-between px-3">
          <div className="titlebar-no-drag">
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="fixed left-[5.5rem] top-[0.3125rem] z-50 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-hover transition-colors text-text-secondary"
                title={t('context.expandPanel')}
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}
          </div>
          {!isMac && (
            <div className="flex items-center titlebar-no-drag h-full">
              <button
                onClick={() => window.electronAPI?.window.minimize()}
                className="w-10 h-full flex items-center justify-center hover:bg-surface transition-colors"
                title={t('window.minimize')}
              >
                <Minus className="w-4 h-4 text-text-secondary" />
              </button>
              <button
                onClick={() => {
                  window.electronAPI?.window.maximize();
                  setIsMaximized(!isMaximized);
                }}
                className="w-10 h-full flex items-center justify-center hover:bg-surface transition-colors"
                title={isMaximized ? t('window.restore') : t('window.maximize')}
              >
                {isMaximized ? (
                  <Copy className="w-3.5 h-3.5 text-text-secondary" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-text-secondary" />
                )}
              </button>
              <button
                onClick={() => window.electronAPI?.window.close()}
                className="w-10 h-full flex items-center justify-center hover:bg-red-500 transition-colors group"
                title={t('window.close')}
              >
                <X className="w-4 h-4 text-text-secondary group-hover:text-white" />
              </button>
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Main Content Area */}
          <main
            className={`flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden ${
              showWelcomeView ? 'bg-transparent' : 'bg-background'
            }`}
          >
            {showPlugins ? (
              <PanelErrorBoundary
                name="PluginsPage"
                resetKey={`plugins-${pluginsTab}`}
                fallback={<MainPanelFallback />}
              >
                <Suspense fallback={<MainPanelFallback />}>
                  <div className="animate-page-enter flex flex-col h-full min-h-0">
                    <PluginsPage onClose={() => setShowPlugins(false)} />
                  </div>
                </Suspense>
              </PanelErrorBoundary>
            ) : showSchedule ? (
              <PanelErrorBoundary
                name="SchedulePage"
                resetKey="schedule"
                fallback={<MainPanelFallback />}
              >
                <Suspense fallback={<MainPanelFallback />}>
                  <div className="animate-page-enter flex flex-col h-full min-h-0">
                    <SchedulePage onClose={() => setShowSchedule(false)} />
                  </div>
                </Suspense>
              </PanelErrorBoundary>
            ) : showSettings ? (
              <PanelErrorBoundary
                name="SettingsPanel"
                resetKey="settings"
                fallback={<MainPanelFallback />}
              >
                <Suspense fallback={<MainPanelFallback />}>
                  <div className="animate-page-enter flex flex-col h-full min-h-0">
                    <SettingsPanel onClose={() => setShowSettings(false)} />
                  </div>
                </Suspense>
              </PanelErrorBoundary>
            ) : activeSessionId ? (
              <PanelErrorBoundary
                name="ChatView"
                resetKey={activeSessionId}
                fallback={<MainPanelFallback />}
              >
                <Suspense fallback={<MainPanelFallback />}>
                  <div className="animate-page-enter flex flex-col h-full min-h-0">
                    <ChatView />
                  </div>
                </Suspense>
              </PanelErrorBoundary>
            ) : (
              <div className="animate-page-enter flex flex-col h-full min-h-0">
                <WelcomeView />
              </div>
            )}
          </main>

          {/* Context Panel - only show when in session and not in full-page sections */}
          {activeSessionId && !showSettings && !showPlugins && !showSchedule && (
            <PanelErrorBoundary
              name="ContextPanel"
              resetKey={activeSessionId}
              fallback={<ContextPanelFallback />}
            >
              <Suspense fallback={<ContextPanelFallback />}>
                <ContextPanel />
              </Suspense>
            </PanelErrorBoundary>
          )}
        </div>
      </div>

      {/* Permission Dialog */}
      {pendingPermission && <PermissionDialog permission={pendingPermission} />}

      {/* Sudo Password Dialog */}
      {pendingSudoPassword && <SudoPasswordDialog request={pendingSudoPassword} />}

      {/* Config Modal */}
      <PanelErrorBoundary name="ConfigModal" fallback={null}>
        <Suspense fallback={null}>
          <ConfigModal
            isOpen={showConfigModal}
            onClose={handleConfigClose}
            onSave={handleConfigSave}
            initialConfig={appConfig}
            isFirstRun={!isConfigured}
          />
        </Suspense>
      </PanelErrorBoundary>

      {/* Sandbox Setup Dialog */}
      {showSandboxSetup && (
        <SandboxSetupDialog
          progress={sandboxSetupProgress}
          onComplete={handleSandboxSetupComplete}
        />
      )}

      {/* Sandbox Sync Toast */}
      <SandboxSyncToast status={sandboxSyncStatus} />

      <GlobalNoticeToast
        notice={globalNotice}
        onDismiss={clearGlobalNotice}
        onAction={handleGlobalNoticeAction}
      />
    </div>
  );
}

export default App;
