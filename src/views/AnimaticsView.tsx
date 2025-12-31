import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { Shot } from '../types';
import { debugLogger } from '../utils/debug';

interface AnimaticsViewProps {
  onSelect: (id: string, type: 'project' | 'scene' | 'shot' | 'frame') => void;
}

interface TimelineFrame {
  shotId: string;
  shot: Shot;
  startTime: number; // milliseconds
  duration: number; // milliseconds
  frameIndex: number; // which frame of the shot to show
}

export function AnimaticsView({ onSelect }: AnimaticsViewProps) {
  const shots = useStore((state) => state.shots);
  const frames = useStore((state) => state.frames);
  const scenes = useStore((state) => state.scenes);
  const updateShot = useStore((state) => state.updateShot);
  const reorderShots = useStore((state) => state.reorderShots);
  const addFrame = useStore((state) => state.addFrame);
  const updateFrame = useStore((state) => state.updateFrame);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // milliseconds
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  
  // Drag states for shot reordering
  const [dragShotId, setDragShotId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState(0);
  
  // Drag states for duration adjustment
  const [resizeHandle, setResizeHandle] = useState<{ shotId: string; side: 'left' | 'right' } | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartDuration, setResizeStartDuration] = useState(0);
  const [resizeStartTime, setResizeStartTime] = useState(0);
  
  // Timeline zoom
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = 100%, higher = more zoomed in
  
  const videoRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const playStartPositionRef = useRef<number>(0);
  const isTypingRef = useRef(false);
  const corruptedFrameIdRef = useRef<string | null>(null);

  // Sort shots by scene and order
  const sortedShots = useMemo(() => {
    return [...shots].sort((a, b) => {
      const sceneA = scenes.find(s => s.id === a.sceneId);
      const sceneB = scenes.find(s => s.id === b.sceneId);
      const sceneNumA = sceneA ? parseInt(sceneA.sceneNumber) : 999;
      const sceneNumB = sceneB ? parseInt(sceneB.sceneNumber) : 999;
      if (sceneNumA !== sceneNumB) return sceneNumA - sceneNumB;
      return a.orderIndex - b.orderIndex;
    });
  }, [shots, scenes]);

  // Build timeline frames with cumulative start times
  const timelineFrames: TimelineFrame[] = useMemo(() => {
    let currentTime = 0;
    return sortedShots.map((shot) => {
      const frame: TimelineFrame = {
        shotId: shot.id,
        shot,
        startTime: currentTime,
        duration: shot.duration,
        frameIndex: 0,
      };
      currentTime += shot.duration; // Next frame starts after this one
      return frame;
    });
  }, [sortedShots]);

  const totalDuration = useMemo(() => {
    return timelineFrames.reduce((sum, f) => sum + f.duration, 0);
  }, [timelineFrames]);

  // Find which frame should be displayed at currentTime
  const currentFrame = useMemo(() => {
    if (!timelineFrames || timelineFrames.length === 0) return null;
    let accumulated = 0;
    for (const frame of timelineFrames) {
      if (!frame || !frame.shot) continue;
      if (currentTime >= accumulated && currentTime < accumulated + frame.duration) {
        return frame;
      }
      accumulated += frame.duration;
    }
    // Return first valid frame if no match found
    return timelineFrames.find(f => f && f.shot) || null;
  }, [currentTime, timelineFrames]);

  // Get current frame image with error handling
  const [imageError, setImageError] = useState<string | null>(null);
  const currentFrameImage = useMemo(() => {
    if (!currentFrame || !currentFrame.shotId) return null;
    try {
      const shotFrames = frames
        .filter(f => f && f.shotId === currentFrame.shotId)
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
      if (shotFrames.length === 0) return null;
      return shotFrames[currentFrame.frameIndex]?.image || shotFrames[0]?.image || null;
    } catch (error) {
      console.error('Error getting current frame image:', error);
      return null;
    }
  }, [currentFrame, frames]);

  const handleImageError = () => {
    if (currentFrame) {
      setImageError(currentFrame.shot.shotCode);
      // Find the corrupted frame
      const shotFrames = frames
        .filter(f => f && f.shotId === currentFrame.shotId)
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
      if (shotFrames.length > 0 && currentFrame.frameIndex < shotFrames.length) {
        corruptedFrameIdRef.current = shotFrames[currentFrame.frameIndex]?.id || null;
      }
    }
  };

  const handleImageLoad = () => {
    setImageError(null);
    corruptedFrameIdRef.current = null;
  };

  const handleImageUpload = (shotId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = false;
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const imageData = event.target.result as string;
          
          // If we have a corrupted frame ID, replace it; otherwise add a new frame
          if (corruptedFrameIdRef.current) {
            updateFrame(corruptedFrameIdRef.current, { image: imageData });
            corruptedFrameIdRef.current = null;
          } else {
            // Find the first frame for this shot and replace it, or add new
            const shotFrames = frames
              .filter(f => f && f.shotId === shotId)
              .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
            
            if (shotFrames.length > 0 && shotFrames[0]) {
              // Replace the first frame
              updateFrame(shotFrames[0].id, { image: imageData });
            } else {
              // Add a new frame
              addFrame(shotId, imageData);
            }
          }
          
          setImageError(null);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // Auto-select current shot (only when frame changes, not on every render)
  useEffect(() => {
    if (currentFrame && currentFrame.shotId && currentFrame.shot) {
      try {
        // Only update if shot ID actually changed to prevent infinite loops
        if (selectedShotId !== currentFrame.shotId) {
          setSelectedShotId(currentFrame.shotId);
          onSelect(currentFrame.shotId, 'shot');
        }
      } catch (error) {
        console.error('Error selecting shot:', error);
      }
    }
  }, [currentFrame?.shotId, selectedShotId, onSelect]);

  // Playback: update currentTime based on elapsed real time
  useEffect(() => {
    if (isPlaying) {
      const animate = () => {
        const elapsed = Date.now() - playStartTimeRef.current;
        const newTime = playStartPositionRef.current + elapsed;
        if (newTime >= totalDuration) {
          setCurrentTime(totalDuration);
          setIsPlaying(false);
        } else {
          setCurrentTime(newTime);
          animationFrameRef.current = requestAnimationFrame(animate);
        }
      };
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, totalDuration]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        isTypingRef.current = true;
        return;
      }
      isTypingRef.current = false;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        handlePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const currentIndex = timelineFrames.findIndex(f => f.shotId === selectedShotId);
        if (currentIndex > 0) {
          const prevFrame = timelineFrames[currentIndex - 1];
          if (prevFrame && prevFrame.shotId) {
            try {
              handleSeek(prevFrame.startTime);
              setSelectedShotId(prevFrame.shotId);
              onSelect(prevFrame.shotId, 'shot');
            } catch (error) {
              console.error('Error navigating to previous frame:', error);
            }
          }
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const currentIndex = timelineFrames.findIndex(f => f.shotId === selectedShotId);
        if (currentIndex < timelineFrames.length - 1) {
          const nextFrame = timelineFrames[currentIndex + 1];
          if (nextFrame && nextFrame.shotId) {
            try {
              handleSeek(nextFrame.startTime);
              setSelectedShotId(nextFrame.shotId);
              onSelect(nextFrame.shotId, 'shot');
            } catch (error) {
              console.error('Error navigating to next frame:', error);
            }
          }
        }
      }
    };

    const handleKeyUp = () => {
      isTypingRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedShotId, timelineFrames, onSelect]);

  const handlePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      // If at the end, restart from beginning
      if (currentTime >= totalDuration) {
        setCurrentTime(0);
        playStartTimeRef.current = Date.now();
        playStartPositionRef.current = 0;
      } else {
        playStartTimeRef.current = Date.now();
        playStartPositionRef.current = currentTime;
      }
      setIsPlaying(true);
    }
  };

  const handleSeek = (time: number) => {
    setCurrentTime(Math.max(0, Math.min(time, totalDuration)));
    setIsPlaying(false);
  };

  const handleFrameClick = (e: React.MouseEvent, frame: TimelineFrame) => {
    debugLogger.log('AnimaticsView', 'handleFrameClick called', { 
      frame: frame ? { 
        shotId: frame.shotId, 
        shotCode: frame.shot?.shotCode,
        startTime: frame.startTime,
        duration: frame.duration,
        hasShot: !!frame.shot,
        shotType: typeof frame.shot
      } : null,
      eventTarget: (e.target as HTMLElement)?.tagName,
      eventTargetClass: (e.target as HTMLElement)?.className
    });
    
    e.preventDefault();
    e.stopPropagation();
    
    debugLogger.log('AnimaticsView', 'Validating frame object', {
      frameExists: !!frame,
      frameType: typeof frame,
      shotIdExists: !!frame?.shotId,
      shotIdValue: frame?.shotId,
      shotIdType: typeof frame?.shotId,
      shotExists: !!frame?.shot,
      shotType: typeof frame?.shot
    });
    
    if (!frame || !frame.shotId || !frame.shot) {
      debugLogger.warn('AnimaticsView', 'Invalid frame in handleFrameClick - validation failed', { 
        frame: frame ? { 
          shotId: frame.shotId, 
          hasShot: !!frame.shot,
          shotIdType: typeof frame.shotId,
          shotIdLength: frame.shotId?.length
        } : null,
        frameNull: !frame,
        shotIdNull: !frame?.shotId,
        shotNull: !frame?.shot
      });
      return;
    }
    
    try {
      debugLogger.info('AnimaticsView', 'Processing frame click - all validations passed', { 
        shotId: frame.shotId, 
        shotCode: frame.shot.shotCode,
        shotSceneId: frame.shot.sceneId,
        startTime: frame.startTime,
        duration: frame.duration,
        currentSelectedShotId: selectedShotId,
        currentTime: currentTime
      });
      
      debugLogger.log('AnimaticsView', 'Calling handleSeek', { startTime: frame.startTime });
      handleSeek(frame.startTime);
      debugLogger.log('AnimaticsView', 'handleSeek completed');
      
      debugLogger.log('AnimaticsView', 'Setting selectedShotId state', {
        oldSelectedShotId: selectedShotId,
        newSelectedShotId: frame.shotId
      });
      setSelectedShotId(frame.shotId);
      debugLogger.log('AnimaticsView', 'selectedShotId state updated');
      
      debugLogger.log('AnimaticsView', 'Preparing to call onSelect', {
        shotId: frame.shotId,
        shotIdValid: !!frame.shotId && frame.shotId.length > 0,
        shotIdType: typeof frame.shotId,
        onSelectType: typeof onSelect,
        onSelectExists: !!onSelect
      });
      
      if (frame.shotId) {
        debugLogger.info('AnimaticsView', 'Calling onSelect callback', { 
          shotId: frame.shotId, 
          shotCode: frame.shot.shotCode,
          shotType: 'shot'
        });
        try {
          onSelect(frame.shotId, 'shot');
          debugLogger.log('AnimaticsView', 'onSelect called successfully - no exception thrown');
        } catch (selectError) {
          debugLogger.error('AnimaticsView', 'Exception thrown in onSelect callback', selectError, {
            shotId: frame.shotId,
            shotCode: frame.shot.shotCode,
            errorName: selectError instanceof Error ? selectError.name : typeof selectError,
            errorMessage: selectError instanceof Error ? selectError.message : String(selectError),
            errorStack: selectError instanceof Error ? selectError.stack : undefined
          });
          throw selectError; // Re-throw to be caught by outer try-catch
        }
      } else {
        debugLogger.warn('AnimaticsView', 'Not calling onSelect - shotId is falsy', { shotId: frame.shotId });
      }
      debugLogger.log('AnimaticsView', 'handleFrameClick completed successfully');
    } catch (error) {
      debugLogger.error('AnimaticsView', 'Error handling frame click - EXCEPTION CAUGHT', error, { 
        frame: frame ? { 
          shotId: frame.shotId,
          shotCode: frame.shot?.shotCode
        } : null,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
    }
  };

  // Shot reordering drag handlers
  const handleShotDragStart = (e: React.MouseEvent, frame: TimelineFrame) => {
    e.preventDefault();
    e.stopPropagation();
    if (!frame || !frame.shotId || !frame.shot) {
      console.warn('Invalid frame in handleShotDragStart:', frame);
      return;
    }
    try {
      setDragShotId(frame.shotId);
      setDragStartX(e.clientX);
      setDragStartTime(frame.startTime);
    } catch (error) {
      console.error('Error in handleShotDragStart:', error);
    }
  };

  const handleShotDrag = useCallback((e: MouseEvent) => {
    if (!dragShotId || !timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const pixelsPerMs = (rect.width * zoomLevel) / totalDuration;
    const deltaX = e.clientX - dragStartX;
    const deltaMs = deltaX / pixelsPerMs;
    const newTime = dragStartTime + deltaMs;
    
    // Find which position to insert at
    const targetFrame = timelineFrames.find(f => 
      newTime >= f.startTime && newTime < f.startTime + f.duration
    );
    
    if (targetFrame && targetFrame.shotId !== dragShotId) {
      // Reorder shots
      const currentOrder = sortedShots.map(s => s.id);
      const dragIndex = currentOrder.indexOf(dragShotId);
      const targetIndex = currentOrder.indexOf(targetFrame.shotId);
      
      const newOrder = [...currentOrder];
      newOrder.splice(dragIndex, 1);
      newOrder.splice(targetIndex, 0, dragShotId);
      
      reorderShots(newOrder);
    }
  }, [dragShotId, dragStartX, dragStartTime, timelineFrames, sortedShots, totalDuration, zoomLevel, reorderShots]);

  const handleShotDragEnd = useCallback(() => {
    setDragShotId(null);
  }, []);

  // Duration resize handlers
  const handleResizeStart = (e: React.MouseEvent, frame: TimelineFrame, side: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    if (!frame || !frame.shotId || !frame.shot) {
      console.warn('Invalid frame in handleResizeStart:', frame);
      return;
    }
    try {
      setResizeHandle({ shotId: frame.shotId, side });
      setResizeStartX(e.clientX);
      setResizeStartDuration(frame.duration);
      setResizeStartTime(frame.startTime);
    } catch (error) {
      console.error('Error in handleResizeStart:', error);
    }
  };

  const handleResize = useCallback((e: MouseEvent) => {
    if (!resizeHandle || !timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const pixelsPerMs = (rect.width * zoomLevel) / totalDuration;
    const deltaX = e.clientX - resizeStartX;
    const deltaMs = deltaX / pixelsPerMs;
    
    const frame = timelineFrames.find(f => f.shotId === resizeHandle.shotId);
    if (!frame) return;
    
    if (resizeHandle.side === 'right') {
      // Extend/shrink from right
      const newDuration = Math.max(300, resizeStartDuration + deltaMs);
      updateShot(frame.shotId, { duration: Math.round(newDuration) });
    } else {
      // Extend/shrink from left (adjust start time and duration)
      const newDuration = Math.max(300, resizeStartDuration - deltaMs);
      const newStartTime = resizeStartTime + deltaMs;
      if (newStartTime >= 0) {
        updateShot(frame.shotId, { duration: Math.round(newDuration) });
        // Note: Adjusting start time would require reordering, which is complex
        // For now, just adjust duration from left
      }
    }
  }, [resizeHandle, resizeStartX, resizeStartDuration, resizeStartTime, timelineFrames, totalDuration, zoomLevel, updateShot]);

  const handleResizeEnd = useCallback(() => {
    setResizeHandle(null);
  }, []);

  // Global mouse handlers
  useEffect(() => {
    if (dragShotId) {
      window.addEventListener('mousemove', handleShotDrag);
      window.addEventListener('mouseup', handleShotDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleShotDrag);
        window.removeEventListener('mouseup', handleShotDragEnd);
      };
    }
  }, [dragShotId, handleShotDrag, handleShotDragEnd]);

  useEffect(() => {
    if (resizeHandle) {
      window.addEventListener('mousemove', handleResize);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleResize);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizeHandle, handleResize, handleResizeEnd]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const timelinePosition = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
  const timelineWidth = (totalDuration / 1000) * 20 * zoomLevel; // Base: 20px per second, scaled by zoom
  
  // Get dragging shot's scene for dimming
  const draggingShot = dragShotId ? shots.find(s => s.id === dragShotId) : null;
  const draggingSceneId = draggingShot?.sceneId;

  // Generate time ruler marks
  const timeRulerMarks = useMemo(() => {
    const marks = [];
    const interval = zoomLevel < 2 ? 5000 : zoomLevel < 5 ? 2000 : 1000; // 5s, 2s, or 1s marks
    for (let time = 0; time <= totalDuration; time += interval) {
      marks.push(time);
    }
    return marks;
  }, [totalDuration, zoomLevel]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 text-slate-100">
      {/* Main Video Player Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Player */}
        <div ref={videoRef} className="flex-1 flex items-center justify-center bg-slate-950 relative">
          {imageError ? (
            <div className="text-slate-500 text-center p-4">
              <p className="text-lg mb-2 text-red-400">Image Error</p>
              <p className="text-sm mb-4">The image for shot {imageError} is corrupted or cannot be displayed.</p>
              <button
                onClick={() => {
                  try {
                    if (currentFrame?.shotId) {
                      handleImageUpload(currentFrame.shotId);
                    }
                  } catch (error) {
                    console.error('Error handling image upload:', error);
                  }
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm"
              >
                Upload New Image
              </button>
            </div>
          ) : currentFrameImage ? (
            <img
              src={currentFrameImage}
              alt={currentFrame?.shot?.shotCode || ''}
              className="max-w-full max-h-full object-contain"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onError={(e) => {
                e.preventDefault();
                handleImageError();
              }}
              onLoad={handleImageLoad}
              onClick={(e) => {
                e.stopPropagation();
                // Prevent blank screen on click
                if (currentFrame?.shotId) {
                  try {
                    onSelect(currentFrame.shotId, 'shot');
                  } catch (error) {
                    console.error('Error selecting shot from image click:', error);
                  }
                }
              }}
            />
          ) : (
            <div 
              className="text-slate-500 text-center"
              onClick={(e) => {
                e.stopPropagation();
                // Prevent blank screen on click
                if (currentFrame?.shotId) {
                  try {
                    onSelect(currentFrame.shotId, 'shot');
                  } catch (error) {
                    console.error('Error selecting shot from empty image area:', error);
                  }
                }
              }}
            >
              <p className="text-lg mb-2">No image available</p>
              <p className="text-sm">Add images to shots to see them here</p>
            </div>
          )}
          
          {/* Shot Info Overlay */}
          {currentFrame && (
            <div className="absolute top-4 left-4 bg-slate-800/90 px-3 py-2 rounded">
              <div className="text-sm font-semibold">Shot {currentFrame.shot.shotCode}</div>
              <div className="text-xs text-slate-400">{formatTime(currentTime)} / {formatTime(totalDuration)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="h-48 bg-slate-800 border-t border-slate-700 flex flex-col">
        {/* Time Ruler */}
        <div className="h-8 border-b border-slate-700 relative overflow-hidden">
          <div 
            className="h-full relative overflow-x-auto overflow-y-hidden scrollbar-hide" 
            ref={timelineContainerRef}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            onScroll={(e) => {
              if (timelineRef.current) {
                timelineRef.current.scrollLeft = e.currentTarget.scrollLeft;
              }
            }}
          >
            <div className="h-full relative" style={{ minWidth: `${timelineWidth}px` }}>
              {timeRulerMarks.map((time) => {
                const leftPercent = (time / totalDuration) * 100;
                return (
                  <div
                    key={time}
                    className="absolute top-0 bottom-0 border-l border-slate-600"
                    style={{ left: `${leftPercent}%` }}
                  >
                    <div className="absolute top-0 left-0 text-xs text-slate-400 px-1">
                      {formatTime(time)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Timeline Track */}
        <div 
          ref={timelineRef} 
          className="flex-1 relative overflow-x-auto overflow-y-hidden"
          onScroll={(e) => {
            if (timelineContainerRef.current) {
              timelineContainerRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
        >
          <div className="h-full relative" style={{ minWidth: `${timelineWidth}px` }}>
            {/* Timeline Frames */}
            {timelineFrames.map((frame) => {
              const leftPercent = (frame.startTime / totalDuration) * 100;
              const widthPercent = (frame.duration / totalDuration) * 100;
              if (!frame || !frame.shot || !frame.shotId) {
                console.warn('Invalid frame in timeline render:', frame);
                return null;
              }
              
              const shotFrames = frames.filter(f => f && f.shotId === frame.shotId).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
              const frameImage = shotFrames[0]?.image;
              const isSelected = selectedShotId === frame.shotId;
              const isDragging = dragShotId === frame.shotId;
              const isFromOtherScene = dragShotId && frame.shot.sceneId !== draggingSceneId;
              
              return (
                <div
                  key={frame.shotId}
                  className={`absolute h-full border-r border-slate-600 cursor-move transition-opacity ${
                    isSelected ? 'ring-2 ring-slate-400' : ''
                  } ${isFromOtherScene ? 'opacity-30' : ''} ${isDragging ? 'opacity-50' : ''}`}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                  }}
                  onClick={(e) => {
                    // Only handle click if not dragging
                    if (!dragShotId && !resizeHandle) {
                      handleFrameClick(e, frame);
                    }
                  }}
                  onMouseDown={(e) => {
                    // Only start drag if clicking on the frame itself, not on resize handles
                    if (!(e.target as HTMLElement).closest('.resize-handle')) {
                      handleShotDragStart(e, frame);
                    }
                  }}
                >
                  <div className="h-full flex flex-col relative">
                    {/* Left resize handle */}
                    <div
                      className="resize-handle absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 hover:bg-slate-600"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleResizeStart(e, frame, 'left');
                      }}
                    />
                    
                    {/* Thumbnail */}
                    <div className="flex-1 p-1 overflow-hidden">
                      {frameImage ? (
                        <img
                          src={frameImage}
                          alt={frame.shot.shotCode}
                          className="w-full h-full object-cover rounded max-h-24"
                          draggable={false}
                          onDragStart={(e) => e.preventDefault()}
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-700 rounded flex items-center justify-center text-xs text-slate-500 max-h-24">
                          {frame.shot.shotCode}
                        </div>
                      )}
                    </div>
                    
                    {/* Shot Code and Duration */}
                    <div className="px-1 pb-1 text-xs text-slate-400 truncate">
                      {frame.shot.shotCode} ({formatTime(frame.duration)})
                    </div>
                    
                    {/* Right resize handle */}
                    <div
                      className="resize-handle absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 hover:bg-slate-600"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleResizeStart(e, frame, 'right');
                      }}
                    />
                  </div>
                </div>
              );
            })}
            
            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-slate-300 z-10 pointer-events-none"
              style={{ left: `${timelinePosition}%` }}
            >
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-slate-300"></div>
            </div>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="h-12 border-t border-slate-700 flex items-center justify-between px-4 bg-slate-800">
          {/* Time display - left */}
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <span>{formatTime(currentTime)}</span>
            <span className="text-slate-500">/</span>
            <span>{formatTime(totalDuration)}</span>
          </div>
          
          {/* Playback controls - center */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSeek(Math.max(0, currentTime - 1000))}
              className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded"
              title="Fast backward"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handlePlay}
              className="p-2 bg-slate-600 hover:bg-slate-700 text-white rounded"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => handleSeek(Math.min(totalDuration, currentTime + 1000))}
              className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded"
              title="Fast forward"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          
          {/* Zoom controls - right */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.5))}
              className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm"
              title="Zoom out"
            >
              −
            </button>
            <span className="text-xs text-slate-400 min-w-[3rem] text-center">{Math.round(zoomLevel * 100)}%</span>
            <button
              onClick={() => setZoomLevel(Math.min(5, zoomLevel + 0.5))}
              className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm"
              title="Zoom in"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
