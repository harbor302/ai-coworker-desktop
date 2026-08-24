import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { useIPC } from '../hooks/useIPC';
import {
  ChevronDown,
  PanelLeftClose,
  Trash2,
  Search as SearchIcon,
  Plus,
  ListChecks,
  Check,
  Plug,
  Clock3,
} from 'lucide-react';
import type { Session } from '../types';

// Use BASE_URL so images resolve correctly in both dev and packaged (file://) modes
const sidebarLogoSrc = `${import.meta.env.BASE_URL}logo.png`;

type SessionGroup = {
  key: string;
  label: string;
  sessions: Session[];
};

export function Sidebar() {
  const { t } = useTranslation();
  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const setActiveSession = useAppStore((s) => s.setActiveSession);
  const unreadCompletedSessionIds = useAppStore((s) => s.unreadCompletedSessionIds);
  const completionFlashIds = useAppStore((s) => s.completionFlashIds);
  const clearCompletionFlash = useAppStore((s) => s.clearCompletionFlash);
  const setMessages = useAppStore((s) => s.setMessages);
  const setTraceSteps = useAppStore((s) => s.setTraceSteps);
  const isConfigured = useAppStore((s) => s.isConfigured);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const setShowPlugins = useAppStore((s) => s.setShowPlugins);
  const setPluginsTab = useAppStore((s) => s.setPluginsTab);
  const setShowSchedule = useAppStore((s) => s.setShowSchedule);
  const showPlugins = useAppStore((s) => s.showPlugins);
  const showSchedule = useAppStore((s) => s.showSchedule);
  const {
    deleteSession,
    batchDeleteSessions,
    getSessionMessages,
    getSessionTraceSteps,
    isElectron,
  } = useIPC();
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const normalizedQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);
  const filteredSessions = useMemo(() => {
    return normalizedQuery
      ? sessions.filter((session) => session.title.toLowerCase().includes(normalizedQuery))
      : sessions;
  }, [sessions, normalizedQuery]);

  const groupedSessions = useMemo(
    () => groupSessionsByDate(filteredSessions, t),
    [filteredSessions, t]
  );

  // Exit select mode when sidebar collapses
  useEffect(() => {
    if (sidebarCollapsed && isSelectMode) {
      setIsSelectMode(false);
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
    }
  }, [sidebarCollapsed, isSelectMode]);

  // Escape key exits select mode
  useEffect(() => {
    if (!isSelectMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSelectMode(false);
        setSelectedIds(new Set());
        setShowDeleteConfirm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelectMode]);

  // Reset selection when search query changes to avoid deleting hidden sessions
  useEffect(() => {
    if (isSelectMode) {
      setSelectedIds(new Set());
    }
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
  }, []);

  const toggleSelectSession = useCallback((sessionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  const visibleSessionIds = useMemo(() => filteredSessions.map((s) => s.id), [filteredSessions]);

  const allVisibleSelected =
    visibleSessionIds.length > 0 && visibleSessionIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = useCallback(() => {
    if (allVisibleSelected) {
      // Deselect all visible, keep others
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of visibleSessionIds) {
          next.delete(id);
        }
        return next;
      });
    } else {
      // Select all visible, keep existing selections
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of visibleSessionIds) {
          next.add(id);
        }
        return next;
      });
    }
  }, [allVisibleSelected, visibleSessionIds]);

  const handleBatchDelete = useCallback(() => {
    const visibleSet = new Set(visibleSessionIds);
    const ids = Array.from(selectedIds).filter((id) => visibleSet.has(id));
    if (ids.length === 0) return;
    batchDeleteSessions(ids);
    exitSelectMode();
  }, [selectedIds, visibleSessionIds, batchDeleteSessions, exitSelectMode]);

  const handleSessionClick = useCallback(
    async (sessionId: string) => {
      setShowSettings(false);
      setShowPlugins(false);
      setShowSchedule(false);

      if (activeSessionId === sessionId) return;

      setActiveSession(sessionId);

      // Read sessionStates at call-time from the store rather than closing over
      // the selector value. The selector returns a new object reference every
      // time any session's state changes (patchSession spreads the whole map),
      // so including it in deps would rebuild this callback on every streaming
      // tick and cause a React #185 "Maximum update depth exceeded" loop when
      // rapidly switching sessions on slow renderers (e.g. Windows).
      const currentSessionStates = useAppStore.getState().sessionStates;

      const existingMessages = currentSessionStates[sessionId]?.messages;
      if ((!existingMessages || existingMessages.length === 0) && isElectron) {
        try {
          const messages = await getSessionMessages(sessionId);
          if (messages && messages.length > 0) {
            setMessages(sessionId, messages);
          }
        } catch (error) {
          console.error('[Sidebar] Failed to load messages:', error);
        }
      }

      const existingSteps = currentSessionStates[sessionId]?.traceSteps;
      if ((!existingSteps || existingSteps.length === 0) && isElectron) {
        try {
          const steps = await getSessionTraceSteps(sessionId);
          setTraceSteps(sessionId, steps || []);
        } catch (error) {
          console.error('[Sidebar] Failed to load trace steps:', error);
        }
      }
    },
    [
      activeSessionId,
      getSessionMessages,
      getSessionTraceSteps,
      isElectron,
      setActiveSession,
      setMessages,
      setShowSettings,
      setShowPlugins,
      setShowSchedule,
      setTraceSteps,
    ]
  );

  const handleNewSession = () => {
    setActiveSession(null);
    setShowSettings(false);
    setShowPlugins(false);
    setShowSchedule(false);
  };

  const handleOpenPlugins = () => {
    setActiveSession(null);
    setShowSettings(false);
    setShowSchedule(false);
    setPluginsTab('dataAuthorization');
    setShowPlugins(true);
  };

  const handleOpenSchedule = () => {
    setActiveSession(null);
    setShowSettings(false);
    setShowPlugins(false);
    setShowSchedule(true);
  };

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    deleteSession(sessionId);
  };

  return (
    <aside
      className={`sidebar-glass relative h-full shrink-0 overflow-hidden border-r border-border-muted transition-[width,opacity] duration-300 ease-out ${
        sidebarCollapsed
          ? 'w-0 opacity-0 border-r-0 pointer-events-none'
          : 'w-[17.5rem] opacity-100'
      }`}
    >
      {/* Collapsed layer */}
      <div className="hidden">
        {/* Top drag bar */}
        <div className="h-[38px] titlebar-drag shrink-0" />

        {/* Top: Cowork badge */}
        <div className="px-2 pt-2 pb-2 flex flex-col items-center gap-2">
          <div className="w-full rounded-lg bg-background/50 p-0.5">
            <div className="w-full flex items-center justify-center rounded-md py-1 bg-surface text-text-primary shadow-sm">
              <ListChecks className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Nav items */}
        <div className="px-2 pt-1 pb-2 flex flex-col items-center gap-1">
          <button
            onClick={handleNewSession}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-background hover:bg-surface-hover transition-colors text-text-primary border border-border-subtle"
            title={t('sidebar.newTask')}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={handleOpenPlugins}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
              showPlugins
                ? 'bg-accent/10 text-accent'
                : 'text-text-secondary hover:bg-surface-hover'
            }`}
            title={t('plugins.title')}
          >
            <Plug className="w-4 h-4" />
          </button>
          <button
            onClick={handleOpenSchedule}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
              showSchedule
                ? 'bg-accent/10 text-accent'
                : 'text-text-secondary hover:bg-surface-hover'
            }`}
            title={t('settings.schedule')}
          >
            <Clock3 className="w-4 h-4" />
          </button>
        </div>

        {/* Session list - compact */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {sessions.slice(0, 20).map((session) => (
            <button
              key={session.id}
              onClick={() => handleSessionClick(session.id)}
              className={`w-full h-7 rounded-md flex items-center justify-center text-[10px] font-medium mb-0.5 transition-colors ${
                activeSessionId === session.id
                  ? 'bg-surface-hover text-text-primary'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
              }`}
              title={session.title}
            >
              {session.title.slice(0, 2).toUpperCase()}
            </button>
          ))}
        </div>

        {/* Bottom: logo + chevron */}
        <div className="px-2 py-3">
          <button
            onClick={() => {
              setShowPlugins(false);
              setShowSchedule(false);
              setShowSettings(true);
            }}
            className="w-full flex items-center justify-center gap-1 rounded-xl py-1.5 hover:bg-surface-hover transition-colors relative"
            title={t('sidebar.settings')}
          >
            <img src={sidebarLogoSrc} alt="" className="w-5 h-5 rounded-md object-cover" />
            <ChevronDown className="w-3 h-3 text-text-muted" />
            {!isConfigured && (
              <span className="absolute right-1 top-1 w-1.5 h-1.5 rounded-full bg-accent" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded layer */}
      <div
        className={`absolute inset-0 flex flex-col overflow-hidden transition-opacity duration-200 ${sidebarCollapsed ? 'opacity-0 invisible pointer-events-none' : 'opacity-100'}`}
      >
        {/* Top drag bar */}
        <div className="h-[38px] titlebar-drag shrink-0 flex items-center justify-start pl-[5.5rem]">
          <button
            onClick={toggleSidebar}
            className="titlebar-no-drag w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-hover transition-colors text-text-secondary"
            title={t('context.collapsePanel')}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <div className="px-3 pt-2 pb-3 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-xl bg-background/50 px-3 py-2">
              <ListChecks className="w-3.5 h-3.5 text-text-secondary" />
              <span className="text-[13px] font-medium text-text-primary">Cowork</span>
            </div>
          </div>

          {/* New task */}
          <button
            onClick={handleNewSession}
            className="w-full flex items-center gap-2.5 rounded-xl bg-background/50 px-3 py-2 text-left hover:bg-surface-hover transition-colors"
          >
            <Plus className="w-4 h-4 text-text-secondary" />
            <span className="text-[13px] font-medium text-text-primary">
              {t('sidebar.newTask')}
            </span>
          </button>

          {/* Nav items */}
          <nav className="space-y-0.5">
            <button
              onClick={handleOpenPlugins}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                showPlugins
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              <Plug className="w-4 h-4" />
              <span className="text-[13px]">{t('plugins.title')}</span>
            </button>
            <button
              onClick={handleOpenSchedule}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                showSchedule
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              <Clock3 className="w-4 h-4" />
              <span className="text-[13px]">{t('settings.schedule')}</span>
            </button>
          </nav>

          {/* Search */}
          {sessions.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('sidebar.search')}
                  className="w-full rounded-xl border border-transparent bg-background/50 pl-9 pr-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border focus:bg-background transition-colors"
                />
              </div>
              <button
                onClick={() => {
                  if (isSelectMode) {
                    exitSelectMode();
                  } else {
                    setIsSelectMode(true);
                  }
                }}
                className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                  isSelectMode
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                }`}
                title={t('sidebar.manage')}
              >
                <ListChecks className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {groupedSessions.length === 0 ? (
            <div className="px-3 py-6">
              <p className="text-sm text-text-secondary">{t('sidebar.noTasks')}</p>
              <p className="mt-1 text-xs leading-5 text-text-muted">{t('sidebar.noTasksHint')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupedSessions.map((group) => (
                <section key={group.key}>
                  <div className="px-3 pb-2 text-[11px] font-medium tracking-[0.04em] text-text-muted">
                    {group.label}
                  </div>
                  <div className="space-y-0.5">
                    {group.sessions.map((session) => {
                      const isActive = activeSessionId === session.id;
                      const isSelected = selectedIds.has(session.id);
                      return (
                        <div
                          key={session.id}
                          onClick={() => {
                            if (isSelectMode) {
                              toggleSelectSession(session.id);
                            } else {
                              handleSessionClick(session.id);
                            }
                          }}
                          onMouseEnter={() => setHoveredSession(session.id)}
                          onMouseLeave={() => setHoveredSession(null)}
                          className={`group relative cursor-pointer rounded-lg px-2.5 py-1.5 transition-colors ${
                            isSelectMode && isSelected
                              ? 'bg-accent-muted/20'
                              : isActive && !isSelectMode
                                ? 'bg-surface-hover/80'
                                : 'hover:bg-surface-hover/60'
                          } ${completionFlashIds.has(session.id) ? 'animate-completion-flash' : ''}`}
                          onAnimationEnd={() => {
                            if (completionFlashIds.has(session.id)) {
                              clearCompletionFlash(session.id);
                            }
                          }}
                        >
                          {/* Session execution status indicator */}
                          {session.status === 'running' && (
                            <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-accent animate-sidebar-running" />
                          )}
                          {session.status !== 'running' &&
                            unreadCompletedSessionIds.has(session.id) &&
                            !isActive && (
                              <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-error" />
                            )}
                          <div className={`flex items-center gap-2 ${!isSelectMode ? 'pr-6' : ''}`}>
                            {isSelectMode && (
                              <div
                                className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                                  isSelected
                                    ? 'bg-accent text-white'
                                    : 'border border-border-muted bg-background'
                                }`}
                              >
                                {isSelected && <Check className="w-2.5 h-2.5" />}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div
                                className={`text-[13px] font-medium leading-5 truncate ${
                                  session.status === 'running'
                                    ? 'text-accent animate-session-title'
                                    : 'text-text-primary'
                                }`}
                              >
                                {session.title}
                              </div>
                            </div>
                          </div>

                          {!isSelectMode && hoveredSession === session.id && (
                            <button
                              onClick={(e) => handleDeleteSession(e, session.id)}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg flex items-center justify-center text-text-muted hover:text-error hover:bg-surface-active transition-colors"
                              title={t('common.delete')}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {isSelectMode ? (
          <div className="px-3 py-3 border-t border-border-muted">
            {showDeleteConfirm ? (
              <div className="border border-error/30 bg-error/10 rounded-lg px-3 py-3">
                <p className="text-[13px] text-text-primary mb-3">
                  {t('sidebar.batchDeleteConfirm', { count: selectedIds.size })}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-3 py-1.5 rounded-lg text-[13px] font-medium text-text-secondary hover:bg-surface-hover transition-colors"
                  >
                    {t('sidebar.cancel')}
                  </button>
                  <button
                    onClick={handleBatchDelete}
                    className="flex-1 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-error text-white hover:bg-error/90 transition-colors"
                  >
                    {t('sidebar.confirmDelete')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <button
                    onClick={toggleSelectAll}
                    className="text-[12px] font-medium text-accent hover:text-accent/80 transition-colors"
                  >
                    {allVisibleSelected ? t('sidebar.deselectAll') : t('sidebar.selectAll')}
                  </button>
                  <span className="text-[12px] text-text-muted">
                    {t('sidebar.nSelected', { count: selectedIds.size })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={exitSelectMode}
                    className="flex-1 px-3 py-2 rounded-xl text-[13px] font-medium text-text-secondary hover:bg-surface-hover transition-colors"
                  >
                    {t('sidebar.cancel')}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={selectedIds.size === 0}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium bg-error text-white hover:bg-error/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="px-3 py-3">
            <button
              onClick={() => {
                setShowPlugins(false);
                setShowSchedule(false);
                setShowSettings(true);
              }}
              className="w-full flex items-center justify-between rounded-xl px-3 py-2 hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <img src={sidebarLogoSrc} alt="" className="w-5 h-5 rounded-md object-cover" />
                <div className="text-left">
                  <div className="text-[13px] font-medium text-text-primary">cowoker</div>
                  <div className="text-[11px] text-text-muted">
                    {isConfigured ? t('sidebar.apiConfigured') : t('sidebar.apiNotConfigured')}
                  </div>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-text-muted" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function groupSessionsByDate(sessions: Session[], t: (key: string) => string): SessionGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfPreviousWeek = startOfToday - 7 * 86_400_000;

  const buckets: SessionGroup[] = [
    { key: 'today', label: t('sidebar.today'), sessions: [] },
    { key: 'yesterday', label: t('sidebar.yesterday'), sessions: [] },
    { key: 'previousWeek', label: t('sidebar.previousWeek'), sessions: [] },
    { key: 'older', label: t('sidebar.older'), sessions: [] },
  ];

  const sortedSessions = [...sessions].sort(
    (a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
  );
  for (const session of sortedSessions) {
    const timestamp = session.updatedAt || session.createdAt;
    if (timestamp >= startOfToday) {
      buckets[0].sessions.push(session);
    } else if (timestamp >= startOfYesterday) {
      buckets[1].sessions.push(session);
    } else if (timestamp >= startOfPreviousWeek) {
      buckets[2].sessions.push(session);
    } else {
      buckets[3].sessions.push(session);
    }
  }

  return buckets.filter((bucket) => bucket.sessions.length > 0);
}
