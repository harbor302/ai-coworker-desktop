import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore, type PluginsTab } from '../store';
import { SettingsConnectors } from './settings/SettingsConnectors';
import { SettingsSkills } from './settings/SettingsSkills';
import { WebBridgePanel } from './WebBridgePanel';

interface PluginsPageProps {
  onClose: () => void;
}

const tabs: Array<{
  id: PluginsTab;
  titleKey: string;
}> = [
  {
    id: 'dataAuthorization',
    titleKey: 'plugins.dataAuthorization',
  },
  {
    id: 'skills',
    titleKey: 'plugins.skills',
  },
  {
    id: 'webBridge',
    titleKey: 'plugins.webBridge',
  },
];

export function PluginsPage({ onClose }: PluginsPageProps) {
  const { t } = useTranslation();
  const pluginsTab = useAppStore((s) => s.pluginsTab);
  const setPluginsTab = useAppStore((s) => s.setPluginsTab);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="titlebar-drag border-b border-border-muted bg-background/88 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-8">
            <div className="titlebar-no-drag flex min-w-0 items-center gap-1 rounded-xl bg-surface/70 p-1">
              {tabs.map((tab) => {
                const selected = tab.id === pluginsTab;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setPluginsTab(tab.id)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                      selected
                        ? 'bg-background text-text-primary shadow-sm'
                        : 'text-text-muted hover:bg-background/60 hover:text-text-primary'
                    }`}
                  >
                    {t(tab.titleKey)}
                  </button>
                );
              })}
            </div>
            <button
              onClick={onClose}
              className="titlebar-no-drag p-2 rounded-lg hover:bg-surface-hover transition-colors"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 lg:px-8 lg:py-8">
          <div className="max-w-[920px] w-full min-w-0 mx-auto">
            {pluginsTab === 'dataAuthorization' && (
              <SettingsConnectors
                isActive={true}
                presetFilter={(key) => !key.startsWith('cowoker-')}
                serverFilter={(server) => !server.id.startsWith('mcp-cowoker-')}
              />
            )}
            {pluginsTab === 'skills' && <SettingsSkills isActive={true} />}
            {pluginsTab === 'webBridge' && <WebBridgePanel />}
          </div>
        </div>
      </div>
    </div>
  );
}
