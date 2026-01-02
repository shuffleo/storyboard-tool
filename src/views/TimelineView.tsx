import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { Shot } from '../types';

interface TimelineViewProps {
  onSelect: (id: string, type: 'project' | 'scene' | 'shot' | 'frame') => void;
}

export function TimelineView({ onSelect }: TimelineViewProps) {
  const shots = useStore((state) => state.shots);
  const scenes = useStore((state) => state.scenes);
  const frames = useStore((state) => state.frames);
  const updateShot = useStore((state) => state.updateShot);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(50);

  const sortedShots = useMemo(() => {
    return [...shots].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [shots]);

  const getShotFrames = (shotId: string) => {
    return frames.filter((f) => f.shotId === shotId).sort((a, b) => a.orderIndex - b.orderIndex);
  };

  const getSceneName = (sceneId?: string) => {
    if (!sceneId) return null;
    const scene = scenes.find((s) => s.id === sceneId);
    return scene ? `Scene ${scene.sceneNumber}` : null;
  };

  const calculateTimecode = (index: number) => {
    let total = 0;
    for (let i = 0; i < index; i++) {
      total += (sortedShots[i]?.duration || 1000) / 1000; // Convert ms to seconds
    }
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = Math.floor(total % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const totalDuration = useMemo(() => {
    return sortedShots.reduce((sum, shot) => sum + (shot.duration || 1000) / 1000, 0); // Convert ms to seconds
  }, [sortedShots]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  let currentTime = 0;
  const sceneGroups = new Map<string | undefined, Shot[]>();
  sortedShots.forEach((shot) => {
    if (!sceneGroups.has(shot.sceneId)) {
      sceneGroups.set(shot.sceneId, []);
    }
    sceneGroups.get(shot.sceneId)!.push(shot);
  });

  return (
    <div className="w-full h-full flex flex-col bg-slate-900">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800">
        <div className="flex items-center gap-4">
          <label className="text-sm text-slate-300">
            Scale:
            <input
              type="range"
              min="20"
              max="200"
              value={pixelsPerSecond}
              onChange={(e) => setPixelsPerSecond(Number(e.target.value))}
              className="ml-2"
            />
            {pixelsPerSecond}px/s
          </label>
        </div>
        <div className="text-sm text-slate-300">
          Total Duration: {formatDuration(totalDuration)} ({totalDuration.toFixed(1)}s)
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="relative" style={{ minWidth: `${totalDuration * pixelsPerSecond}px` }}>
          {/* Timecode ruler */}
          <div className="sticky top-0 bg-slate-800 border-b border-slate-700 z-20 h-8 flex items-center">
            {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute border-l border-slate-600 text-xs text-slate-400 pl-1"
                style={{ left: `${i * pixelsPerSecond}px` }}
              >
                {i}s
              </div>
            ))}
          </div>

          {/* Timeline tracks */}
          <div className="mt-8">
            {Array.from(sceneGroups.entries()).map(([sceneId, sceneShots]) => {
              const sceneName = getSceneName(sceneId);
              let sceneStartTime = 0;
              sortedShots.forEach((shot) => {
                if (shot.sceneId === sceneId || (!sceneId && !shot.sceneId)) {
                  return;
                }
                if (sortedShots.indexOf(shot) < sortedShots.indexOf(sceneShots[0])) {
                  sceneStartTime += (shot.duration || 1000) / 1000; // Convert ms to seconds
                }
              });

              return (
                <div key={sceneId || 'unassigned'} className="mb-4">
                  {sceneName && (
                    <div className="text-sm font-semibold text-slate-200 mb-2 px-2">{sceneName}</div>
                  )}
                  <div className="flex gap-1">
                    {sceneShots.map((shot) => {
                      const shotWidth = ((shot.duration || 1000) / 1000) * pixelsPerSecond; // Convert ms to seconds
                      const shotFrames = getShotFrames(shot.id);
                      currentTime += (shot.duration || 1000) / 1000; // Convert ms to seconds

                      return (
                        <div
                          key={shot.id}
                          className="relative group"
                          style={{
                            width: `${shotWidth}px`,
                            minWidth: '40px',
                          }}
                        >
                          <div
                            className="h-24 border-2 rounded border-slate-600 bg-slate-800 cursor-pointer hover:shadow-md transition-shadow flex flex-col"
                            onClick={() => onSelect(shot.id, 'shot')}
                          >
                            {shotFrames.length > 0 ? (
                              <img
                                src={shotFrames[0].image}
                                alt={shot.shotCode}
                                className="w-full h-16 object-cover rounded-t"
                              />
                            ) : (
                              <div className="w-full h-16 bg-slate-700 flex items-center justify-center text-xs text-slate-400">
                                No image
                              </div>
                            )}
                            <div className="p-1 flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-100">{shot.shotCode}</span>
                              <span className="text-xs text-slate-300">{((shot.duration || 1000) / 1000).toFixed(1)}s</span>
                            </div>
                          </div>
                          {/* Duration resize handle */}
                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              const startX = e.clientX;
                              const startWidth = shotWidth;

                              const handleMouseMove = (moveEvent: MouseEvent) => {
                                const deltaX = moveEvent.clientX - startX;
                                const newWidth = Math.max(40, startWidth + deltaX);
                                const newDuration = newWidth / pixelsPerSecond;
                                updateShot(shot.id, { duration: Math.max(300, newDuration * 1000) }); // Convert seconds to ms, min 300ms
                              };

                              const handleMouseUp = () => {
                                document.removeEventListener('mousemove', handleMouseMove);
                                document.removeEventListener('mouseup', handleMouseUp);
                              };

                              document.addEventListener('mousemove', handleMouseMove);
                              document.addEventListener('mouseup', handleMouseUp);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Timecode markers */}
          <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 h-8 flex items-center">
            {sortedShots.map((shot, index) => {
              const timecode = calculateTimecode(index);
              const time = sortedShots.slice(0, index).reduce((sum, s) => sum + (s.duration || 1000) / 1000, 0); // Convert ms to seconds
              return (
                <div
                  key={shot.id}
                  className="absolute text-xs text-slate-400"
                  style={{ left: `${time * pixelsPerSecond}px` }}
                >
                  {timecode}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

