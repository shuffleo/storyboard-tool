import { useMemo, useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

interface StoryboardViewProps {
  onSelect: (id: string, type: 'project' | 'scene' | 'shot' | 'frame') => void;
}

export function StoryboardView({ onSelect }: StoryboardViewProps) {
  const shots = useStore((state) => state.shots);
  const frames = useStore((state) => state.frames);
  const scenes = useStore((state) => state.scenes);
  const reorderShots = useStore((state) => state.reorderShots);
  const addFrame = useStore((state) => state.addFrame);
  const createShot = useStore((state) => state.createShot);
  const createScene = useStore((state) => state.createScene);
  const deleteShot = useStore((state) => state.deleteShot);
  const bulkUpdateShots = useStore((state) => state.bulkUpdateShots);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [density, setDensity] = useState<'compact' | 'detailed'>('detailed');
  const [selectedShots, setSelectedShots] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState<Map<string, number>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const getShotFrames = (shotId: string) => {
    return frames.filter((f) => f.shotId === shotId).sort((a, b) => a.orderIndex - b.orderIndex);
  };

  const getSceneName = (sceneId?: string) => {
    if (!sceneId) return null;
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return null;
    // Use the same format as TableView: "sceneNumber: title" or just "sceneNumber" if no title
    const title = scene.title && scene.title.trim() ? scene.title : `Scene ${scene.sceneNumber}`;
    return `${scene.sceneNumber}: ${title}`;
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

  const handleImageDrop = (shotId: string, files: FileList) => {
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

  const handleImageUpload = (shotId: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('data-shot-id', shotId);
      fileInputRef.current.click();
    }
  };

  const handleCardClick = (e: React.MouseEvent, shotId: string, index: number) => {
    // Don't handle clicks on drag handle or image area
    if ((e.target as HTMLElement).closest('.drag-handle')) return;
    if ((e.target as HTMLElement).closest('.image-area')) return;
    
    if (e.ctrlKey || e.metaKey) {
      // Multi-select
      const newSelected = new Set(selectedShots);
      if (newSelected.has(shotId)) {
        newSelected.delete(shotId);
      } else {
        newSelected.add(shotId);
      }
      setSelectedShots(newSelected);
      setFocusedIndex(index);
    } else if (e.shiftKey && focusedIndex !== null) {
      // Range select
      const start = Math.min(focusedIndex, index);
      const end = Math.max(focusedIndex, index);
      const newSelected = new Set(selectedShots);
      for (let i = start; i <= end; i++) {
        newSelected.add(sortedShots[i].id);
      }
      setSelectedShots(newSelected);
      setFocusedIndex(index);
    } else {
      // Single select
      setSelectedShots(new Set([shotId]));
      setFocusedIndex(index);
      onSelect(shotId, 'shot');
    }
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    // Deselect if clicking on empty area (not on a card)
    if ((e.target as HTMLElement).closest('[data-card]')) return;
    setSelectedShots(new Set());
    setFocusedIndex(null);
  };

  const handleBatchDelete = () => {
    if (selectedShots.size === 0) return;
    if (confirm(`Delete ${selectedShots.size} selected shot(s)?`)) {
      selectedShots.forEach((id) => deleteShot(id, false)); // Don't ask about scene deletion for batch
      setSelectedShots(new Set());
    }
  };

  const handleBatchSceneChange = (sceneId: string) => {
    if (selectedShots.size === 0) return;
    bulkUpdateShots(Array.from(selectedShots), { sceneId: sceneId || undefined });
    setSelectedShots(new Set());
  };

  // Sort scenes for dropdown
  const sortedScenes = useMemo(() => {
    return [...scenes].sort((a, b) => {
      const numA = parseInt(a.sceneNumber, 10) || 0;
      const numB = parseInt(b.sceneNumber, 10) || 0;
      return numA - numB;
    });
  }, [scenes]);

  const handleMoveSelected = (direction: 'up' | 'down') => {
    if (focusedIndex === null || selectedShots.size === 0) return;
    
    const selectedIds = Array.from(selectedShots);
    const currentOrder = sortedShots.map(s => s.id);
    const newOrder = [...currentOrder];
    
    if (direction === 'up') {
      // Find the minimum index of selected items
      const minIndex = Math.min(...selectedIds.map(id => newOrder.indexOf(id)));
      if (minIndex > 0) {
        // Remove all selected items
        selectedIds.forEach(id => {
          const idx = newOrder.indexOf(id);
          if (idx !== -1) {
            newOrder.splice(idx, 1);
          }
        });
        
        // Insert at position before the minimum
        selectedIds.reverse().forEach(id => {
          newOrder.splice(minIndex - 1, 0, id);
        });
        
        reorderShots(newOrder);
        setFocusedIndex(Math.max(0, focusedIndex - 1));
      }
    } else {
      // Find the maximum index of selected items
      const maxIndex = Math.max(...selectedIds.map(id => newOrder.indexOf(id)));
      if (maxIndex < newOrder.length - 1) {
        // Remove all selected items
        selectedIds.forEach(id => {
          const idx = newOrder.indexOf(id);
          if (idx !== -1) {
            newOrder.splice(idx, 1);
          }
        });
        
        // Insert at position after the maximum
        const insertPos = maxIndex - selectedIds.length + 2;
        selectedIds.forEach(id => {
          newOrder.splice(insertPos, 0, id);
        });
        
        reorderShots(newOrder);
        setFocusedIndex(Math.min(sortedShots.length - 1, focusedIndex + 1));
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (focusedIndex === null) return;
      
      if (e.key === 'ArrowUp' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleMoveSelected('up');
      } else if (e.key === 'ArrowDown' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleMoveSelected('down');
      } else if (e.key === 'ArrowUp' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const newIndex = Math.max(0, focusedIndex - 1);
        setFocusedIndex(newIndex);
        if (!e.shiftKey) {
          setSelectedShots(new Set([sortedShots[newIndex].id]));
        }
      } else if (e.key === 'ArrowDown' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const newIndex = Math.min(sortedShots.length - 1, focusedIndex + 1);
        setFocusedIndex(newIndex);
        if (!e.shiftKey) {
          setSelectedShots(new Set([sortedShots[newIndex].id]));
        }
      }
    };

    if (containerRef.current) {
      containerRef.current.addEventListener('keydown', handleKeyDown);
      containerRef.current.focus();
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [focusedIndex, sortedShots, selectedShots]);

  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      <div className="p-2 sm:p-4 border-b border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 bg-white">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <button
            onClick={() => createShot()}
            className="px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs sm:text-sm font-medium"
          >
            + Add Shot
          </button>
          <button
            onClick={() => createScene()}
            className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-xs sm:text-sm font-medium"
          >
            + Add Scene
          </button>
          {selectedShots.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs sm:text-sm text-gray-600">{selectedShots.size} selected</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleMoveSelected('up')}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  title="Move up (Cmd/Ctrl+↑)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => handleMoveSelected('down')}
                  className="p-1 text-gray-400 hover:text-gray-600"
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
                className="px-2 sm:px-3 py-1 border border-gray-300 rounded text-xs sm:text-sm"
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
                className="px-2 sm:px-3 py-1 text-red-600 hover:bg-red-50 rounded text-xs sm:text-sm border border-red-300 hover:border-red-400 flex items-center gap-1"
                title="Delete selected"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="hidden sm:inline">Delete</span>
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setLayout(layout === 'grid' ? 'list' : 'grid')}
            className="px-2 sm:px-3 py-1 border border-gray-300 rounded text-xs sm:text-sm hover:bg-gray-100"
          >
            {layout === 'grid' ? 'List' : 'Grid'}
          </button>
          <button
            onClick={() => setDensity(density === 'compact' ? 'detailed' : 'compact')}
            className="px-2 sm:px-3 py-1 border border-gray-300 rounded text-xs sm:text-sm hover:bg-gray-100"
          >
            {density === 'compact' ? 'Compact' : 'Detailed'}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const shotId = e.currentTarget.getAttribute('data-shot-id');
          if (shotId && e.target.files) {
            handleImageDrop(shotId, e.target.files);
            e.currentTarget.value = '';
          }
        }}
      />

      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-2 sm:p-4 focus:outline-none"
        tabIndex={0}
        onClick={handleContainerClick}
      >
        <div
          className={layout === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4' : 'flex flex-col gap-2 sm:gap-4'}
        >
          {sortedShots.map((shot, index) => {
            const shotFrames = getShotFrames(shot.id);
            const sceneName = getSceneName(shot.sceneId);
            const isSelected = selectedShots.has(shot.id);
            const isFocused = focusedIndex === index;
            const canMoveUp = index > 0;
            const canMoveDown = index < sortedShots.length - 1;
            
            return (
              <div
                key={shot.id}
                data-card
                className={`bg-white rounded-lg border-2 ${
                  isSelected
                    ? 'border-blue-400 shadow-md'
                    : 'border-gray-200'
                } ${isFocused ? 'ring-2 ring-blue-300' : ''} ${
                  density === 'compact' ? 'p-2' : 'p-2 sm:p-4'
                } transition-all`}
                onClick={(e) => handleCardClick(e, shot.id, index)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveShot(shot.id, 'up');
                        }}
                        disabled={!canMoveUp}
                        className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveShot(shot.id, 'down');
                        }}
                        disabled={!canMoveDown}
                        className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                              <span className="font-semibold text-sm text-gray-900">{shot.shotCode}</span>
                              {sceneName && (
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                  {sceneName}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mb-2">
                            <div
                              className={`image-area ${
                                density === 'compact' ? 'h-24' : 'h-48'
                              } border border-gray-200 rounded bg-gray-50 flex items-center justify-center relative cursor-pointer`}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (e.dataTransfer.files.length > 0) {
                                  handleImageDrop(shot.id, e.dataTransfer.files);
                                }
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleImageUpload(shot.id);
                              }}
                            >
                              {shotFrames.length > 0 ? (
                                <>
                                  <img
                                    src={shotFrames[currentImageIndex.get(shot.id) || 0]?.image || shotFrames[0].image}
                                    alt={shot.shotCode}
                                    className="w-full h-full object-contain rounded"
                                  />
                                  {shotFrames.length > 1 && (
                                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs text-center py-0.5">
                                      {(currentImageIndex.get(shot.id) || 0) + 1}/{shotFrames.length}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="text-center text-gray-400 text-sm">
                                  Drop image here or click to upload
                                </div>
                              )}
                            </div>
                            {shotFrames.length > 1 && (
                              <div className="flex items-center justify-center gap-1 mt-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const currentIdx = currentImageIndex.get(shot.id) || 0;
                                    const newIndex = currentIdx > 0 ? currentIdx - 1 : shotFrames.length - 1;
                                    setCurrentImageIndex((prev) => {
                                      const newMap = new Map(prev);
                                      newMap.set(shot.id, newIndex);
                                      return newMap;
                                    });
                                  }}
                                  className="p-0.5 bg-gray-200 hover:bg-gray-300 rounded text-gray-700"
                                  title="Previous image"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const currentIdx = currentImageIndex.get(shot.id) || 0;
                                    const newIndex = currentIdx < shotFrames.length - 1 ? currentIdx + 1 : 0;
                                    setCurrentImageIndex((prev) => {
                                      const newMap = new Map(prev);
                                      newMap.set(shot.id, newIndex);
                                      return newMap;
                                    });
                                  }}
                                  className="p-0.5 bg-gray-200 hover:bg-gray-300 rounded text-gray-700"
                                  title="Next image"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>

                          {density === 'detailed' && shot.scriptText && (
                            <div className="text-xs text-gray-600 mb-2 line-clamp-2">{shot.scriptText}</div>
                          )}
                        </div>
                    );
                  })}
        </div>
      </div>
    </div>
  );
}
