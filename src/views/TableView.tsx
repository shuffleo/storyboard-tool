import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { Shot } from '../types';

interface TableViewProps {
  onSelect: (id: string, type: 'project' | 'scene' | 'shot' | 'frame') => void;
}

export function TableView({ onSelect }: TableViewProps) {
  const shots = useStore((state) => state.shots);
  const scenes = useStore((state) => state.scenes);
  const frames = useStore((state) => state.frames);
  const createShot = useStore((state) => state.createShot);
  const updateShot = useStore((state) => state.updateShot);
  const deleteShot = useStore((state) => state.deleteShot);
  const deleteScene = useStore((state) => state.deleteScene);
  const bulkUpdateShots = useStore((state) => state.bulkUpdateShots);
  const reorderShots = useStore((state) => state.reorderShots);
  const createScene = useStore((state) => state.createScene);
  const updateScene = useStore((state) => state.updateScene);
  const addFrame = useStore((state) => state.addFrame);
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; field: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string; value: string } | null>(null);
  const [editingScene, setEditingScene] = useState<{ sceneId: string; value: string } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [compactMode, setCompactMode] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState<Map<string, number>>(new Map());
  const [hoverPreview, setHoverPreview] = useState<{ image: string; x: number; y: number } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ shotId: string; sceneName: string; isLastShot: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const generalNotesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sort scenes by sceneNumber (low to high)
  // CRITICAL: Sort by sceneNumber (as number) not orderIndex
  const sortedScenes = useMemo(() => {
    return [...scenes].sort((a, b) => {
      const numA = parseInt(a.sceneNumber, 10) || 0;
      const numB = parseInt(b.sceneNumber, 10) || 0;
      return numA - numB;
    });
  }, [scenes]);

  // Sort shots by sceneNumber first, then by shotCode
  // CRITICAL: Sort by sceneNumber (as number), then shotCode (as number)
  const sortedShots = useMemo(() => {
    return [...shots].sort((a, b) => {
      // Get scene numbers
      const sceneA = scenes.find(s => s.id === a.sceneId);
      const sceneB = scenes.find(s => s.id === b.sceneId);
      const sceneNumA = sceneA ? (parseInt(sceneA.sceneNumber, 10) || 0) : 9999; // Unassigned goes last
      const sceneNumB = sceneB ? (parseInt(sceneB.sceneNumber, 10) || 0) : 9999;
      
      // First sort by scene number
      if (sceneNumA !== sceneNumB) {
        return sceneNumA - sceneNumB;
      }
      
      // Then sort by shot code (as number)
      const shotNumA = parseInt(a.shotCode, 10) || 0;
      const shotNumB = parseInt(b.shotCode, 10) || 0;
      return shotNumA - shotNumB;
    });
  }, [shots, scenes]);

  // Group shots by scene, with shots sorted within each scene
  // CRITICAL: This always groups by scene - there is no toggle anymore
  // Scenes are sorted by sceneNumber (low to high)
  // Shots within each scene are sorted by shotCode (low to high)
  const shotsByScene = useMemo(() => {
    const map = new Map<string, Shot[]>();
    sortedShots.forEach((shot) => {
      const key = shot.sceneId || 'unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(shot);
    });
    // Ensure shots within each scene are sorted by shotCode (as number)
    map.forEach((sceneShots, key) => {
      map.set(key, sceneShots.sort((a, b) => {
        const shotNumA = parseInt(a.shotCode, 10) || 0;
        const shotNumB = parseInt(b.shotCode, 10) || 0;
        return shotNumA - shotNumB;
      }));
    });
    return map;
  }, [sortedShots]);

  const getShotFrames = (shotId: string) => {
    return frames.filter((f) => f.shotId === shotId).sort((a, b) => a.orderIndex - b.orderIndex);
  };

  const handleCellClick = useCallback((rowId: string, field: string, currentValue: any) => {
    setSelectedCell({ rowId, field });
    setEditingCell({ rowId, field, value: String(currentValue || '') });
  }, []);

  const handleCellBlur = useCallback(() => {
    if (editingCell) {
      const { rowId, field, value } = editingCell;
      const shot = shots.find((s) => s.id === rowId);
      if (shot) {
        if (field === 'shotCode') {
          updateShot(rowId, { shotCode: value });
        } else         if (field === 'scriptText') {
          updateShot(rowId, { scriptText: value });
        } else if (field === 'generalNotes') {
          updateShot(rowId, { generalNotes: value });
        }
      }
    }
    setEditingCell(null);
    setSelectedCell(null);
  }, [editingCell, shots, updateShot]);

  const handleCellChange = useCallback((value: string) => {
    setEditingCell((prev) => {
      if (!prev) return null;
      return { ...prev, value };
    });
  }, []);

  const handleCellKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // Enter saves, Shift+Enter newline, Escape cancels
    if (e.key === 'Enter' && !e.shiftKey) {
      (e.currentTarget as HTMLElement).blur();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setSelectedCell(null);
    }
  }, []);

  const handleDeleteRow = (shotId: string) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    // Check if this is the last shot in the scene
    if (shot.sceneId) {
      const sceneShots = shots.filter(s => s.sceneId === shot.sceneId);
      if (sceneShots.length === 1) {
        // This is the last shot - show 3-option dialog
        const scene = scenes.find(s => s.id === shot.sceneId);
        if (scene) {
          const sceneName = scene.title && scene.title.trim() 
            ? `${scene.sceneNumber}: ${scene.title}`
            : `Scene ${scene.sceneNumber}`;
          setDeleteDialog({ shotId, sceneName, isLastShot: true });
          return;
        }
      }
    }

    // Not the last shot - show simple confirmation
    if (confirm('Delete this shot?')) {
      deleteShot(shotId, false); // Pass false to skip the scene deletion check
    }
  };

  const handleDeleteConfirm = (choice: 'row-only' | 'row-and-scene' | 'cancel') => {
    if (!deleteDialog) return;

    if (choice === 'cancel') {
      setDeleteDialog(null);
      return;
    }

    const shot = shots.find(s => s.id === deleteDialog.shotId);
    if (!shot) {
      setDeleteDialog(null);
      return;
    }

    if (choice === 'row-only') {
      // Delete row only
      deleteShot(deleteDialog.shotId, false);
    } else if (choice === 'row-and-scene') {
      // Delete row and scene
      if (shot.sceneId) {
        deleteShot(deleteDialog.shotId, false);
        deleteScene(shot.sceneId);
      } else {
        deleteShot(deleteDialog.shotId, false);
      }
    }

    setDeleteDialog(null);
  };

  const handleBatchDelete = () => {
    if (selectedRows.size === 0) return;
    if (confirm(`Delete ${selectedRows.size} selected shot(s)?`)) {
      selectedRows.forEach((id) => deleteShot(id));
      setSelectedRows(new Set());
    }
  };

  const handleBatchSceneChange = (sceneId: string) => {
    if (selectedRows.size === 0) return;
    bulkUpdateShots(Array.from(selectedRows), { sceneId: sceneId || undefined });
    setSelectedRows(new Set());
  };

  // Move multiple selected shots as a group
  const handleBatchMove = (direction: 'up' | 'down') => {
    if (selectedRows.size === 0) return;
    const selectedIds = Array.from(selectedRows);
    const currentOrder = sortedShots.map(s => s.id);
    const newOrder = [...currentOrder];
    
    if (direction === 'up') {
      const minIndex = Math.min(...selectedIds.map(id => newOrder.indexOf(id)));
      if (minIndex > 0) {
        // Remove all, insert one position earlier
        selectedIds.forEach(id => {
          const idx = newOrder.indexOf(id);
          if (idx !== -1) newOrder.splice(idx, 1);
        });
        selectedIds.reverse().forEach(id => {
          newOrder.splice(minIndex - 1, 0, id);
        });
        reorderShots(newOrder);
      }
    } else {
      const maxIndex = Math.max(...selectedIds.map(id => newOrder.indexOf(id)));
      if (maxIndex < newOrder.length - 1) {
        // Remove all, insert one position later
        selectedIds.forEach(id => {
          const idx = newOrder.indexOf(id);
          if (idx !== -1) newOrder.splice(idx, 1);
        });
        const insertPos = maxIndex - selectedIds.length + 2;
        selectedIds.forEach(id => {
          newOrder.splice(insertPos, 0, id);
        });
        reorderShots(newOrder);
      }
    }
  };

  const handleAddRowToScene = (sceneId?: string) => {
    const shotId = createShot(sceneId);
    // Scroll to the new shot after a brief delay to allow DOM update
    setTimeout(() => {
      const element = document.querySelector(`[data-shot-id="${shotId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        // If shot not found, scroll to scene header
        const sceneElement = document.querySelector(`[data-scene-id="${sceneId}"]`);
        if (sceneElement) {
          sceneElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }, 100);
  };


  /**
   * CRITICAL: Reordering function - DO NOT REMOVE
   * Moves a shot up or down in the order and updates shot codes automatically.
   * This replaces drag-and-drop functionality.
   * The reorderShots function in the store automatically recalculates shot codes.
   */
  const handleMoveShot = (shotId: string, direction: 'up' | 'down') => {
    const currentIndex = sortedShots.findIndex((s) => s.id === shotId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= sortedShots.length) return;
    
    const newOrder = Array.from(sortedShots.map((s) => s.id));
    const [removed] = newOrder.splice(currentIndex, 1);
    newOrder.splice(newIndex, 0, removed);
    // This automatically updates shot codes based on new order
    reorderShots(newOrder);
  };

  const handleImageUpload = (shotId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            addFrame(shotId, e.target.result as string);
          }
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const handleThumbnailClick = (shotId: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('data-shot-id', shotId);
      fileInputRef.current.click();
    }
  };

  const handleImageIndexChange = useCallback((shotId: string, index: number) => {
    setCurrentImageIndex((prev) => {
      const newMap = new Map(prev);
      newMap.set(shotId, index);
      return newMap;
    });
  }, []);

  const handleImageHover = useCallback((image: string | null, x: number, y: number) => {
    if (image) {
      setHoverPreview({ image, x, y });
    } else {
      setHoverPreview(null);
    }
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (hoverPreview) {
        setHoverPreview((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [hoverPreview]);

  useEffect(() => {
    if (editingCell) {
      if (editingCell.field === 'scriptText' && textareaRef.current) {
        textareaRef.current.focus();
        // Trigger auto-resize on focus
        const textarea = textareaRef.current;
        textarea.style.height = 'auto';
        const minHeight = 64;
        const newHeight = Math.max(minHeight, textarea.scrollHeight);
        textarea.style.height = `${newHeight}px`;
      } else if (editingCell.field === 'generalNotes' && generalNotesTextareaRef.current) {
        generalNotesTextareaRef.current.focus();
        // Trigger auto-resize on focus
        const textarea = generalNotesTextareaRef.current;
        textarea.style.height = 'auto';
        const minHeight = 64;
        const newHeight = Math.max(minHeight, textarea.scrollHeight);
        textarea.style.height = `${newHeight}px`;
      } else if (inputRef.current) {
        inputRef.current.focus();
        // Don't select all - let user type normally
      }
    }
  }, [editingCell]);


  // Handle keyboard shortcuts for batch move
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedRows.size === 0) return;
      if (e.key === 'ArrowUp' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleBatchMove('up');
      } else if (e.key === 'ArrowDown' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleBatchMove('down');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRows, sortedShots]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-900">
      <div className="p-2 sm:p-4 border-b border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <button
            onClick={() => {
              const sceneId = createScene();
              // Scroll to the new scene after a brief delay to allow DOM update
              setTimeout(() => {
                const element = document.querySelector(`[data-scene-id="${sceneId}"]`);
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }, 100);
            }}
            className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 text-xs sm:text-sm font-medium"
          >
            + Add Scene
          </button>
          {selectedRows.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs sm:text-sm text-slate-400">{selectedRows.size} selected</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleBatchMove('up')}
                  className="p-1 text-slate-400 hover:text-slate-300"
                  title="Move up (Cmd/Ctrl+↑)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => handleBatchMove('down')}
                  className="p-1 text-slate-400 hover:text-slate-300"
                  title="Move down (Cmd/Ctrl+↓)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              <select
                onChange={(e) => {
                  if (e.target.value.startsWith('scene:')) {
                    handleBatchSceneChange(e.target.value.split(':')[1]);
                  }
                  e.target.value = '';
                }}
                className="px-2 sm:px-3 py-1 border border-slate-600 bg-slate-800 text-slate-200 rounded text-xs sm:text-sm"
                defaultValue=""
              >
                <option value="">Move to scene...</option>
                <option value="scene:">Unassigned</option>
                {sortedScenes.map((s) => (
                  <option key={s.id} value={`scene:${s.id}`}>
                    {s.sceneNumber}: {s.title || `Scene ${s.sceneNumber}`}
                  </option>
                ))}
              </select>
              <button
                onClick={handleBatchDelete}
                className="px-2 sm:px-3 py-1 text-red-500 hover:bg-red-900/30 rounded text-xs sm:text-sm border border-red-600 hover:border-red-500 flex items-center gap-1"
                title="Delete selected"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => setCompactMode(!compactMode)}
          className="px-2 sm:px-3 py-1 border border-slate-600 bg-slate-800 text-slate-200 rounded text-xs sm:text-sm hover:bg-slate-700"
        >
          {compactMode ? 'Detailed' : 'Compact'}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const shotId = e.currentTarget.getAttribute('data-shot-id');
          if (shotId) {
            handleImageUpload(shotId, e.target.files);
            e.currentTarget.value = '';
          }
        }}
      />
      
      {hoverPreview && (
        <div
          className="fixed pointer-events-none z-50"
          style={{
            left: `${hoverPreview.x + 20}px`,
            top: `${hoverPreview.y + 20}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <img
            src={hoverPreview.image}
            alt="Preview"
            className="max-w-md max-h-md border-2 border-slate-600 rounded shadow-2xl"
            style={{ maxWidth: '400px', maxHeight: '400px', objectFit: 'contain' }}
          />
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="bg-slate-800 sticky top-0 z-10">
            <tr>
              {!compactMode && <th className="p-2 border-b border-slate-700 text-left text-xs font-semibold text-slate-400 w-8"></th>}
              {!compactMode && <th className="p-2 border-b border-slate-700 text-left text-xs font-semibold text-slate-400 w-8"></th>}
              <th className="p-2 border-b border-slate-700 text-left text-xs font-semibold text-slate-400 w-20 uppercase">Shot</th>
              <th className="p-2 border-b border-slate-700 text-left text-xs font-semibold text-slate-400 w-24 uppercase">Thumbnail</th>
              <th className="p-2 border-b border-slate-700 text-left text-xs font-semibold text-slate-400 uppercase">Script</th>
              <th className="p-2 border-b border-slate-700 text-left text-xs font-semibold text-slate-400 uppercase">General Notes</th>
              {!compactMode && <th className="p-2 border-b border-slate-700 text-left text-xs font-semibold text-slate-400 w-20"></th>}
            </tr>
          </thead>
          <tbody>
            {/* 
              CRITICAL: Always group by scene - no conditional rendering
              The table ALWAYS displays shots grouped by scene.
              Sorting: Scenes by sceneNumber (low to high), Shots by shotCode (low to high)
              When refactoring, DO NOT add back conditional rendering like:
                {groupByScene ? ... : sortedShots.map(...)}
              If removing conditionals, ensure ALL branches are removed, not just one.
            */}
            {Array.from(shotsByScene.entries()).sort(([sceneIdA], [sceneIdB]) => {
              // Sort scene entries by sceneNumber
              if (sceneIdA === 'unassigned') return 1;
              if (sceneIdB === 'unassigned') return -1;
              const sceneA = scenes.find(s => s.id === sceneIdA);
              const sceneB = scenes.find(s => s.id === sceneIdB);
              const numA = sceneA ? (parseInt(sceneA.sceneNumber, 10) || 0) : 0;
              const numB = sceneB ? (parseInt(sceneB.sceneNumber, 10) || 0) : 0;
              return numA - numB;
            }).map(([sceneId, sceneShots]) => {
                        const scene = scenes.find((s) => s.id === sceneId);
                        const isUnassigned = sceneId === 'unassigned';
                        return (
                          <React.Fragment key={sceneId}>
                            <tr className="bg-slate-800" data-scene-id={sceneId}>
                              <td colSpan={compactMode ? 4 : 7} className="p-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {isUnassigned ? (
                                      <span className="font-semibold text-sm text-slate-200">Unassigned</span>
                                    ) : (
                                      <input
                                    type="text"
                                    value={editingScene?.sceneId === sceneId ? editingScene.value : (scene?.title || '')}
                                    onChange={(e) => {
                                      if (scene) {
                                        setEditingScene({ sceneId: scene.id, value: e.target.value });
                                      }
                                    }}
                                    onFocus={() => {
                                      if (scene) {
                                        setEditingScene({ sceneId: scene.id, value: scene.title || '' });
                                      }
                                    }}
                                    onBlur={() => {
                                      if (scene && editingScene?.sceneId === scene.id) {
                                        const finalValue = editingScene.value.trim() || `Scene ${scene.sceneNumber}`;
                                        updateScene(scene.id, { title: finalValue });
                                        setEditingScene(null);
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      // Allow standard keyboard shortcuts
                                      if ((e.metaKey || e.ctrlKey) && ['a', 'c', 'v', 'x', 'z'].includes(e.key.toLowerCase())) {
                                        return; // Let browser handle these
                                      }
                                      if (e.key === 'Enter') {
                                        e.currentTarget.blur();
                                      } else if (e.key === 'Escape') {
                                        setEditingScene(null);
                                        e.currentTarget.blur();
                                      }
                                    }}
                                    className="font-semibold text-sm text-slate-200 bg-transparent border-b border-slate-500 focus:outline-none focus:border-slate-400"
                                    placeholder={`Scene ${scene?.sceneNumber}`}
                                  />
                                    )}
                                    <span className="text-xs text-slate-400">
                                      ({sceneShots.length} shots)
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => handleAddRowToScene(isUnassigned ? undefined : sceneId)}
                                    className="px-2 py-1 text-xs bg-slate-600 text-white rounded hover:bg-slate-700"
                                  >
                                    + Add Shot
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {sceneShots.map((shot) => {
                              const globalIndex = sortedShots.findIndex((s) => s.id === shot.id);
                              const canMoveUp = globalIndex > 0;
                              const canMoveDown = globalIndex < sortedShots.length - 1;
                              return (
                                <ShotRow
                                  key={shot.id}
                                  shot={shot}
                                  frames={getShotFrames(shot.id)}
                                  selectedCell={selectedCell}
                                  editingCell={editingCell}
                                  inputRef={inputRef}
                                  textareaRef={textareaRef}
                                  generalNotesTextareaRef={generalNotesTextareaRef}
                                  isSelected={selectedRows.has(shot.id)}
                                  isDragging={false}
                                  currentImageIndex={currentImageIndex.get(shot.id) || 0}
                                  canMoveUp={canMoveUp}
                                  canMoveDown={canMoveDown}
                                  onCellClick={handleCellClick}
                                  onCellBlur={handleCellBlur}
                                  onCellKeyDown={handleCellKeyDown}
                                  onCellChange={handleCellChange}
                                  onSelect={() => {
                                    try {
                                      onSelect(shot.id, 'shot');
                                    } catch (error) {
                                      console.error('Error selecting shot in TableView:', error);
                                    }
                                  }}
                                  onDelete={() => handleDeleteRow(shot.id)}
                                  onToggleSelect={(id) => {
                                    const newSelected = new Set(selectedRows);
                                    if (newSelected.has(id)) {
                                      newSelected.delete(id);
                                    } else {
                                      newSelected.add(id);
                                    }
                                    setSelectedRows(newSelected);
                                  }}
                                  onThumbnailClick={() => handleThumbnailClick(shot.id)}
                                  onImageIndexChange={handleImageIndexChange}
                                  onImageHover={handleImageHover}
                                  onMoveUp={() => handleMoveShot(shot.id, 'up')}
                                  onMoveDown={() => handleMoveShot(shot.id, 'down')}
                                  compactMode={compactMode}
                                />
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                </tbody>
          </table>
      </div>

      {/* Delete Dialog Modal */}
      {deleteDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg shadow-xl w-96 modal-content">
            <div className="p-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-slate-100">Delete Shot</h3>
            </div>
            <div className="p-4">
              <p className="text-sm text-slate-300 mb-4">
                This is the last shot in {deleteDialog.sceneName}.
              </p>
              <p className="text-sm text-slate-400 mb-4">
                What would you like to do?
              </p>
            </div>
            <div className="p-4 border-t border-slate-700 flex flex-col gap-2">
              <button
                onClick={() => handleDeleteConfirm('row-only')}
                className="w-full px-4 py-2 text-sm text-white bg-slate-600 hover:bg-slate-700 rounded"
              >
                Delete row only
              </button>
              <button
                onClick={() => handleDeleteConfirm('row-and-scene')}
                className="w-full px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded"
              >
                Delete row and scene
              </button>
              <button
                onClick={() => handleDeleteConfirm('cancel')}
                className="w-full px-4 py-2 text-sm text-slate-200 bg-slate-700 hover:bg-slate-600 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ShotRowProps {
  'data-shot-id'?: string;
  shot: Shot;
  frames: any[];
  selectedCell: { rowId: string; field: string } | null;
  editingCell: { rowId: string; field: string; value: string } | null;
  inputRef: React.RefObject<HTMLInputElement>;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  generalNotesTextareaRef: React.RefObject<HTMLTextAreaElement>;
  isSelected: boolean;
  isDragging: boolean;
  currentImageIndex: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onCellClick: (rowId: string, field: string, currentValue: any) => void;
  onCellBlur: () => void;
  onCellKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onCellChange: (value: string) => void;
  onSelect: () => void;
  onDelete: () => void;
  onToggleSelect: (id: string) => void;
  onThumbnailClick: () => void;
  onImageIndexChange: (shotId: string, index: number) => void;
  onImageHover: (image: string | null, x: number, y: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  compactMode: boolean;
}

// Auto-resizing textarea component
const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ value, onChange, ...props }, ref) => {
    const internalRef = useRef<HTMLTextAreaElement | null>(null);
    
    // Combine internal ref with forwarded ref
    const combinedRef = (node: HTMLTextAreaElement | null) => {
      internalRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref && 'current' in ref) {
        (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      }
    };

    const adjustHeight = () => {
      const textarea = internalRef.current;
      if (textarea) {
        // Reset height to auto to get the correct scrollHeight
        textarea.style.height = 'auto';
        // Set height based on scrollHeight, with minimum of 4rem
        const minHeight = 64; // 4rem in pixels
        const newHeight = Math.max(minHeight, textarea.scrollHeight);
        textarea.style.height = `${newHeight}px`;
      }
    };

    useEffect(() => {
      adjustHeight();
    }, [value]);

    // Also adjust on mount
    useEffect(() => {
      const textarea = internalRef.current;
      if (textarea) {
        // Small delay to ensure DOM is ready
        setTimeout(adjustHeight, 0);
      }
    }, []);

    return (
      <textarea
        ref={combinedRef}
        value={value}
        onChange={(e) => {
          if (onChange) {
            onChange(e);
          }
          // Adjust height after value changes
          setTimeout(() => {
            const textarea = internalRef.current;
            if (textarea) {
              textarea.style.height = 'auto';
              const minHeight = 64;
              const newHeight = Math.max(minHeight, textarea.scrollHeight);
              textarea.style.height = `${newHeight}px`;
            }
          }, 0);
        }}
        {...props}
      />
    );
  }
);
AutoResizeTextarea.displayName = 'AutoResizeTextarea';

interface ImageThumbnailProps {
  frames: any[];
  currentImageIndex: number;
  shotId: string;
  onThumbnailClick: () => void;
  onImageIndexChange: (shotId: string, index: number) => void;
  onImageHover: (image: string | null, x: number, y: number) => void;
}

const ImageThumbnail = React.memo(function ImageThumbnail({
  frames,
  currentImageIndex,
  shotId,
  onThumbnailClick,
  onImageIndexChange,
  onImageHover,
}: ImageThumbnailProps) {
  const hoverTimeoutRef = React.useRef<number | null>(null);
  const isPreviewShowingRef = React.useRef(false);

  // Show preview after 800ms hover delay
  const handleMouseEnter = (e: React.MouseEvent) => {
    hoverTimeoutRef.current = window.setTimeout(() => {
      isPreviewShowingRef.current = true;
      onImageHover(frames[currentImageIndex]?.image || null, e.clientX, e.clientY);
    }, 800);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    isPreviewShowingRef.current = false;
    onImageHover(null, 0, 0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPreviewShowingRef.current) {
      // Preview is already showing, update position
      onImageHover(frames[currentImageIndex]?.image || null, e.clientX, e.clientY);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {frames.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const newIndex = currentImageIndex > 0 ? currentImageIndex - 1 : frames.length - 1;
            onImageIndexChange(shotId, newIndex);
          }}
          className="p-0.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
          onMouseDown={(e) => e.stopPropagation()}
          title="Previous image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      <div
        className="w-16 h-10 relative cursor-pointer group"
        onClick={(e) => {
          e.stopPropagation();
          onThumbnailClick();
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
      >
        <img
          src={frames[currentImageIndex]?.image || frames[0]?.image}
          alt=""
          className="w-full h-full object-cover rounded border border-slate-600"
        />
        {frames.length > 1 && (
          <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs text-center py-0.5 font-semibold">
            {currentImageIndex + 1}/{frames.length}
          </div>
        )}
      </div>
      {frames.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const newIndex = currentImageIndex < frames.length - 1 ? currentImageIndex + 1 : 0;
            onImageIndexChange(shotId, newIndex);
          }}
          className="p-0.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
          onMouseDown={(e) => e.stopPropagation()}
          title="Next image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
});

const ShotRow = React.memo(function ShotRow({
  shot,
  frames,
  selectedCell,
  editingCell,
  inputRef,
  textareaRef,
  generalNotesTextareaRef,
  isSelected,
  isDragging,
  currentImageIndex,
  canMoveUp,
  canMoveDown,
  onCellClick,
  onCellBlur,
  onCellKeyDown,
  onCellChange,
  onSelect,
  onDelete,
  onToggleSelect,
  onThumbnailClick,
  onImageIndexChange,
  onImageHover,
  onMoveUp,
  onMoveDown,
  compactMode,
}: ShotRowProps) {
  const isEditing = editingCell?.rowId === shot.id;
  const cellSelected = selectedCell?.rowId === shot.id;

  const renderCell = (field: string, value: any, renderFn?: () => React.ReactNode) => {
    if (isEditing && editingCell?.field === field) {
      if (field === 'scriptText' || field === 'generalNotes') {
        const textareaRefToUse = field === 'scriptText' ? textareaRef : generalNotesTextareaRef;
        return (
          <AutoResizeTextarea
            ref={textareaRefToUse}
            value={editingCell.value}
            onChange={(e) => {
              e.stopPropagation();
              onCellChange(e.target.value);
            }}
            onBlur={(e) => {
              e.stopPropagation();
              onCellBlur();
            }}
            onKeyDown={(e) => {
              // Allow standard keyboard shortcuts (Cmd/Ctrl+A, C, V, X, Z)
              if ((e.metaKey || e.ctrlKey) && ['a', 'c', 'v', 'x', 'z'].includes(e.key.toLowerCase())) {
                return; // Let browser handle these
              }
              e.stopPropagation();
              onCellKeyDown(e);
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="border border-slate-500 bg-slate-900 text-white rounded text-xs focus:outline-none resize-none"
            style={{ 
              minHeight: '4rem',
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              display: 'block',
              padding: '0.5rem',
              margin: 0,
              overflow: 'hidden'
            }}
          />
        );
      }
      return (
        <input
          ref={field === editingCell.field ? inputRef : undefined}
          type="text"
          value={editingCell.value}
          onChange={(e) => {
            e.stopPropagation();
            onCellChange(e.target.value);
          }}
          onBlur={(e) => {
            e.stopPropagation();
            onCellBlur();
          }}
          onKeyDown={(e) => {
            // Allow standard keyboard shortcuts (Cmd/Ctrl+A, C, V, X, Z)
            if ((e.metaKey || e.ctrlKey) && ['a', 'c', 'v', 'x', 'z'].includes(e.key.toLowerCase())) {
              return; // Let browser handle these
            }
            e.stopPropagation();
            onCellKeyDown(e);
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full px-2 py-1 border border-slate-500 bg-slate-900 text-white rounded text-xs focus:outline-none"
        />
      );
    }
    if (renderFn) {
      return renderFn();
    }
    return (
      <div
        className={`px-2 py-1 cursor-text hover:bg-slate-800 rounded text-xs ${cellSelected && selectedCell?.field === field ? 'bg-slate-700/50' : ''}`}
        onClick={() => onCellClick(shot.id, field, value)}
      >
        {value || <span className="text-slate-500 text-xs">Click to edit</span>}
      </div>
    );
  };

  return (
    <tr
      data-shot-id={shot.id}
      className={`hover:bg-slate-800 ${isDragging ? 'opacity-50' : ''} ${isSelected ? 'bg-slate-700/50' : ''} ${compactMode ? 'h-8' : ''}`}
    >
      {!compactMode && (
        <td className="p-2 border-b border-slate-700">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(shot.id)}
            onClick={(e) => e.stopPropagation()}
            className="cursor-pointer"
          />
        </td>
      )}
      {!compactMode && (
        <td className="p-2 border-b border-slate-700">
          <div className="flex flex-col gap-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              disabled={!canMoveUp}
              className="p-0.5 text-slate-400 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move up"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              disabled={!canMoveDown}
              className="p-0.5 text-slate-400 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move down"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </td>
      )}
      <td className={`border-b border-slate-700 ${compactMode ? 'p-1' : 'p-2'}`}>
        {renderCell('shotCode', shot.shotCode)}
      </td>
      <td className={`border-b border-slate-700 ${compactMode ? 'p-1' : 'p-2'} text-center`}>
        {frames.length > 0 ? (
          <div className="flex justify-center">
            <ImageThumbnail
              frames={frames}
              currentImageIndex={currentImageIndex}
              shotId={shot.id}
              onThumbnailClick={onThumbnailClick}
              onImageIndexChange={onImageIndexChange}
              onImageHover={onImageHover}
            />
          </div>
        ) : (
          <div
            className="w-16 h-10 bg-slate-800 rounded border border-slate-600 flex items-center justify-center text-xs text-slate-500 cursor-pointer hover:bg-slate-700 mx-auto"
            onClick={(e) => {
              e.stopPropagation();
              onThumbnailClick();
            }}
          >
            Image
          </div>
        )}
      </td>
      <td className={`border-b border-slate-700 ${compactMode ? 'p-1' : 'p-2'}`} style={{ width: '30%', minWidth: '200px' }}>
        <div style={{ width: '100%' }}>
          {renderCell('scriptText', shot.scriptText, () => (
            <div
              className={`px-2 py-1 cursor-text hover:bg-slate-800 rounded text-xs ${compactMode ? 'min-h-[1rem]' : 'min-h-[2rem]'} ${cellSelected && selectedCell?.field === 'scriptText' ? 'bg-slate-700/50' : ''}`}
              onClick={() => onCellClick(shot.id, 'scriptText', shot.scriptText)}
            >
              {shot.scriptText || <span className="text-slate-500 text-xs">Click to edit</span>}
            </div>
          ))}
        </div>
      </td>
      <td className={`border-b border-slate-700 ${compactMode ? 'p-1' : 'p-2'}`} style={{ width: '30%', minWidth: '200px' }}>
        <div style={{ width: '100%' }}>
          {renderCell('generalNotes', shot.generalNotes, () => (
            <div
              className={`px-2 py-1 cursor-text hover:bg-slate-800 rounded text-xs ${compactMode ? 'min-h-[1rem]' : 'min-h-[2rem]'} ${cellSelected && selectedCell?.field === 'generalNotes' ? 'bg-slate-700/50' : ''}`}
              onClick={() => onCellClick(shot.id, 'generalNotes', shot.generalNotes)}
            >
              {shot.generalNotes || <span className="text-slate-500 text-xs">Click to edit</span>}
            </div>
          ))}
        </div>
      </td>
      {!compactMode && (
        <td className="p-2 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                try {
                  onSelect();
                } catch (error) {
                  console.error('Error in onSelect callback:', error);
                }
              }}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded"
              title="View details"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 text-red-500 hover:bg-red-900/30 rounded"
              title="Delete"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </td>
      )}
    </tr>
  );
});
