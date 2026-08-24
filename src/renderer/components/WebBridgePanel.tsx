import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FolderOpen,
  Loader2,
  Play,
  Plug,
  Puzzle,
  RefreshCw,
  Square,
} from 'lucide-react';
import { SettingsConnectors } from './settings/SettingsConnectors';
import type { WebBridgeStatus } from '../types';

const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

export function WebBridgePanel() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<WebBridgeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<'start' | 'stop' | 'folder' | null>(null);
  const [error, setError] = useState('');
  const [lastChecked, setLastChecked] = useState<number | null>(null);

  const loadStatus = useCallback(async () => {
    if (!isElectron) return;
    setIsLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.webBridge.getStatus();
      setStatus(result);
      setLastChecked(Date.now());
    } catch (err) {
      setStatus({ healthy: false, running: false });
      setError(err instanceof Error ? err.message : t('webBridge.statusUnknown'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadStatus();
    const interval = setInterval(() => {
      void loadStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  async function handleStartDaemon() {
    setActionLoading('start');
    setError('');
    if (!isElectron) {
      setActionLoading(null);
      return;
    }
    try {
      const result = await window.electronAPI.webBridge.startDaemon();
      if (!result.success) {
        setError(result.error || t('webBridge.startFailed'));
      }
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('webBridge.startFailed'));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleStopDaemon() {
    setActionLoading('stop');
    setError('');
    if (!isElectron) {
      setActionLoading(null);
      return;
    }
    try {
      const result = await window.electronAPI.webBridge.stopDaemon();
      if (!result.success) {
        setError(result.error || t('webBridge.stopFailed'));
      }
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('webBridge.stopFailed'));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleOpenExtensionFolder() {
    setActionLoading('folder');
    setError('');
    if (!isElectron) {
      setActionLoading(null);
      return;
    }
    try {
      const result = await window.electronAPI.webBridge.showExtensionFolder();
      if (!result.success) {
        setError(result.error || t('webBridge.openFolderFailed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('webBridge.openFolderFailed'));
    } finally {
      setActionLoading(null);
    }
  }

  const healthy = status?.healthy === true;
  const running = status?.running === true;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-error/10 text-error text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div
        className={`rounded-2xl border p-4 flex items-center justify-between ${
          healthy
            ? 'border-success/30 bg-success/5'
            : running
              ? 'border-warning/30 bg-warning/5'
              : 'border-error/30 bg-error/5'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              healthy
                ? 'bg-success/10 text-success'
                : running
                  ? 'bg-warning/10 text-warning'
                  : 'bg-error/10 text-error'
            }`}
          >
            {healthy ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : running ? (
              <Activity className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text-primary">
              {healthy
                ? t('webBridge.statusHealthy')
                : running
                  ? t('webBridge.statusChecking')
                  : t('webBridge.statusUnhealthy')}
            </h4>
            <p className="text-xs text-text-muted">
              {status && lastChecked
                ? t('webBridge.lastChecked', { time: new Date(lastChecked).toLocaleTimeString() })
                : t('webBridge.checking')}
            </p>
          </div>
        </div>
        <button
          onClick={() => void loadStatus()}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-background border border-border hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {t('webBridge.refresh')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StepCard
          step={1}
          icon={<Puzzle className="w-5 h-5" />}
          title={t('webBridge.step1Title')}
          description={t('webBridge.step1Desc')}
          active={!healthy}
          complete={healthy}
        >
          <button
            onClick={() => void handleOpenExtensionFolder()}
            disabled={actionLoading === 'folder'}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'folder' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FolderOpen className="w-4 h-4" />
            )}
            {t('webBridge.step1OpenFolder')}
          </button>
        </StepCard>

        <StepCard
          step={2}
          icon={<Activity className="w-5 h-5" />}
          title={t('webBridge.step2Title')}
          description={t('webBridge.step2Desc')}
          active={!running && !healthy}
          complete={running}
        >
          {running ? (
            <button
              onClick={() => void handleStopDaemon()}
              disabled={actionLoading === 'stop'}
              className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-error/10 text-error border border-error/20 text-sm font-medium hover:bg-error/20 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'stop' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {t('webBridge.step2Stop')}
            </button>
          ) : (
            <button
              onClick={() => void handleStartDaemon()}
              disabled={actionLoading === 'start'}
              className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'start' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {t('webBridge.step2Start')}
            </button>
          )}
        </StepCard>

        <StepCard
          step={3}
          icon={<CheckCircle2 className="w-5 h-5" />}
          title={t('webBridge.step3Title')}
          description={t('webBridge.step3Desc')}
          active={running && !healthy}
          complete={healthy}
        >
          <div className="mt-3 space-y-1.5 text-xs">
            <StatusRow
              label={t('webBridge.daemonLabel')}
              value={running ? t('webBridge.daemonRunning') : t('webBridge.daemonStopped')}
              ok={running}
            />
            <StatusRow
              label={t('webBridge.extensionLabel')}
              value={
                status?.extensionConnected
                  ? t('webBridge.extensionConnected')
                  : t('webBridge.extensionDisconnected')
              }
              ok={status?.extensionConnected === true}
            />
            {status?.extensionVersion && (
              <div className="flex items-center justify-between text-text-muted">
                <span>{t('webBridge.extensionVersion')}</span>
                <span className="font-mono">v{status.extensionVersion}</span>
              </div>
            )}
            {typeof status?.pending === 'number' && (
              <div className="flex items-center justify-between text-text-muted">
                <span>{t('webBridge.pendingRequests')}</span>
                <span className="font-mono">{status.pending}</span>
              </div>
            )}
          </div>
        </StepCard>
      </div>

      <div
        className={`rounded-2xl border border-border bg-surface p-5 transition-opacity ${
          healthy ? '' : 'opacity-60'
        }`}
      >
        <div className="flex items-center gap-2 mb-4">
          <Plug className="w-4 h-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">
            {t('webBridge.connectorsTitle')}
          </h3>
        </div>
        {healthy ? (
          <SettingsConnectors
            isActive={true}
            presetFilter={(key) => key.startsWith('cowoker-')}
            serverFilter={(server) => server.id.startsWith('mcp-cowoker-')}
            hideSummary
            hideCustomAdd
          />
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-background/50 p-6 text-center text-text-muted text-sm">
            {t('webBridge.connectorsDisabledHint')}
          </div>
        )}
      </div>
    </div>
  );
}

function StepCard({
  step,
  icon,
  title,
  description,
  active,
  complete,
  children,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  active: boolean;
  complete: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 flex flex-col transition-all ${
        complete
          ? 'border-success/30 bg-success/5'
          : active
            ? 'border-accent/30 bg-accent/5'
            : 'border-border-subtle bg-surface'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold ${
              complete
                ? 'bg-success/10 text-success'
                : active
                  ? 'bg-accent/10 text-accent'
                  : 'bg-surface-muted text-text-muted'
            }`}
          >
            {complete ? <CheckCircle2 className="w-4 h-4" /> : icon}
          </div>
          <span
            className={`text-[11px] font-medium uppercase tracking-wider ${
              complete ? 'text-success' : active ? 'text-accent' : 'text-text-muted'
            }`}
          >
            {step}
          </span>
        </div>
        {complete && <ChevronRight className="w-4 h-4 text-success" />}
      </div>
      <h4 className="text-sm font-semibold text-text-primary mb-1">{title}</h4>
      <p className="text-xs text-text-muted leading-5 flex-1">{description}</p>
      {children}
    </div>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-muted">{label}</span>
      <span className={`flex items-center gap-1 ${ok ? 'text-success' : 'text-error'}`}>
        {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
        {value}
      </span>
    </div>
  );
}
