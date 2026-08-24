import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import type { SlashCommandItem } from './useSlashCommands';
import { useSlashCommands } from './useSlashCommands';

interface UseSlashCommandMenuOptions {
  prompt: string;
  setPrompt: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

interface UseSlashCommandMenuReturn {
  showMenu: boolean;
  filteredItems: SlashCommandItem[];
  selectedIndex: number;
  menuRef: React.RefObject<HTMLDivElement>;
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  selectItem: (item: SlashCommandItem) => void;
}

export function useSlashCommandMenu({
  prompt,
  setPrompt,
  textareaRef,
}: UseSlashCommandMenuOptions): UseSlashCommandMenuReturn {
  const { items } = useSlashCommands();
  const [showMenu, setShowMenu] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Detect slash command trigger: user typed '/' at the start or after a newline
  const slashQuery = useMemo(() => {
    // Match '/' at the beginning of the string or after a newline, followed by any text until the end
    const match = prompt.match(/(?:^|\n)\/([^\n]*)$/);
    if (!match) return null;
    return match[1];
  }, [prompt]);

  // Filter items based on the query after '/'
  const filteredItems = useMemo(() => {
    if (slashQuery === null) return [];
    const q = slashQuery.toLowerCase().trim();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false)
    );
  }, [items, slashQuery]);

  // Show/hide menu
  useEffect(() => {
    if (slashQuery !== null && filteredItems.length > 0) {
      setShowMenu(true);
    } else {
      setShowMenu(false);
    }
  }, [slashQuery, filteredItems.length]);

  // Reset selected index when filtered items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems.length]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !textareaRef.current?.contains(e.target as Node)
      ) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu, textareaRef]);

  const selectItem = useCallback(
    (item: SlashCommandItem) => {
      // Replace the trailing /query with /item-name followed by a space
      const newPrompt = prompt.replace(/(\/[^\n]*)$/, `/${item.name} `);
      setPrompt(newPrompt);
      setShowMenu(false);
      setSelectedIndex(0);
      // Restore focus to textarea
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          // Move cursor to the end
          const len = ta.value.length;
          ta.setSelectionRange(len, len);
        }
      });
    },
    [prompt, setPrompt, textareaRef]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showMenu || filteredItems.length === 0) return false;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % filteredItems.length);
          return true;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(
            (i) => (i - 1 + filteredItems.length) % filteredItems.length
          );
          return true;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          if (filteredItems[selectedIndex]) {
            selectItem(filteredItems[selectedIndex]);
          }
          return true;
        case 'Escape':
          e.preventDefault();
          setShowMenu(false);
          return true;
        default:
          return false;
      }
    },
    [showMenu, filteredItems, selectedIndex, selectItem]
  );

  return {
    showMenu,
    filteredItems,
    selectedIndex,
    menuRef,
    handleKeyDown,
    selectItem,
  };
}
