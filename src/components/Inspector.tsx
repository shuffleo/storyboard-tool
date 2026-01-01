import React from 'react';
import { useStore } from '../store/useStore';
import { Shot, Scene, StoryboardFrame, Project } from '../types';
import { debugLogger } from '../utils/debug';

interface InspectorProps {
  selectedId: string | null;
  selectedType: 'project' | 'scene' | 'shot' | 'frame' | null;
  currentView?: 'table' | 'storyboard' | 'animatics';
  onClose: () => void;
}

export function Inspector({ selectedId, selectedType, currentView, onClose }: InspectorProps) {
  debugLogger.log('Inspector', 'Component rendering', {
    selectedId,
    selectedType,
    currentView,
    selectedIdType: typeof selectedId,
    selectedIdLength: selectedId?.length,
    selectedTypeType: typeof selectedType
  });
  
  const project = useStore((state) => state.project);
  const scenes = useStore((state) => state.scenes);
  const shots = useStore((state) => state.shots);
  const frames = useStore((state) => state.frames);
  const updateProject = useStore((state) => state.updateProject);
  const updateScene = useStore((state) => state.updateScene);
  const updateShot = useStore((state) => state.updateShot);
  const updateFrame = useStore((state) => state.updateFrame);
  
  // CRITICAL: Hooks must be called unconditionally at the top level
  // Use a Map to track current image index per shot
  const [currentImageIndices, setCurrentImageIndices] = React.useState<Map<string, number>>(new Map());
  
  debugLogger.log('Inspector', 'Store data retrieved', {
    projectExists: !!project,
    projectId: project?.id,
    scenesCount: scenes.length,
    shotsCount: shots.length,
    framesCount: frames.length
  });

  // Update currentImageIndex when frames change for selected shot
  React.useEffect(() => {
    if (!selectedId || selectedType !== 'shot') return;
    
    const shotFrames = frames
      .filter(f => f.shotId === selectedId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    
    if (shotFrames.length === 0) return;
    
    const currentIndex = currentImageIndices.get(selectedId) ?? 0;
    if (currentIndex >= shotFrames.length) {
      debugLogger.log('Inspector', 'Adjusting image index - frames reduced', {
        selectedId,
        oldIndex: currentIndex,
        newIndex: shotFrames.length - 1,
        framesCount: shotFrames.length
      });
      setCurrentImageIndices((prev: Map<string, number>) => {
        const newMap = new Map(prev);
        newMap.set(selectedId, Math.max(0, shotFrames.length - 1));
        return newMap;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedType, frames.length]);

  if (!selectedId || !selectedType) {
    debugLogger.log('Inspector', 'No selection - rendering empty state', {
      selectedId,
      selectedType,
      selectedIdFalsy: !selectedId,
      selectedTypeFalsy: !selectedType
    });
    return (
      <div className="w-80 bg-slate-800 border-l border-slate-700 p-4">
        <div className="text-slate-400 text-sm">Select an item to edit</div>
      </div>
    );
  }

  debugLogger.log('Inspector', 'Finding item in store', {
    selectedId,
    selectedType,
    scenesIds: scenes.map(s => s.id),
    shotsIds: shots.map(s => s.id),
    framesIds: frames.map(f => f.id)
  });

  let item: Project | Scene | Shot | StoryboardFrame | null = null;
  let updateFn: ((updates: any) => void) | null = null;

  if (selectedType === 'project') {
    debugLogger.log('Inspector', 'Selected type is project', { projectId: project?.id });
    item = project;
    updateFn = (updates) => updateProject(updates);
  } else if (selectedType === 'scene') {
    debugLogger.log('Inspector', 'Selected type is scene', { 
      selectedId, 
      scenesCount: scenes.length,
      matchingScene: scenes.find((s) => s.id === selectedId)?.id
    });
    item = scenes.find((s) => s.id === selectedId) || null;
    debugLogger.log('Inspector', 'Scene lookup result', { 
      found: !!item, 
      sceneId: item?.id,
      sceneTitle: (item as Scene)?.title
    });
    updateFn = (updates) => updateScene(selectedId, updates);
  } else if (selectedType === 'shot') {
    debugLogger.log('Inspector', 'Selected type is shot', { 
      selectedId, 
      shotsCount: shots.length,
      matchingShot: shots.find((s) => s.id === selectedId)?.id
    });
    item = shots.find((s) => s.id === selectedId) || null;
    debugLogger.log('Inspector', 'Shot lookup result', { 
      found: !!item, 
      shotId: item?.id,
      shotCode: (item as Shot)?.shotCode,
      shotSceneId: (item as Shot)?.sceneId
    });
    updateFn = (updates) => updateShot(selectedId, updates);
  } else if (selectedType === 'frame') {
    debugLogger.log('Inspector', 'Selected type is frame', { 
      selectedId, 
      framesCount: frames.length,
      matchingFrame: frames.find((f) => f.id === selectedId)?.id
    });
    item = frames.find((f) => f.id === selectedId) || null;
    debugLogger.log('Inspector', 'Frame lookup result', { 
      found: !!item, 
      frameId: item?.id,
      frameShotId: (item as StoryboardFrame)?.shotId
    });
    updateFn = (updates) => updateFrame(selectedId, updates);
  }

  debugLogger.log('Inspector', 'Item lookup completed', {
    itemExists: !!item,
    itemType: item ? (item as any).shotCode ? 'Shot' : (item as any).title ? 'Scene' : 'Project' : null,
    updateFnExists: !!updateFn,
    updateFnType: typeof updateFn
  });

  if (!item || !updateFn) {
    debugLogger.warn('Inspector', 'Item not found or updateFn missing', {
      itemExists: !!item,
      updateFnExists: !!updateFn,
      selectedId,
      selectedType,
      itemType: item ? typeof item : null
    });
    return (
      <div className="w-80 bg-slate-800 border-l border-slate-700 p-4">
        <div className="text-slate-400 text-sm">Item not found</div>
      </div>
    );
  }
  
  debugLogger.log('Inspector', 'Rendering Inspector with item', {
    itemType: selectedType,
    itemId: (item as any).id,
    itemCode: (item as Shot)?.shotCode,
    itemTitle: (item as Scene)?.title || (item as Project)?.title
  });

  return (
    <div className="w-80 bg-slate-800 border-l border-slate-700 flex flex-col h-full">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between gap-3">
        {selectedType === 'shot' ? (
          <div className="flex items-center gap-3 flex-1">
            <h2 className="font-semibold text-slate-100 capitalize">Shot</h2>
            <input
              type="text"
              value={(item as Shot).shotCode}
              onChange={(e) => updateFn({ shotCode: e.target.value })}
              className="flex-1 px-2 py-1 border border-slate-600 bg-slate-900 text-slate-100 rounded text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>
        ) : (
          <h2 className="font-semibold text-slate-100 capitalize">{selectedType}</h2>
        )}
        {currentView !== 'animatics' && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 flex-shrink-0"
          >
            ✕
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {selectedType === 'project' && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 uppercase">Title</label>
              <input
                type="text"
                value={(item as Project).title}
                onChange={(e) => updateFn({ title: e.target.value })}
                placeholder="Click to edit"
                className="w-full px-3 py-2 border border-slate-600 bg-slate-900 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 uppercase">FPS</label>
              <input
                type="number"
                value={(item as Project).fps}
                onChange={(e) => updateFn({ fps: Number(e.target.value) })}
                placeholder="Click to edit"
                className="w-full px-3 py-2 border border-slate-600 bg-slate-900 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 uppercase">Aspect Ratio</label>
              <input
                type="text"
                value={(item as Project).aspectRatio}
                onChange={(e) => updateFn({ aspectRatio: e.target.value })}
                placeholder="Click to edit"
                className="w-full px-3 py-2 border border-slate-600 bg-slate-900 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 uppercase">Global Notes</label>
              <textarea
                value={(item as Project).globalNotes}
                onChange={(e) => updateFn({ globalNotes: e.target.value })}
                rows={6}
                placeholder="Click to edit"
                className="w-full px-3 py-2 border border-slate-600 bg-slate-900 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
          </>
        )}

        {selectedType === 'scene' && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 uppercase">Scene Number</label>
              <input
                type="text"
                value={(item as Scene).sceneNumber}
                onChange={(e) => updateFn({ sceneNumber: e.target.value })}
                placeholder="Click to edit"
                className="w-full px-3 py-2 border border-slate-600 bg-slate-900 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 uppercase">Title</label>
              <input
                type="text"
                value={(item as Scene).title}
                onChange={(e) => updateFn({ title: e.target.value })}
                placeholder="Click to edit"
                className="w-full px-3 py-2 border border-slate-600 bg-slate-900 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 uppercase">Summary</label>
              <textarea
                value={(item as Scene).summary}
                onChange={(e) => updateFn({ summary: e.target.value })}
                rows={3}
                placeholder="Click to edit"
                className="w-full px-3 py-2 border border-slate-600 bg-slate-900 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 uppercase">Notes</label>
              <textarea
                value={(item as Scene).notes}
                onChange={(e) => updateFn({ notes: e.target.value })}
                rows={4}
                placeholder="Click to edit"
                className="w-full px-3 py-2 border border-slate-600 bg-slate-900 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
          </>
        )}

        {selectedType === 'shot' && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 uppercase">Scene</label>
              <select
                value={(item as Shot).sceneId || ''}
                onChange={(e) => updateFn({ sceneId: e.target.value || undefined })}
                className="w-full px-3 py-2 pr-8 border border-slate-600 bg-slate-900 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
                style={{ paddingRight: 'calc(0.75rem + 4px)' }}
              >
                <option value="">Unassigned</option>
                {scenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sceneNumber}: {s.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 uppercase">Duration (ms)</label>
              <input
                type="number"
                min="300"
                value={(item as Shot).duration}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (value < 300) {
                    // Show error only when user tries to enter < 300
                    return;
                  }
                  updateFn({ duration: value });
                }}
                onBlur={(e) => {
                  const value = Number(e.target.value);
                  if (value < 300) {
                    updateFn({ duration: 300 });
                  }
                }}
                placeholder="Click to edit"
                className="w-full px-3 py-2 border border-slate-600 bg-slate-900 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
              {((item as Shot).duration || 0) < 300 && (
                <p className="text-xs text-red-400 mt-1">Minimum: 300ms</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 uppercase">Script Text</label>
              <textarea
                value={(item as Shot).scriptText}
                onChange={(e) => updateFn({ scriptText: e.target.value })}
                rows={4}
                placeholder="Click to edit"
                className="w-full px-3 py-2 border border-slate-600 bg-slate-900 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 uppercase">Tags (comma-separated)</label>
              <input
                type="text"
                value={(item as Shot).tags.join(', ')}
                onChange={(e) => updateFn({ tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                placeholder="Click to edit"
                className="w-full px-3 py-2 border border-slate-600 bg-slate-900 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 uppercase">General Notes</label>
              <textarea
                value={(item as Shot).generalNotes}
                onChange={(e) => updateFn({ generalNotes: e.target.value })}
                rows={3}
                placeholder="Click to edit"
                className="w-full px-3 py-2 border border-slate-600 bg-slate-900 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            {/* Image Carousel */}
            {(() => {
              const shotFrames = frames
                .filter(f => f.shotId === selectedId)
                .sort((a, b) => a.orderIndex - b.orderIndex);
              
              if (shotFrames.length === 0) return null;
              
              // Get current image index for this shot (default to 0)
              const currentImageIndex = currentImageIndices.get(selectedId) ?? 0;
              const setCurrentImageIndex = (index: number) => {
                setCurrentImageIndices((prev: Map<string, number>) => {
                  const newMap = new Map(prev);
                  newMap.set(selectedId, index);
                  return newMap;
                });
              };
              
              const deleteFrame = useStore.getState().deleteFrame;
              const reorderFrames = useStore.getState().reorderFrames;
              
              const handleDeleteImage = (frameId: string) => {
                debugLogger.log('Inspector', 'handleDeleteImage called', { 
                  frameId, 
                  frameIdType: typeof frameId,
                  frameIdLength: frameId?.length,
                  shotId: selectedId, 
                  currentImageIndex,
                  totalFrames: shotFrames.length,
                  shotFramesIds: shotFrames.map(f => f.id),
                  shotFramesOrder: shotFrames.map(f => ({ id: f.id, orderIndex: f.orderIndex }))
                });
                
                try {
                  debugLogger.log('Inspector', 'Showing confirmation dialog');
                  if (!confirm('Delete this image?')) {
                    debugLogger.log('Inspector', 'Image deletion cancelled by user');
                    return;
                  }
                  
                  debugLogger.log('Inspector', 'User confirmed deletion, finding frame', {
                    frameId,
                    shotFramesCount: shotFrames.length,
                    shotFramesIds: shotFrames.map(f => f.id)
                  });
                  
                  const frameIndex = shotFrames.findIndex(f => f.id === frameId);
                  debugLogger.info('Inspector', 'Frame search result', { 
                    frameId, 
                    frameIndex, 
                    totalFrames: shotFrames.length,
                    found: frameIndex !== -1,
                    frameAtIndex: frameIndex >= 0 ? shotFrames[frameIndex]?.id : null
                  });
                  
                  if (frameIndex === -1) {
                    debugLogger.warn('Inspector', 'Frame not found for deletion - CRITICAL', { 
                      frameId, 
                      availableFrames: shotFrames.map(f => ({ id: f.id, orderIndex: f.orderIndex })),
                      shotId: selectedId
                    });
                    return;
                  }
                  
                  const frameToDelete = shotFrames[frameIndex];
                  debugLogger.info('Inspector', 'Frame found, preparing to delete', { 
                    frameId, 
                    frameIndex, 
                    shotId: selectedId,
                    frameOrderIndex: frameToDelete?.orderIndex,
                    frameShotId: frameToDelete?.shotId
                  });
                  
                  debugLogger.log('Inspector', 'Calling deleteFrame function', {
                    frameId,
                    deleteFrameType: typeof deleteFrame,
                    deleteFrameExists: !!deleteFrame
                  });
                  
                  deleteFrame(frameId);
                  debugLogger.log('Inspector', 'deleteFrame called - no exception thrown');
                  
                  // Update index after deletion
                  const newLength = shotFrames.length - 1;
                  debugLogger.info('Inspector', 'Calculating new index after deletion', { 
                    newLength, 
                    currentImageIndex, 
                    frameIndex,
                    wasLastImage: frameIndex >= newLength,
                    wasFirstImage: frameIndex === 0
                  });
                  
                  if (newLength === 0) {
                    debugLogger.log('Inspector', 'No images left after deletion - carousel will hide');
                    // No images left, component will hide itself
                    return;
                  }
                  
                  // Adjust index if we deleted the last image
                  if (frameIndex >= newLength) {
                    const newIndex = newLength - 1;
                    debugLogger.log('Inspector', 'Adjusting index - deleted last image', { 
                      oldIndex: currentImageIndex,
                      newIndex,
                      reason: 'Deleted last image in array'
                    });
                    setCurrentImageIndex(newIndex);
                  } else {
                    debugLogger.log('Inspector', 'Keeping same index - next image moves into position', { 
                      index: frameIndex,
                      reason: 'Deleted middle image, next one shifts up'
                    });
                    // Keep same index (next image moves into position)
                    setCurrentImageIndex(frameIndex);
                  }
                  debugLogger.log('Inspector', 'Image deletion completed successfully - all state updated');
                } catch (error) {
                  debugLogger.error('Inspector', 'Error deleting image - EXCEPTION CAUGHT', error, { 
                    frameId, 
                    shotId: selectedId, 
                    currentImageIndex,
                    errorName: error instanceof Error ? error.name : typeof error,
                    errorMessage: error instanceof Error ? error.message : String(error),
                    errorStack: error instanceof Error ? error.stack : undefined,
                    shotFramesCount: shotFrames.length,
                    frameIndex: shotFrames.findIndex(f => f.id === frameId)
                  });
                }
              };
              
              const handleSetAsMain = (frameId: string) => {
                try {
                  debugLogger.log('Inspector', 'handleSetAsMain called', { frameId, shotId: selectedId });
                  const frameIndex = shotFrames.findIndex(f => f.id === frameId);
                  if (frameIndex === -1 || frameIndex === 0) {
                    debugLogger.log('Inspector', 'Set as main cancelled - frame not found or already first', { frameIndex });
                    return;
                  }
                  
                  const newOrder = [
                    frameId,
                    ...shotFrames.filter(f => f.id !== frameId).map(f => f.id)
                  ];
                  debugLogger.log('Inspector', 'Reordering frames', { newOrder, shotId: selectedId });
                  reorderFrames(selectedId, newOrder);
                  setCurrentImageIndex(0);
                  debugLogger.log('Inspector', 'Set as main completed');
                } catch (error) {
                  debugLogger.error('Inspector', 'Error setting main image', error, { frameId, shotId: selectedId });
                }
              };
              
              const currentFrame = shotFrames[currentImageIndex];
              if (!currentFrame) {
                // Safety check - if current frame doesn't exist, reset index
                if (shotFrames.length > 0) {
                  setCurrentImageIndex(0);
                  return null;
                }
                return null;
              }
              
              return (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-slate-300">Images ({shotFrames.length})</label>
                    {shotFrames.length > 1 && currentFrame && (
                      <button
                        onClick={() => handleSetAsMain(currentFrame.id)}
                        className="text-xs text-slate-400 hover:text-slate-200"
                        title="Set as main image"
                      >
                        Set as main
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    {currentFrame?.image ? (
                      <img
                        src={currentFrame.image}
                        alt={`Frame ${currentImageIndex + 1}`}
                        className="w-full rounded-md border border-slate-600"
                        onError={(e) => {
                          console.error('Image load error:', e);
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-48 bg-slate-700 rounded-md border border-slate-600 flex items-center justify-center text-slate-400">
                        No image
                      </div>
                    )}
                    {shotFrames.length > 1 && (
                      <>
                        <button
                          onClick={() => {
                            const newIndex = currentImageIndex > 0 ? currentImageIndex - 1 : shotFrames.length - 1;
                            setCurrentImageIndex(newIndex);
                          }}
                          className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-full p-1"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            const newIndex = currentImageIndex < shotFrames.length - 1 ? currentImageIndex + 1 : 0;
                            setCurrentImageIndex(newIndex);
                          }}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-full p-1"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </>
                    )}
                    {currentFrame && (
                      <button
                        onClick={() => handleDeleteImage(currentFrame.id)}
                        className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-700 text-white rounded-full p-1"
                        title="Delete image"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {shotFrames.length > 1 && (
                    <div className="flex gap-1 mt-2 justify-center">
                      {shotFrames.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentImageIndex(index)}
                          className={`w-2 h-1 rounded-full ${
                            index === currentImageIndex ? 'bg-slate-400' : 'bg-slate-600'
                          }`}
                          style={{ height: '4px' }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {selectedType === 'frame' && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 uppercase">Caption</label>
              <textarea
                value={(item as StoryboardFrame).caption}
                onChange={(e) => updateFn({ caption: e.target.value })}
                rows={3}
                placeholder="Click to edit"
                className="w-full px-3 py-2 border border-slate-600 bg-slate-900 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <div>
              <img
                src={(item as StoryboardFrame).image}
                alt={(item as StoryboardFrame).caption}
                className="w-full rounded-md border border-slate-600"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

