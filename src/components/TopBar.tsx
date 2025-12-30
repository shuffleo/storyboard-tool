import { useState, useEffect, useRef } from 'react';
import { ViewType } from '../App';
import { useStore } from '../store/useStore';
import { exportToJSON, exportToCSV, exportStoryboardPDF, exportToZIP, downloadFile, importFromJSON, importFromCSV, importFromZIP, importImages } from '../utils/importExport';

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
  const isGoogleDriveConnected = useStore((state) => state.isGoogleDriveConnected);
  const isGoogleSyncing = useStore((state) => state.isGoogleSyncing);
  const lastGoogleSync = useStore((state) => state.lastGoogleSync);
  const connectGoogleDrive = useStore((state) => state.connectGoogleDrive);
  const disconnectGoogleDrive = useStore((state) => state.disconnectGoogleDrive);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(project?.title || 'Untitled Project');
  const [menuOpen, setMenuOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const formatLastSaved = () => {
    // Use Google sync time if connected and synced, otherwise use local save time
    const timeToUse = isGoogleDriveConnected && lastGoogleSync ? lastGoogleSync : lastSaved;
    if (!timeToUse) return '';
    const seconds = Math.floor((Date.now() - timeToUse) / 1000);
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

  const handleGoogleDriveToggle = async () => {
    if (isGoogleDriveConnected) {
      await disconnectGoogleDrive();
    } else {
      await connectGoogleDrive();
    }
    setMenuOpen(false);
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (project && titleValue !== project.title) {
      updateProject({ title: titleValue });
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
      }
    };

    if (importModalOpen || exportModalOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [importModalOpen, exportModalOpen]);

  return (
    <div className="h-auto sm:h-12 bg-white border-b border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between px-2 sm:px-4 py-2 sm:py-0 shadow-sm gap-2 sm:gap-0">
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
        {isEditingTitle ? (
          <input
            type="text"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            className="text-lg font-semibold text-gray-900 bg-transparent border-b-2 border-blue-500 focus:outline-none"
            autoFocus
          />
        ) : (
          <h1
            className="text-lg font-semibold text-gray-900 cursor-text hover:text-blue-600"
            onClick={() => setIsEditingTitle(true)}
          >
            {project?.title || 'Untitled Project'}
          </h1>
        )}
        <div className="flex gap-1 sm:gap-2">
          <button
            onClick={() => onViewChange('table')}
            className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium ${
              currentView === 'table'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Table
          </button>
          <button
            onClick={() => onViewChange('storyboard')}
            className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium ${
              currentView === 'storyboard'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Storyboard
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`p-1.5 sm:p-2 rounded ${canUndo ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-400 cursor-not-allowed'}`}
            title="Undo (Cmd+Z)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className={`p-1.5 sm:p-2 rounded ${canRedo ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-400 cursor-not-allowed'}`}
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
            className="p-1.5 sm:p-2 text-gray-600 hover:bg-gray-100 rounded"
            title="Menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded shadow-lg z-50">
              <div className="py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setImportModalOpen(true);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                  data-modal-trigger
                >
                  Import
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setExportModalOpen(true);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                  data-modal-trigger
                >
                  Export
                </button>
                <button
                  onClick={handleGoogleDriveToggle}
                  disabled={isGoogleSyncing}
                  className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                    isGoogleSyncing ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isGoogleDriveConnected ? 'Disconnect from GDrive' : 'Connect to GDrive'}
                  {isGoogleSyncing && <span className="ml-2 text-xs text-gray-500">(Syncing...)</span>}
                </button>
                <div className="px-4 py-2 text-xs sm:text-sm text-gray-500 border-t border-gray-100 mt-1">
                  {isSaving || isGoogleSyncing ? (
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
              <div className="bg-white rounded-lg shadow-xl w-80 modal-content">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Import</h3>
                </div>
                <div className="p-2">
                  <button onClick={handleImportJSON} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 rounded">
                    JSON
                  </button>
                  <button onClick={handleImportCSV} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 rounded">
                    CSV
                  </button>
                  <button onClick={handleImportImages} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 rounded">
                    Images
                  </button>
                  <button onClick={handleImportZIP} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 rounded">
                    ZIP
                  </button>
                </div>
                <div className="p-4 border-t border-gray-200">
                  <button
                    onClick={() => setImportModalOpen(false)}
                    className="w-full px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
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
              <div className="bg-white rounded-lg shadow-xl w-80 modal-content">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Export</h3>
                </div>
                <div className="p-2">
                  <button onClick={handleExportJSON} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 rounded">
                    JSON
                  </button>
                  <button onClick={handleExportCSV} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 rounded">
                    CSV
                  </button>
                  <button onClick={handleExportPDF} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 rounded">
                    PDF Storyboard
                  </button>
                  <button onClick={handleExportZIP} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 rounded">
                    ZIP (with images)
                  </button>
                </div>
                <div className="p-4 border-t border-gray-200">
                  <button
                    onClick={() => setExportModalOpen(false)}
                    className="w-full px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
