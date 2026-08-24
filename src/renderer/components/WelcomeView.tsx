import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { useIPC } from '../hooks/useIPC';
import type { ContentBlock } from '../types';
import { getInitialSessionTitle } from '../../shared/session-title';
import { ArrowRight, X, Paperclip, FolderOpen, ChevronDown, Folder, Plus } from 'lucide-react';
import { useSlashCommandMenu } from '../hooks/useSlashCommandMenu';
import { SlashCommandMenu } from './SlashCommandMenu';
import { ChatModelSelector } from './ChatModelSelector';
import { PermissionModeSelector } from './PermissionModeSelector';

type AttachedFile = {
  name: string;
  path: string;
  size: number;
  type: string;
  inlineDataBase64?: string;
};

export function WelcomeView() {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isComposingRef = useRef(false);
  const [pastedImages, setPastedImages] = useState<
    Array<{ url: string; base64: string; mediaType: string }>
  >([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slashMenu = useSlashCommandMenu({ prompt, setPrompt, textareaRef });
  const { startSession, changeWorkingDir, setWorkingDir, isElectron } = useIPC();
  const workingDir = useAppStore((state) => state.workingDir);
  const setGlobalNotice = useAppStore((state) => state.setGlobalNotice);
  const isConfigured = useAppStore((state) => state.isConfigured);
  const setShowSettings = useAppStore((state) => state.setShowSettings);
  const setSettingsTab = useAppStore((state) => state.setSettingsTab);
  const sessions = useAppStore((state) => state.sessions);
  const canSubmit = prompt.trim().length > 0 || pastedImages.length > 0 || attachedFiles.length > 0;

  // Folder dropdown state
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get recent workspaces from sessions, sorted by most recently updated
  const recentWorkspaces = sessions
    .filter((s): s is typeof s & { cwd: string } => !!s.cwd)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .reduce<Array<{ cwd: string; name: string }>>((acc, session) => {
      const cwd = session.cwd!;
      if (acc.some((item) => item.cwd === cwd)) return acc;
      const name = cwd.split(/[/\\]/).pop() || cwd;
      acc.push({ cwd, name });
      return acc;
    }, [])
    .slice(0, 5);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsFolderDropdownOpen(false);
      }
    };
    if (isFolderDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isFolderDropdownOpen]);

  const handleSelectFolder = async (dir?: string) => {
    try {
      const result = await changeWorkingDir(undefined, dir || workingDir || undefined);
      if (!result.success && result.error && result.error !== 'User cancelled') {
        setGlobalNotice({
          id: `notice-workdir-select-${Date.now()}`,
          type: 'warning',
          message: `${t('welcome.selectWorkingFolderFailed')}: ${result.error}`,
        });
      }
    } catch (error) {
      setGlobalNotice({
        id: `notice-workdir-select-${Date.now()}`,
        type: 'error',
        message:
          error instanceof Error && error.message
            ? `${t('welcome.selectWorkingFolderFailed')}: ${error.message}`
            : t('welcome.selectWorkingFolderFailed'),
      });
    }
  };

  const handleSelectRecentFolder = async (cwd: string) => {
    setIsFolderDropdownOpen(false);
    try {
      const result = await setWorkingDir(cwd);
      if (!result.success && result.error) {
        setGlobalNotice({
          id: `notice-workdir-set-${Date.now()}`,
          type: 'warning',
          message: `${t('welcome.selectWorkingFolderFailed')}: ${result.error}`,
        });
      }
    } catch (error) {
      setGlobalNotice({
        id: `notice-workdir-set-${Date.now()}`,
        type: 'error',
        message:
          error instanceof Error && error.message
            ? `${t('welcome.selectWorkingFolderFailed')}: ${error.message}`
            : t('welcome.selectWorkingFolderFailed'),
      });
    }
  };

  const handleChooseDifferentFolder = async () => {
    setIsFolderDropdownOpen(false);
    await handleSelectFolder();
  };

  // Handle paste event for images
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();

    const newImages: Array<{ url: string; base64: string; mediaType: string }> = [];

    for (const item of imageItems) {
      const blob = item.getAsFile();
      if (!blob) continue;

      try {
        // Resize if needed to stay under API limit
        const resizedBlob = await resizeImageIfNeeded(blob);
        const base64 = await blobToBase64(resizedBlob);
        const url = URL.createObjectURL(resizedBlob);
        newImages.push({
          url,
          base64,
          mediaType: resizedBlob.type,
        });
      } catch (err) {
        console.error('Failed to process pasted image:', err);
      }
    }

    setPastedImages((prev) => [...prev, ...newImages]);
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Resize and compress image if needed to stay under 5MB base64 limit
  const resizeImageIfNeeded = async (blob: Blob): Promise<Blob> => {
    // Claude API limit is 5MB for base64 encoded images
    // Base64 encoding increases size by ~33%, so we target 3.75MB for the blob
    const MAX_BLOB_SIZE = 3.75 * 1024 * 1024; // 3.75MB

    if (blob.size <= MAX_BLOB_SIZE) {
      return blob; // No need to resize
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);

        // Calculate scaling factor to reduce file size
        // We use a more aggressive approach: scale down until size is acceptable
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Start with a scale factor based on size ratio
        const scale = Math.sqrt(MAX_BLOB_SIZE / blob.size);
        const quality = 0.9;

        const attemptCompress = (currentScale: number, currentQuality: number): Promise<Blob> => {
          canvas.width = Math.floor(img.width * currentScale);
          canvas.height = Math.floor(img.height * currentScale);

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          return new Promise((resolveBlob) => {
            canvas.toBlob(
              (compressedBlob) => {
                if (!compressedBlob) {
                  reject(new Error('Failed to compress image'));
                  return;
                }

                // If still too large, try again with lower quality or scale
                if (
                  compressedBlob.size > MAX_BLOB_SIZE &&
                  (currentQuality > 0.5 || currentScale > 0.3)
                ) {
                  const newQuality = Math.max(0.5, currentQuality - 0.1);
                  const newScale = currentQuality <= 0.5 ? currentScale * 0.9 : currentScale;
                  attemptCompress(newScale, newQuality).then(resolveBlob);
                } else {
                  resolveBlob(compressedBlob);
                }
              },
              blob.type || 'image/jpeg',
              currentQuality
            );
          });
        };

        attemptCompress(scale, quality).then(resolve).catch(reject);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  };

  const removeImage = (index: number) => {
    setPastedImages((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].url);
      updated.splice(index, 1);
      return updated;
    });
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => {
      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleFileSelect = async () => {
    if (!isElectron || !window.electronAPI) {
      console.log('[WelcomeView] Not in Electron, file selection not available');
      return;
    }

    try {
      const filePaths = await window.electronAPI.selectFiles();
      if (filePaths.length === 0) return;

      const newFiles = filePaths.map((filePath) => {
        const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
        return {
          name: fileName,
          path: filePath,
          size: 0,
          type: 'application/octet-stream',
        };
      });

      setAttachedFiles((prev) => [...prev, ...newFiles]);
    } catch (error) {
      console.error('[WelcomeView] Error selecting files:', error);
    }
  };

  // Handle drag and drop for images
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    const otherFiles = files.filter((file) => !file.type.startsWith('image/'));

    if (imageFiles.length > 0) {
      const newImages: Array<{ url: string; base64: string; mediaType: string }> = [];

      for (const file of imageFiles) {
        try {
          // Resize if needed to stay under API limit
          const resizedBlob = await resizeImageIfNeeded(file);
          const base64 = await blobToBase64(resizedBlob);
          const url = URL.createObjectURL(resizedBlob);
          newImages.push({
            url,
            base64,
            mediaType: resizedBlob.type,
          });
        } catch (err) {
          console.error('Failed to process dropped image:', err);
        }
      }

      setPastedImages((prev) => [...prev, ...newImages]);
    }

    if (otherFiles.length > 0) {
      const newFiles = await Promise.all(
        otherFiles.map(async (file) => {
          const droppedPath = 'path' in file && typeof file.path === 'string' ? file.path : '';
          const inlineDataBase64 = droppedPath ? undefined : await blobToBase64(file);

          return {
            name: file.name,
            path: droppedPath,
            size: file.size,
            type: file.type || 'application/octet-stream',
            inlineDataBase64,
          };
        })
      );

      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    // Get value from ref to handle both controlled and uncontrolled cases
    const currentPrompt = textareaRef.current?.value || prompt;

    if (
      (!currentPrompt.trim() && pastedImages.length === 0 && attachedFiles.length === 0) ||
      isSubmitting
    )
      return;

    // Build content blocks
    const contentBlocks: ContentBlock[] = [];

    // Add images first
    pastedImages.forEach((img) => {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: img.base64,
        },
      });
    });

    // Add file attachments
    attachedFiles.forEach((file) => {
      contentBlocks.push({
        type: 'file_attachment',
        filename: file.name,
        relativePath: file.path,
        size: file.size,
        mimeType: file.type,
        inlineDataBase64: file.inlineDataBase64,
      });
    });

    // Add text if present
    if (currentPrompt.trim()) {
      contentBlocks.push({
        type: 'text',
        text: currentPrompt.trim(),
      });
    }

    // Use the global working directory (always available after app startup)
    setIsSubmitting(true);
    try {
      const sessionTitle = getInitialSessionTitle(currentPrompt, attachedFiles[0]?.name);
      const session = await startSession(sessionTitle, contentBlocks, workingDir || undefined);
      if (session) {
        setPrompt('');
        if (textareaRef.current) {
          textareaRef.current.value = '';
        }
        pastedImages.forEach((img) => URL.revokeObjectURL(img.url));
        setPastedImages([]);
        setAttachedFiles([]);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto-adjust textarea height based on content
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set max height to 200px (about 8 lines), then scroll
      const maxHeight = 200;
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
      // Show scrollbar if content exceeds max height
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  };

  // Adjust height when prompt changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [prompt]);

  return (
    <div className="titlebar-drag flex-1 flex flex-col items-center justify-start px-5 pt-[18vh] pb-10 md:px-8 md:pt-[22vh] md:pb-14">
      <div className="max-w-[840px] w-full space-y-7 animate-fade-in">
        <div className="text-center">
          <h1 className="welcome-heading-serif text-[2.55rem] md:text-[3.45rem] leading-tight text-text-primary">
            {t('welcome.title')}
          </h1>
        </div>

        {/* API Not Configured Hint */}
        {!isConfigured && (
          <p className="text-sm text-text-muted text-center">
            {t('welcome.apiNotConfigured')}{' '}
            <button
              type="button"
              onClick={() => {
                setSettingsTab('api');
                setShowSettings(true);
              }}
              className="inline-flex items-center gap-1 text-accent hover:text-accent-hover transition-colors"
            >
              {t('welcome.goToSettings')}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </p>
        )}

        {/* Main Input Card */}
        <form
          onSubmit={handleSubmit}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`titlebar-no-drag mx-auto w-full max-w-[760px] rounded-[1.85rem] border border-border-muted bg-background/58 shadow-[0_22px_60px_rgba(0,0,0,0.08)] backdrop-blur-sm transition-all duration-200 ${
            isDragging ? 'ring-2 ring-accent/45 bg-accent/5' : ''
          }`}
        >
          <div className="relative -m-px rounded-[1.85rem] border border-border-muted bg-background/96 px-6 pb-14 pt-5 shadow-[0_16px_42px_rgba(0,0,0,0.10)]">
            {/* Image previews */}
            {pastedImages.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 pb-4 mb-4 border-b border-border-muted w-full">
                {pastedImages.map((img, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={img.url}
                      alt={t('welcome.pastedImageAlt', { index: index + 1 })}
                      className="w-full aspect-square object-cover rounded-xl border border-border-subtle"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* File attachments */}
            {attachedFiles.length > 0 && (
              <div className="space-y-2 mb-4">
                {attachedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-muted border border-border-subtle group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">{file.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="w-6 h-6 rounded-full bg-error/10 hover:bg-error/20 text-error flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Text Input - Auto-resizing */}
            <div className="relative">
              <SlashCommandMenu
                items={slashMenu.filteredItems}
                selectedIndex={slashMenu.selectedIndex}
                visible={slashMenu.showMenu}
                onSelect={slashMenu.selectItem}
                menuRef={slashMenu.menuRef}
              />
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  adjustTextareaHeight();
                }}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  isComposingRef.current = false;
                }}
                onPaste={handlePaste}
                placeholder={t('welcome.placeholder')}
                rows={1}
                style={{ minHeight: '74px', maxHeight: '180px' }}
                className="w-full resize-none bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted/80 text-base leading-relaxed overflow-hidden"
                onKeyDown={(e) => {
                  if (slashMenu.handleKeyDown(e)) return;
                  // Enter to send, Shift+Enter for new line
                  if (e.key === 'Enter' && !e.shiftKey) {
                    if (e.nativeEvent.isComposing || isComposingRef.current || e.keyCode === 229) {
                      return;
                    }
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="absolute bottom-5 right-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_8px_18px_rgba(217,119,87,0.24)] transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
              title={isSubmitting ? t('welcome.starting') : t('welcome.letsGo')}
            >
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Inline bottom-left controls */}
            <div className="absolute bottom-4 left-6 flex items-center gap-1">
              {isElectron && (
                <button
                  type="button"
                  onClick={handleFileSelect}
                  className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-hover/70 hover:text-text-primary transition-colors"
                >
                  <Paperclip className="w-4 h-4" />
                  <span>{t('welcome.attachFiles')}</span>
                </button>
              )}
              <PermissionModeSelector className="shrink-0" />
              <ChatModelSelector align="right" className="shrink-0" />
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center px-6 py-3">
            {/* Folder Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsFolderDropdownOpen((prev) => !prev)}
                className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm transition-colors ${
                  workingDir
                    ? 'text-text-secondary hover:bg-surface-hover/70 hover:text-text-primary'
                    : 'text-accent hover:text-accent-hover'
                }`}
                title={workingDir || t('welcome.selectWorkingFolder')}
              >
                <FolderOpen className="w-4 h-4" />
                <span className="max-w-[160px] truncate">
                  {workingDir ? workingDir.split(/[/\\]/).pop() : t('welcome.selectWorkingFolder')}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-150 ${
                    isFolderDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Dropdown Menu */}
              {isFolderDropdownOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-border bg-surface shadow-elevated py-1.5 z-50 animate-fade-in">
                  {/* Current folder */}
                  {workingDir && (
                    <div className="px-3 py-2 border-b border-border-muted">
                      <p className="text-[11px] text-text-muted mb-1">当前文件夹</p>
                      <div className="flex items-center gap-2 text-sm text-text-primary">
                        <Folder className="w-4 h-4 text-accent" />
                        <span className="truncate">{workingDir.split(/[/\\]/).pop()}</span>
                      </div>
                      <p className="text-[10px] text-text-muted truncate mt-0.5">{workingDir}</p>
                    </div>
                  )}

                  {/* Recent workspaces */}
                  {recentWorkspaces.length > 0 && (
                    <div className="px-2 py-1.5">
                      <p className="px-1.5 text-[11px] text-text-muted mb-1">最近使用</p>
                      {recentWorkspaces.map((workspace) => (
                        <button
                          key={workspace.cwd}
                          type="button"
                          onClick={() => handleSelectRecentFolder(workspace.cwd)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                            workingDir === workspace.cwd
                              ? 'bg-accent-muted text-accent'
                              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                          }`}
                        >
                          <Folder className="w-3.5 h-3.5 shrink-0" />
                          <div className="text-left min-w-0">
                            <span className="block truncate">{workspace.name}</span>
                            <span className="block text-[10px] text-text-muted truncate">
                              {workspace.cwd}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Choose different folder */}
                  <div className="px-2 pt-1 border-t border-border-muted">
                    <button
                      type="button"
                      onClick={handleChooseDifferentFolder}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>选择其他文件夹</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
