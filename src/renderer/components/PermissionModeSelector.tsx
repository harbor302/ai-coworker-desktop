import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { ShieldCheck, ShieldAlert, ChevronDown, Check } from 'lucide-react';

interface PermissionModeSelectorProps {
  className?: string;
}

export function PermissionModeSelector({ className }: PermissionModeSelectorProps) {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const options = [
    {
      value: 'ask' as const,
      label: t('permission.modeAskShort', '请求权限'),
      description: t('permission.modeAskShortDesc', '操作前先请求授权'),
      icon: ShieldCheck,
    },
    {
      value: 'auto_allow' as const,
      label: t('permission.modeAutoAllowShort', '全部允许'),
      description: t('permission.modeAutoAllowShortDesc', '无需授权直接执行'),
      icon: ShieldAlert,
    },
  ] as const;

  const currentOption = options.find((o) => o.value === settings.permissionMode) || options[0];
  const CurrentIcon = currentOption.icon;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
        title={t('permission.permissionMode')}
      >
        <CurrentIcon className="w-4 h-4" />
        <span className="hidden sm:inline">{currentOption.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-56 rounded-xl border border-border bg-surface shadow-elevated py-2 z-50 animate-fade-in">
          {options.map((opt) => {
            const Icon = opt.icon;
            const selected = settings.permissionMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  updateSettings({ permissionMode: opt.value });
                  setIsOpen(false);
                }}
                className="w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
              >
                <Icon
                  className={`w-5 h-5 mt-0.5 flex-shrink-0 ${selected ? 'text-accent' : 'text-text-muted'}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${selected ? 'text-accent' : 'text-text-primary'}`}
                    >
                      {opt.label}
                    </span>
                    {selected && <Check className="w-3.5 h-3.5 text-accent" />}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">{opt.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
