import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { debugLogger } from '../utils/debug';

interface StoryboardViewProps {
  onSelect: (id: string, type: 'project' | 'scene' | 'shot' | 'frame') => void;
}

export function StoryboardView({ onSelect }: StoryboardViewProps) {
  const shots = useStore((state) => state.shots);
  const frames = useStore((state) => state.frames);
  const scenes = useStore((state) => state.scenes);
  const project = useStore((state) => state.project);
  const reorderShots = useStore((state) => state.reorderShots);
  const reorderScenes = useStore((state) => state.reorderScenes);
  const updateScene = useStore((state) => state.updateScene);
  const addFrame = useStore((state) => state.addFrame);
  const deleteShot = useStore((state) => state.deleteShot);
  const bulkUpdateShots = useStore((state) => state.bulkUpdateShots);
  // Persistent density preferences
  const [density, setDensity] = useState<'compact' | 'detailed'>(() => {
    const saved = localStorage.getItem('storyboardDensity');
    return (saved === 'compact' || saved === 'detailed') ? saved : 'detailed';
  });
  
  // Persist density changes
  useEffect(() => {
    localStorage.setItem('storyboardDensity', density);
  }, [density]);

  // Group by scene toggle
  const [groupByScene, setGroupByScene] = useState<boolean>(() => {
    const saved = localStorage.getItem('storyboardGroupByScene');
    return saved === 'true';
  });

  // Persist group by scene changes
  useEffect(() => {
    localStorage.setItem('storyboardGroupByScene', String(groupByScene));
  }, [groupByScene]);

  // Expanded scenes for accordion
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Initialize all scenes as expanded by default, and expand newly added scenes
  useEffect(() => {
    if (scenes.length > 0 && groupByScene) {
      setExpandedScenes(prev => {
        const newSet = new Set(prev);
        // Add all scene IDs to the expanded set
        scenes.forEach(scene => {
          newSet.add(scene.id);
        });
        // Add 'unassigned' for shots without scene
        newSet.add('unassigned');
        return newSet;
      });
    }
  }, [scenes, groupByScene]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
    };
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  // Expand all scenes
  const expandAllScenes = () => {
    const allSceneIds = new Set<string>();
    scenes.forEach(scene => {
      allSceneIds.add(scene.id);
    });
    allSceneIds.add('unassigned');
    setExpandedScenes(allSceneIds);
    setContextMenu(null);
  };

  // Collapse all scenes
  const collapseAllScenes = () => {
    setExpandedScenes(new Set());
    setContextMenu(null);
  };
  const [selectedShots, setSelectedShots] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState<Map<string, number>>(new Map());
  const [dragShotId, setDragShotId] = useState<string | null>(null);
  const [dragSceneId, setDragSceneId] = useState<string | null>(null);
  const [editingScene, setEditingScene] = useState<{ sceneId: string; value: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sort scenes by sceneNumber (low to high)
  const sortedScenes = useMemo(() => {
    return [...scenes].sort((a, b) => {
      const numA = parseInt(a.sceneNumber, 10) || 0;
      const numB = parseInt(b.sceneNumber, 10) || 0;
      return numA - numB;
    });
  }, [scenes]);

  // Group shots by scene
  const shotsByScene = useMemo(() => {
    const grouped = new Map<string | 'unassigned', typeof shots>();
    shots.forEach(shot => {
      const key = shot.sceneId || 'unassigned';
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(shot);
    });
    // Sort shots within each scene by shotCode
    grouped.forEach((sceneShots) => {
      sceneShots.sort((a, b) => {
        const shotNumA = parseInt(a.shotCode, 10) || 0;
        const shotNumB = parseInt(b.shotCode, 10) || 0;
        return shotNumA - shotNumB;
      });
    });
    return grouped;
  }, [shots]);

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
    debugLogger.log('StoryboardView', 'handleCardClick called', { 
      shotId, 
      index, 
      sortedShotsLength: sortedShots.length,
      eventTarget: (e.target as HTMLElement)?.tagName,
      eventTargetClass: (e.target as HTMLElement)?.className,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
      currentSelectedShots: Array.from(selectedShots),
      focusedIndex
    });
    
    e.stopPropagation();
    
    // Don't handle clicks on drag handle, image area, or buttons
    const target = e.target as HTMLElement;
    const dragHandle = target.closest('.drag-handle');
    const imageArea = target.closest('.image-area');
    const button = target.closest('button');
    const svg = target.closest('svg');
    
    debugLogger.log('StoryboardView', 'Click target analysis', {
      hasDragHandle: !!dragHandle,
      hasImageArea: !!imageArea,
      hasButton: !!button,
      hasSvg: !!svg,
      targetElement: target.tagName,
      targetClasses: target.className
    });
    
    if (dragHandle) {
      debugLogger.log('StoryboardView', 'Click ignored - drag handle');
      return;
    }
    if (imageArea) {
      debugLogger.log('StoryboardView', 'Click ignored - image area');
      return;
    }
    if (button) {
      debugLogger.log('StoryboardView', 'Click ignored - button', { buttonText: button.textContent });
      return;
    }
    if (svg) {
      debugLogger.log('StoryboardView', 'Click ignored - svg');
      return;
    }
    
    debugLogger.log('StoryboardView', 'Validating click parameters', {
      shotId,
      shotIdType: typeof shotId,
      shotIdLength: shotId?.length,
      index,
      indexType: typeof index,
      sortedShotsLength: sortedShots.length,
      indexInRange: index >= 0 && index < sortedShots.length
    });
    
    if (!shotId || index < 0 || index >= sortedShots.length) {
      debugLogger.warn('StoryboardView', 'Invalid card click - validation failed', { 
        shotId, 
        index, 
        shotsLength: sortedShots.length,
        shotIdValid: !!shotId,
        indexValid: index >= 0 && index < sortedShots.length
      });
      return;
    }
    
    const shot = sortedShots[index];
    debugLogger.log('StoryboardView', 'Retrieved shot from array', {
      shotExists: !!shot,
      shotId: shot?.id,
      shotCode: shot?.shotCode,
      shotSceneId: shot?.sceneId,
      shotOrderIndex: shot?.orderIndex
    });
    
    if (!shot) {
      debugLogger.error('StoryboardView', 'Shot not found at index - CRITICAL ERROR', undefined, { 
        index, 
        sortedShotsLength: sortedShots.length,
        sortedShotsIds: sortedShots.map(s => s?.id),
        sortedShotsCodes: sortedShots.map(s => s?.shotCode)
      });
      return;
    }
    
    try {
      if (e.ctrlKey || e.metaKey) {
        debugLogger.log('StoryboardView', 'Multi-select mode activated', {
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          currentlySelected: Array.from(selectedShots),
          shotIdInSelection: selectedShots.has(shotId)
        });
        // Multi-select
        const newSelected = new Set(selectedShots);
        if (newSelected.has(shotId)) {
          debugLogger.log('StoryboardView', 'Removing from selection', { shotId });
          newSelected.delete(shotId);
        } else {
          debugLogger.log('StoryboardView', 'Adding to selection', { shotId });
          newSelected.add(shotId);
        }
        debugLogger.log('StoryboardView', 'Updating selected shots state', {
          oldSelection: Array.from(selectedShots),
          newSelection: Array.from(newSelected)
        });
        setSelectedShots(newSelected);
        setFocusedIndex(index);
        debugLogger.log('StoryboardView', 'Multi-select state updated', { newSelection: Array.from(newSelected), focusedIndex: index });
      } else if (e.shiftKey && focusedIndex !== null) {
        debugLogger.log('StoryboardView', 'Range select mode activated', { 
          focusedIndex, 
          index,
          startIndex: Math.min(focusedIndex, index),
          endIndex: Math.max(focusedIndex, index)
        });
        // Range select
        const start = Math.min(focusedIndex, index);
        const end = Math.max(focusedIndex, index);
        const newSelected = new Set(selectedShots);
        const selectedIds: string[] = [];
        for (let i = start; i <= end && i < sortedShots.length; i++) {
          if (sortedShots[i]?.id) {
            newSelected.add(sortedShots[i].id);
            selectedIds.push(sortedShots[i].id);
          }
        }
        debugLogger.log('StoryboardView', 'Range selection calculated', {
          start,
          end,
          selectedIds,
          totalSelected: newSelected.size
        });
        setSelectedShots(newSelected);
        setFocusedIndex(index);
      } else {
        debugLogger.log('StoryboardView', 'Single select mode activated', { 
          shotId, 
          shotCode: shot.shotCode,
          shotSceneId: shot.sceneId,
          previousSelection: Array.from(selectedShots),
          previousFocusedIndex: focusedIndex
        });
        // Single select
        const newSelection = new Set([shotId]);
        debugLogger.log('StoryboardView', 'Setting single selection', {
          newSelection: Array.from(newSelection),
          newFocusedIndex: index
        });
        setSelectedShots(newSelection);
        setFocusedIndex(index);
        debugLogger.log('StoryboardView', 'State updated, about to call onSelect', {
          shotId,
          shotCode: shot.shotCode,
          shotExists: !!shot,
          shotIdValid: !!shotId && shotId.length > 0
        });
        if (shotId) {
          debugLogger.info('StoryboardView', 'Calling onSelect callback', { 
            shotId, 
            shotCode: shot.shotCode,
            shotType: typeof shotId,
            onSelectType: typeof onSelect,
            onSelectExists: !!onSelect
          });
          try {
            onSelect(shotId, 'shot');
            debugLogger.log('StoryboardView', 'onSelect called successfully - no exception thrown');
          } catch (selectError) {
            debugLogger.error('StoryboardView', 'Exception thrown in onSelect callback', selectError, {
              shotId,
              shotCode: shot.shotCode
            });
            throw selectError; // Re-throw to be caught by outer try-catch
          }
        } else {
          debugLogger.warn('StoryboardView', 'Not calling onSelect - shotId is falsy', { shotId });
        }
      }
      debugLogger.log('StoryboardView', 'handleCardClick completed successfully');
    } catch (error) {
      debugLogger.error('StoryboardView', 'Error in handleCardClick - EXCEPTION CAUGHT', error, { 
        shotId, 
        index,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        sortedShotsLength: sortedShots.length,
        shotExists: !!sortedShots[index]
      });
    }
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    // Deselect if clicking on empty area (not on a card)
    if ((e.target as HTMLElement).closest('[data-card]')) return;
    setSelectedShots(new Set());
    setFocusedIndex(null);
  };

  const handleTopBarClick = (e: React.MouseEvent) => {
    // Allow dismissing selection by clicking empty area in top bars
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('select')) return;
    setSelectedShots(new Set());
    setFocusedIndex(null);
  };

  // Drag handlers for card reordering
  const handleCardDragStart = (e: React.MouseEvent, shotId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragShotId(shotId);
  };

  const handleCardDrag = useCallback((e: MouseEvent) => {
    if (!dragShotId || !containerRef.current) return;
    
    // Find which card we're hovering over
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    const targetCard = elements.find(el => el.hasAttribute('data-card'));
    
    if (targetCard) {
      const targetShotId = targetCard.getAttribute('data-shot-id');
      if (targetShotId && targetShotId !== dragShotId) {
        const dragShot = shots.find(s => s.id === dragShotId);
        const targetShot = shots.find(s => s.id === targetShotId);
        
        // Only reorder if same scene
        if (dragShot && targetShot && dragShot.sceneId === targetShot.sceneId) {
          const currentOrder = sortedShots.map(s => s.id);
          const dragIndex = currentOrder.indexOf(dragShotId);
          const targetIndex = currentOrder.indexOf(targetShotId);
          
          if (dragIndex !== -1 && targetIndex !== -1) {
            const newOrder = [...currentOrder];
            newOrder.splice(dragIndex, 1);
            newOrder.splice(targetIndex, 0, dragShotId);
            reorderShots(newOrder);
          }
        }
      }
    }
  }, [dragShotId, shots, sortedShots, reorderShots]);

  const handleCardDragEnd = useCallback(() => {
    setDragShotId(null);
  }, []);

  // Global mouse handlers for drag
  useEffect(() => {
    if (dragShotId) {
      window.addEventListener('mousemove', handleCardDrag);
      window.addEventListener('mouseup', handleCardDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleCardDrag);
        window.removeEventListener('mouseup', handleCardDragEnd);
      };
    }
  }, [dragShotId, handleCardDrag, handleCardDragEnd]);

  // Get dragging shot's scene for dimming
  const draggingShot = dragShotId ? shots.find(s => s.id === dragShotId) : null;
  const draggingSceneId = draggingShot?.sceneId;

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

  const handleMoveSelected = (direction: 'up' | 'down') => {
    if (focusedIndex === null || selectedShots.size === 0) return;
    
    const selectedIds = Array.from(selectedShots);
    const currentOrder = sortedShots.map(s => s.id);
    const newOrder = [...currentOrder];
    
    if (direction === 'up') {
      // Move selected group up: find min index, remove all, insert one position earlier
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

  // Helper function to render a shot card
  const renderShotCard = (shot: typeof shots[0], index: number) => {
    const shotFrames = getShotFrames(shot.id);
    const sceneName = getSceneName(shot.sceneId);
    const isSelected = selectedShots.has(shot.id);
    const isFocused = focusedIndex === index;
    
    return (
      <div
        key={shot.id}
        data-card
        data-shot-id={shot.id}
        draggable
        onDragStart={(e) => handleCardDragStart(e, shot.id)}
        className={`group relative rounded-lg border-2 cursor-move flex flex-col ${
          isSelected
            ? 'bg-slate-700 border-slate-400 shadow-md'
            : 'bg-slate-800 border-slate-600'
        } ${isFocused ? 'ring-2 ring-slate-400' : ''} ${
          density === 'compact' ? 'p-2' : 'p-2 sm:p-4'
        } transition-all ${
          dragShotId && shot.sceneId !== draggingSceneId ? 'opacity-30' : ''
        } ${dragShotId === shot.id ? 'opacity-50' : ''}`}
        onClick={(e) => handleCardClick(e, shot.id, index)}
      >
        {/* Hover overlay - 5% white */}
        <div className="absolute inset-0 bg-white/5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-0" />
        {/* Selected overlay - 10% white */}
        {isSelected && (
          <div className="absolute inset-0 bg-white/10 rounded-lg z-0" />
        )}
        {/* Content wrapper with relative z-index */}
        <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-semibold text-sm text-slate-100">{shot.shotCode}</span>
          {sceneName && !groupByScene && (
            <span className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded">
              {sceneName}
            </span>
          )}
        </div>

        <div className="mb-2">
          <div
            className="image-area border border-slate-600 rounded bg-slate-900 flex items-center justify-center relative cursor-pointer overflow-hidden"
            style={{
              width: '100%',
              aspectRatio: project?.aspectRatio ? project.aspectRatio.replace(':', '/') : '16/9',
              maxHeight: density === 'compact' ? '96px' : 'none'
            }}
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
              try {
                if (shot.id) {
                  handleImageUpload(shot.id);
                }
              } catch (error) {
                console.error('Error handling image upload click:', error);
              }
            }}
          >
            {shotFrames.length > 0 ? (
              <>
                <img
                  src={shotFrames[currentImageIndex.get(shot.id) || 0]?.image || shotFrames[0].image}
                  alt={shot.shotCode}
                  className="absolute inset-0 w-full h-full object-cover rounded"
                  style={{ objectFit: 'cover' }}
                />
                {shotFrames.length > 1 && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs text-center py-0.5 z-10">
                    {(currentImageIndex.get(shot.id) || 0) + 1}/{shotFrames.length}
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-center text-slate-500 text-sm">
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
                className="p-0.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
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
                className="p-0.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
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
          <div className="text-xs text-slate-400 mb-2 line-clamp-2">{shot.scriptText}</div>
        )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-900">

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
        {groupByScene ? (
          // Grouped by scene view
          <div className="space-y-4">
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
              const isExpanded = expandedScenes.has(sceneId);
              const toggleExpanded = () => {
                setExpandedScenes(prev => {
                  const newSet = new Set(prev);
                  if (newSet.has(sceneId)) {
                    newSet.delete(sceneId);
                  } else {
                    newSet.add(sceneId);
                  }
                  return newSet;
                });
              };
              
              return (
                <div 
                  key={sceneId} 
                  data-scene-id={sceneId} 
                  className={`mb-4 ${dragSceneId === sceneId ? 'opacity-50' : ''}`}
                  draggable={!isUnassigned}
                  onDragStart={(e) => {
                    if (!isUnassigned) {
                      setDragSceneId(sceneId);
                      e.dataTransfer.effectAllowed = 'move';
                    } else {
                      e.preventDefault();
                    }
                  }}
                  onDragOver={(e) => {
                    if (!isUnassigned && dragSceneId && dragSceneId !== sceneId) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!isUnassigned && dragSceneId && dragSceneId !== sceneId) {
                      const currentOrder = sortedScenes.map(s => s.id);
                      const dragIndex = currentOrder.indexOf(dragSceneId);
                      const targetIndex = currentOrder.indexOf(sceneId);
                      
                      if (dragIndex !== -1 && targetIndex !== -1) {
                        const newOrder = [...currentOrder];
                        newOrder.splice(dragIndex, 1);
                        newOrder.splice(targetIndex, 0, dragSceneId);
                        reorderScenes(newOrder);
                      }
                    }
                    setDragSceneId(null);
                  }}
                  onDragEnd={() => {
                    setDragSceneId(null);
                  }}
                >
                  {/* Scene Header */}
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-2 cursor-move">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        {!isUnassigned && (
                          <button
                            onClick={toggleExpanded}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setContextMenu({ x: e.clientX, y: e.clientY });
                            }}
                            className="flex-shrink-0 text-slate-400 hover:text-slate-200 transition-transform border-none outline-none focus:outline-none"
                            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 12 12"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M4.5 2L8.5 6L4.5 10"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        )}
                        {isUnassigned ? (
                          <span className="font-semibold text-sm text-slate-200">Unassigned</span>
                        ) : (
                          <div className="flex items-center gap-1 flex-1">
                            <span className="font-semibold text-sm text-slate-200 flex-shrink-0">
                              {scene?.sceneNumber || sceneId}:
                            </span>
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
                              className="font-semibold text-sm text-slate-200 bg-transparent border-none outline-none focus:outline-none flex-1 px-0"
                              placeholder={`Scene ${scene?.sceneNumber || sceneId}`}
                            />
                          </div>
                        )}
                        <span className="text-xs text-slate-400">
                          ({sceneShots.length} shots)
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Scene Shots */}
                  {isExpanded && (
                    <div
                      className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-4`}
                    >
                      {sceneShots.map((shot) => {
                        const shotIndex = sortedShots.findIndex(s => s.id === shot.id);
                        return renderShotCard(shot, shotIndex);
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          // Ungrouped view (original)
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-4`}
          >
            {sortedShots.map((shot, index) => renderShotCard(shot, index))}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 bg-slate-800 border border-slate-600 rounded shadow-lg py-1 min-w-[150px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={expandAllScenes}
            className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
          >
            Expand All
          </button>
          <button
            onClick={collapseAllScenes}
            className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
          >
            Collapse All
          </button>
        </div>
      )}

      {/* Bottom Bar */}
      <div 
        className="p-2 sm:p-4 border-t border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 bg-slate-800"
        onClick={handleTopBarClick}
      >
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
          {selectedShots.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs sm:text-sm text-slate-400">{selectedShots.size} selected</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleMoveSelected('up')}
                  className="p-1 text-slate-400 hover:text-slate-300"
                  title="Move up (Cmd/Ctrl+↑)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => handleMoveSelected('down')}
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
            onClick={() => setGroupByScene(!groupByScene)}
            className="px-2 sm:px-3 py-1 border border-slate-600 bg-slate-800 text-slate-200 rounded text-xs sm:text-sm hover:bg-slate-700"
          >
            {groupByScene ? 'Ungroup' : 'Group by Scene'}
          </button>
          <button
            onClick={() => setDensity(density === 'compact' ? 'detailed' : 'compact')}
            className="px-2 sm:px-3 py-1 border border-slate-600 bg-slate-800 text-slate-200 rounded text-xs sm:text-sm hover:bg-slate-700"
          >
            {density === 'compact' ? 'Compact' : 'Detailed'}
          </button>
        </div>
      </div>
    </div>
  );
}
