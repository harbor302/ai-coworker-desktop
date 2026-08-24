import { useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Wrench, Zap, Bot } from 'lucide-react';
import type { SlashCommandItem } from '../hooks/useSlashCommands';

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  selectedIndex: number;
  visible: boolean;
  onSelect: (item: SlashCommandItem) => void;
  menuRef: React.RefObject<HTMLDivElement>;
}

const categoryConfig = {
  skill: { label: 'Skills', icon: Wrench, color: 'text-accent' },
  command: { label: 'Commands', icon: Zap, color: 'text-warning' },
  agent: { label: 'Agents', icon: Bot, color: 'text-mcp' },
};

export function SlashCommandMenu({
  items,
  selectedIndex,
  visible,
  onSelect,
  menuRef,
}: SlashCommandMenuProps) {
  const { t } = useTranslation();
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Group items by category
  const grouped = useMemo(() => {
    const map = new Map<string, SlashCommandItem[]>();
    items.forEach((item) => {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    });
    return map;
  }, [items]);

  // Auto-scroll selected item into view
  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  if (!visible || items.length === 0) return null;

  let globalIndex = 0;

  return (
    <div
      ref={menuRef}
      className="absolute left-0 right-0 bottom-full mb-2 z-50 rounded-xl border border-border bg-surface shadow-elevated overflow-hidden max-h-80"
    >
      <div className="overflow-y-auto max-h-80 py-1">
        {Array.from(grouped.entries()).map(([category, categoryItems]) => {
          const config = categoryConfig[category as keyof typeof categoryConfig];
          const Icon = config.icon;
          return (
            <div key={category}>
              <div className="px-3 py-1.5 text-[11px] font-medium text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                <Icon className={`w-3 h-3 ${config.color}`} />
                {config.label}
              </div>
              {categoryItems.map((item) => {
                const isSelected = globalIndex === selectedIndex;
                const idx = globalIndex++;
                return (
                  <div
                    key={item.id}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    onClick={() => onSelect(item)}
                    className={`px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-accent/10 text-text-primary'
                        : 'hover:bg-surface-hover text-text-secondary'
                    }`}
                  >
                    <div className="text-sm font-medium">{item.name}</div>
                    {item.description && (
                      <div className="text-xs text-text-muted truncate mt-0.5">
                        {item.description}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="px-3 py-1.5 border-t border-border-muted text-[10px] text-text-muted flex items-center justify-between">
        <span>{t('slash.navHint', '↑↓ to navigate · Enter to select · Esc to close')}</span>
        <span className="text-text-muted/60">
          {items.length} {t('slash.items', 'items')}
        </span>
      </div>
    </div>
  );
}
