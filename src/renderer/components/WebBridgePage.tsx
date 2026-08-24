import { Globe, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WebBridgePanel } from './WebBridgePanel';

interface WebBridgePageProps {
  onClose: () => void;
}

export function WebBridgePage({ onClose }: WebBridgePageProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="titlebar-drag flex items-center justify-between px-4 lg:px-8 py-4 border-b border-border-muted flex-shrink-0 bg-background/88 backdrop-blur-sm">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              {t('webBridge.title')}
            </p>
            <h3 className="mt-1 text-[1.15rem] font-semibold tracking-[-0.02em] text-text-primary">
              {t('webBridge.title')}
            </h3>
            <p className="mt-1 text-sm text-text-muted max-w-[36rem]">
              {t('webBridge.description')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 lg:px-8 lg:py-8">
          <div className="max-w-[860px] w-full min-w-0 mx-auto">
            <WebBridgePanel />
          </div>
        </div>
      </div>
    </div>
  );
}
