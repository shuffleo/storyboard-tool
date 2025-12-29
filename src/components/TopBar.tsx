import { useState, useEffect } from 'react';
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
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(project?.title || 'Untitled Project');

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
  };

  const handleExportCSV = async () => {
    if (!project) return;
    const csv = await exportToCSV();
    downloadFile(csv, `${project.title}.csv`, 'text/csv');
  };

  const handleExportPDF = async () => {
    await exportStoryboardPDF();
  };

  const handleExportZIP = async () => {
    if (!project) return;
    await exportToZIP();
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

  return (
    <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 shadow-sm">
      <div className="flex items-center gap-4">
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
        <div className="flex gap-2">
          <button
            onClick={() => onViewChange('table')}
            className={`px-3 py-1 rounded text-sm font-medium ${
              currentView === 'table'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Table
          </button>
          <button
            onClick={() => onViewChange('storyboard')}
            className={`px-3 py-1 rounded text-sm font-medium ${
              currentView === 'storyboard'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Storyboard
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`px-2 py-1 rounded text-sm ${canUndo ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-400 cursor-not-allowed'}`}
            title="Undo (Cmd+Z)"
          >
            ↶ Undo
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className={`px-2 py-1 rounded text-sm ${canRedo ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-400 cursor-not-allowed'}`}
            title="Redo (Cmd+Shift+Z)"
          >
            ↷ Redo
          </button>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative group">
          <button className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded">
            Import
          </button>
          <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <button onClick={handleImportJSON} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">
              JSON
            </button>
            <button onClick={handleImportCSV} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">
              CSV
            </button>
            <button onClick={handleImportImages} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">
              Images
            </button>
            <button onClick={handleImportZIP} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">
              ZIP
            </button>
          </div>
        </div>
        <div className="relative group">
          <button className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded">
            Export
          </button>
          <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <button onClick={handleExportJSON} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">
              JSON
            </button>
            <button onClick={handleExportCSV} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">
              CSV
            </button>
            <button onClick={handleExportPDF} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">
              PDF Storyboard
            </button>
            <button onClick={handleExportZIP} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">
              ZIP (with images)
            </button>
          </div>
        </div>
        {isSaving ? (
          <span className="text-sm text-gray-500">Saving...</span>
        ) : (
          <span className="text-sm text-gray-500">Saved {formatLastSaved()}</span>
        )}
      </div>
    </div>
  );
}

