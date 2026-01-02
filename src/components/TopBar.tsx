import { useState, useEffect, useRef } from 'react';
import { ViewType } from '../App';
import { useStore } from '../store/useStore';
import { exportToJSON, exportToCSV, exportStoryboardPDF, exportToZIP, exportAnimaticsToMP4, downloadFile, importFromJSON, importFromCSV, importFromZIP, importImages, exportIndexedDB, importIndexedDB } from '../utils/importExport';
import { debugLogger } from '../utils/debug';

interface TopBarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

export function TopBar({ currentView, onViewChange }: TopBarProps) {
  const project = useStore((state) => state.project);
  const updateProject = useStore((state) => state.updateProject);
  const isSaving = useStore((state) => state.isSaving);
  const lastSaved = useStore((state) => state.lastSaved);
  const canUndo = useStore((state) => state.canUndo);
  const canRedo = useStore((state) => state.canRedo);
  const undo = useStore((state) => state.undo);
  const redo = useStore((state) => state.redo);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(project?.title || 'Untitled Project');
  const [menuOpen, setMenuOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [deleteAllModalOpen, setDeleteAllModalOpen] = useState(false);
  const [debugMode, setDebugMode] = useState(debugLogger.isEnabled());
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const clearAllContent = useStore((state) => state.clearAllContent);
  
  // Apply retro skin class to root element (Brutal mode is default)
  useEffect(() => {
    const root = document.documentElement;
    const saved = localStorage.getItem('retroSkin');
    // Default to true (Brutal mode) if not set
    const retroSkinEnabled = saved === null ? true : saved === 'true';
    if (retroSkinEnabled) {
      root.classList.add('retro-skin');
    } else {
      root.classList.remove('retro-skin');
    }
  }, []);

  const formatLastSaved = () => {
    if (!lastSaved) return '';
    const seconds = Math.floor((Date.now() - lastSaved) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  const handleExportJSON = async () => {
    if (!project) return;
    const json = await exportToJSON();
    downloadFile(json, `${project.title}.json`, 'application/json');
    setExportModalOpen(false);
    setMenuOpen(false);
  };

  const handleExportCSV = async () => {
    if (!project) return;
    const csv = await exportToCSV();
    downloadFile(csv, `${project.title}.csv`, 'text/csv');
    setExportModalOpen(false);
    setMenuOpen(false);
  };

  const handleExportPDF = async () => {
    await exportStoryboardPDF();
    setExportModalOpen(false);
    setMenuOpen(false);
  };

  const handleExportZIP = async () => {
    if (!project) return;
    await exportToZIP();
    setExportModalOpen(false);
    setMenuOpen(false);
  };

  const handleExportMP4 = async () => {
    if (!project) return;
    try {
      await exportAnimaticsToMP4();
      setExportModalOpen(false);
      setMenuOpen(false);
    } catch (error) {
      alert(`Failed to export MP4: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleImportJSON = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const replace = confirm('Replace all existing content? Click OK to replace, Cancel to add to existing content.');
        const text = await file.text();
        await importFromJSON(text, replace);
      }
    };
    input.click();
    setImportModalOpen(false);
    setMenuOpen(false);
  };

  const handleImportCSV = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const replace = confirm('Replace all existing content? Click OK to replace, Cancel to add to existing content.');
        const text = await file.text();
        await importFromCSV(text, replace);
      }
    };
    input.click();
    setImportModalOpen(false);
    setMenuOpen(false);
  };

  const handleImportZIP = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const replace = confirm('Replace all existing content? Click OK to replace, Cancel to add to existing content.');
        await importFromZIP(file, replace);
      }
    };
    input.click();
    setImportModalOpen(false);
    setMenuOpen(false);
  };

  const handleImportImages = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        await importImages(files);
      }
    };
    input.click();
    setImportModalOpen(false);
    setMenuOpen(false);
  };

  const handleExportIndexedDB = async () => {
    try {
      await exportIndexedDB();
      setExportModalOpen(false);
      setMenuOpen(false);
    } catch (error) {
      alert(`Failed to export IndexedDB: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleImportIndexedDB = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const replace = confirm('Replace all existing content? Click OK to replace, Cancel to add to existing content.');
        try {
          await importIndexedDB(file);
          if (!replace) {
            // If not replacing, we'd need to merge - for now just import
            alert('IndexedDB import completed. Note: This replaces all data.');
          }
        } catch (error) {
          alert(`Failed to import IndexedDB: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    };
    input.click();
    setImportModalOpen(false);
    setMenuOpen(false);
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (project && titleValue !== project.title) {
      // Truncate to 100 characters max
      const truncatedTitle = titleValue.length > 100 ? titleValue.substring(0, 100) : titleValue;
      updateProject({ title: truncatedTitle });
      setTitleValue(truncatedTitle);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.currentTarget as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setTitleValue(project?.title || 'Untitled Project');
      setIsEditingTitle(false);
    }
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Limit to 100 characters
    if (value.length <= 100) {
      setTitleValue(value);
    }
  };

  // Get display title (truncated in middle if too long)
  const displayTitle = project?.title || 'Untitled Project';
  const truncateMiddle = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    const half = Math.floor(maxLength / 2) - 1;
    return text.substring(0, half) + '...' + text.substring(text.length - half);
  };
  const truncatedDisplayTitle = truncateMiddle(displayTitle, 30);

  useEffect(() => {
    if (project?.title) {
      setTitleValue(project.title);
    }
  }, [project?.title]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !isEditingTitle) {
        e.preventDefault();
        undo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey)) && !isEditingTitle) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, isEditingTitle]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  // Close modals when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.modal-content') && !target.closest('[data-modal-trigger]')) {
        setImportModalOpen(false);
        setExportModalOpen(false);
        setDeleteAllModalOpen(false);
      }
    };

    if (importModalOpen || exportModalOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [importModalOpen, exportModalOpen]);

  // Handle PWA install prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  return (
    <div className="h-auto sm:h-12 bg-slate-800 border-b border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between px-2 sm:px-4 py-2 sm:py-0 shadow-sm gap-2 sm:gap-0">
      <div className={`flex flex-wrap items-center gap-2 sm:gap-4 ${isEditingTitle ? 'w-full' : 'w-full sm:w-auto'}`}>
        {isEditingTitle ? (
          <input
            type="text"
            value={titleValue}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => {
              // Allow standard keyboard shortcuts (Cmd/Ctrl+A, C, V, X, Z)
              if ((e.metaKey || e.ctrlKey) && ['a', 'c', 'v', 'x', 'z'].includes(e.key.toLowerCase())) {
                return; // Let browser handle these
              }
              handleTitleKeyDown(e);
            }}
            maxLength={100}
            className="text-lg font-semibold text-slate-100 bg-transparent border-b-2 border-slate-500 focus:outline-none w-full"
            autoFocus
          />
        ) : (
          <h1
            className="text-lg font-semibold text-slate-100 cursor-text hover:text-slate-300 max-w-[300px]"
            onClick={() => setIsEditingTitle(true)}
            title={displayTitle}
            style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
          >
            {truncatedDisplayTitle}
          </h1>
        )}
        {!isEditingTitle && (
          <>
            <div className="flex gap-1 sm:gap-2">
              <button
                onClick={() => onViewChange('table')}
                className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium ${
                  currentView === 'table'
                    ? 'bg-slate-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Table
              </button>
              <button
                onClick={() => onViewChange('storyboard')}
                className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium ${
                  currentView === 'storyboard'
                    ? 'bg-slate-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Storyboard
              </button>
              <button
                onClick={() => onViewChange('animatics')}
                className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium ${
                  currentView === 'animatics'
                    ? 'bg-slate-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Animatics
              </button>
            </div>
          </>
        )}
      </div>
      {!isEditingTitle && (
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={undo}
              disabled={!canUndo}
              className={`p-1.5 sm:p-2 rounded ${canUndo ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 cursor-not-allowed'}`}
              title="Undo (Cmd+Z)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className={`p-1.5 sm:p-2 rounded ${canRedo ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 cursor-not-allowed'}`}
              title="Redo (Cmd+Shift+Z)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
              </svg>
            </button>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 sm:p-2 text-slate-300 hover:bg-slate-700 rounded"
              title="Menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-slate-800 border border-slate-700 rounded shadow-lg z-50">
              <div className="py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setImportModalOpen(true);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
                  data-modal-trigger
                >
                  Import
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setExportModalOpen(true);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
                  data-modal-trigger
                >
                  Export
                </button>
                {showInstallPrompt && (
                  <button
                    onClick={() => {
                      handleInstallClick();
                      setMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
                  >
                    Install App
                  </button>
                )}
                <button
                  onClick={() => {
                    const newState = !debugMode;
                    setDebugMode(newState);
                    debugLogger.setEnabled(newState);
                    localStorage.setItem('debug-mode', String(newState));
                    setMenuOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
                >
                  {debugMode ? 'Disable Debug Mode' : 'Enable Debug Mode'}
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleteAllModalOpen(true);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/30 border-t border-slate-700 mt-1"
                >
                  Delete All Content
                </button>
                <div className="px-4 py-2 text-xs sm:text-sm text-slate-400 border-t border-slate-700 mt-1">
                  {isSaving ? (
                    <span>Last save: Saving...</span>
                  ) : (
                    <span>Last save: {formatLastSaved() || 'Never'}</span>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Import Modal */}
          {importModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-slate-800 rounded-lg shadow-xl w-80 modal-content">
                <div className="p-4 border-b border-slate-700">
                  <h3 className="text-lg font-semibold text-slate-100">Import</h3>
                </div>
                <div className="p-2">
                  <button onClick={handleImportJSON} className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded">
                    JSON
                  </button>
                  <button onClick={handleImportCSV} className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded">
                    CSV
                  </button>
                  <button onClick={handleImportImages} className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded">
                    Images
                  </button>
                  <button onClick={handleImportZIP} className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded">
                    ZIP
                  </button>
                  <button onClick={handleImportIndexedDB} className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded">
                    IndexedDB
                  </button>
                </div>
                <div className="p-4 border-t border-slate-700">
                  <button
                    onClick={() => setImportModalOpen(false)}
                    className="w-full px-4 py-2 text-sm text-slate-200 bg-slate-700 hover:bg-slate-600 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Export Modal */}
          {exportModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-slate-800 rounded-lg shadow-xl w-80 modal-content">
                <div className="p-4 border-b border-slate-700">
                  <h3 className="text-lg font-semibold text-slate-100">Export</h3>
                </div>
                <div className="p-2">
                  <button onClick={handleExportJSON} className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded">
                    JSON
                  </button>
                  <button onClick={handleExportCSV} className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded">
                    CSV
                  </button>
                  <button onClick={handleExportPDF} className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded">
                    PDF Storyboard
                  </button>
                  <button onClick={handleExportZIP} className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded">
                    ZIP (with images)
                  </button>
                  <button onClick={handleExportIndexedDB} className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded">
                    IndexedDB
                  </button>
                  <button onClick={handleExportMP4} className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded">
                    WebM Video
                  </button>
                </div>
                <div className="p-4 border-t border-slate-700">
                  <button
                    onClick={() => setExportModalOpen(false)}
                    className="w-full px-4 py-2 text-sm text-slate-200 bg-slate-700 hover:bg-slate-600 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete All Content Modal */}
          {deleteAllModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-slate-800 rounded-lg shadow-xl w-96 modal-content">
                <div className="p-4 border-b border-slate-700">
                  <h3 className="text-lg font-semibold text-red-400">Delete All Content</h3>
                </div>
                <div className="p-4">
                  <p className="text-sm text-slate-300 mb-4">
                    This action is <strong className="text-red-400">irreversible</strong>. All scenes, shots, images, and data will be permanently deleted.
                  </p>
                  <p className="text-sm text-slate-400 mb-4">
                    Would you like to export your project before deleting?
                  </p>
                </div>
                <div className="p-4 border-t border-slate-700 flex flex-col gap-2">
                  <button
                    onClick={async () => {
                      await clearAllContent();
                      setDeleteAllModalOpen(false);
                      setMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded"
                  >
                    Delete All Content
                  </button>
                  <button
                    onClick={async () => {
                      setDeleteAllModalOpen(false);
                      setMenuOpen(false);
                      setExportModalOpen(true);
                    }}
                    className="w-full px-4 py-2 text-sm text-slate-200 bg-slate-700 hover:bg-slate-600 rounded"
                  >
                    Export and Delete All Content
                  </button>
                  <button
                    onClick={() => setDeleteAllModalOpen(false)}
                    className="w-full px-4 py-2 text-sm text-slate-200 bg-slate-700 hover:bg-slate-600 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
