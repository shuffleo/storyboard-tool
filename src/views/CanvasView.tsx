import { useRef, useState, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Shot } from '../types';

interface CanvasViewProps {
  onSelect: (id: string, type: 'project' | 'scene' | 'shot' | 'frame') => void;
}

interface ShotNode {
  shot: Shot;
  x: number;
  y: number;
}

export function CanvasView({ onSelect }: CanvasViewProps) {
  const shots = useStore((state) => state.shots);
  const frames = useStore((state) => state.frames);
  const scenes = useStore((state) => state.scenes);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [nodes, setNodes] = useState<Map<string, ShotNode>>(new Map());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [, setDragStart] = useState({ x: 0, y: 0 });

  const sortedShots = useMemo(() => {
    return [...shots].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [shots]);

  // Initialize nodes from shots if not already set
  useMemo(() => {
    if (nodes.size === 0 && sortedShots.length > 0) {
      const initialNodes = new Map<string, ShotNode>();
      sortedShots.forEach((shot, index) => {
        initialNodes.set(shot.id, {
          shot,
          x: (index % 10) * 200,
          y: Math.floor(index / 10) * 150,
        });
      });
      setNodes(initialNodes);
    }
  }, [sortedShots, nodes.size]);

  const getShotFrames = (shotId: string) => {
    return frames.filter((f) => f.shotId === shotId).sort((a, b) => a.orderIndex - b.orderIndex);
  };

  const getSceneName = (sceneId?: string) => {
    if (!sceneId) return null;
    const scene = scenes.find((s) => s.id === sceneId);
    return scene ? `Scene ${scene.sceneNumber}` : null;
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.max(0.1, Math.min(3, prev * delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      // Middle mouse or Ctrl+Left for panning
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    } else if (isDragging && selectedNodeId) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (e.clientX - rect.left - pan.x) / zoom;
        const y = (e.clientY - rect.top - pan.y) / zoom;
        const finalX = snapToGrid ? Math.round(x / 20) * 20 : x;
        const finalY = snapToGrid ? Math.round(y / 20) * 20 : y;
        
        setNodes((prev) => {
          const updated = new Map(prev);
          const node = updated.get(selectedNodeId);
          if (node) {
            updated.set(selectedNodeId, { ...node, x: finalX, y: finalY });
          }
          return updated;
        });
      }
    }
  }, [isPanning, isDragging, selectedNodeId, pan, panStart, zoom, snapToGrid]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setIsDragging(false);
  }, []);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setSelectedNodeId(nodeId);
    setIsDragging(true);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const node = nodes.get(nodeId);
      if (node) {
        setDragStart({
          x: e.clientX - (node.x * zoom + pan.x),
          y: e.clientY - (node.y * zoom + pan.y),
        });
      }
    }
  }, [nodes, zoom, pan]);

  const handleAutoLayout = useCallback(() => {
    const newNodes = new Map<string, ShotNode>();
    sortedShots.forEach((shot, index) => {
      newNodes.set(shot.id, {
        shot,
        x: (index % 10) * 200,
        y: Math.floor(index / 10) * 150,
      });
    });
    setNodes(newNodes);
  }, [sortedShots]);

  const handleExportPNG = useCallback(async () => {
    // Simple export - could be enhanced with html2canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bounds = Array.from(nodes.values()).reduce(
      (acc, node) => ({
        minX: Math.min(acc.minX, node.x),
        minY: Math.min(acc.minY, node.y),
        maxX: Math.max(acc.maxX, node.x + 150),
        maxY: Math.max(acc.maxY, node.y + 100),
      }),
      { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    );

    canvas.width = bounds.maxX - bounds.minX + 100;
    canvas.height = bounds.maxY - bounds.minY + 100;

    // Draw background
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw nodes
    nodes.forEach((node) => {
      const x = node.x - bounds.minX + 50;
      const y = node.y - bounds.minY + 50;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, 150, 100);
      ctx.strokeStyle = '#e5e7eb';
      ctx.strokeRect(x, y, 150, 100);
      ctx.fillStyle = '#000000';
      ctx.font = '12px sans-serif';
      ctx.fillText(node.shot.shotCode, x + 10, y + 20);
    });

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'canvas-export.png';
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  }, [nodes]);

  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
        <div className="flex items-center gap-4">
          <button
            onClick={handleAutoLayout}
            className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-100"
          >
            Auto Layout
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(e) => setSnapToGrid(e.target.checked)}
            />
            Snap to Grid
          </label>
          <div className="text-sm text-gray-600">
            Zoom: {(zoom * 100).toFixed(0)}%
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPNG}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Export PNG
          </button>
        </div>
      </div>

      <div
        ref={canvasRef}
        className="flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Grid */}
          {snapToGrid && (
            <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
              <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          )}

          {/* Nodes */}
          {Array.from(nodes.values()).map((node) => {
            const shotFrames = getShotFrames(node.shot.id);
            const sceneName = getSceneName(node.shot.sceneId);
            const isSelected = selectedNodeId === node.shot.id;

            return (
              <div
                key={node.shot.id}
                className={`absolute bg-white border-2 rounded-lg shadow-md cursor-move ${
                  isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                }`}
                style={{
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: '150px',
                  height: '100px',
                }}
                onMouseDown={(e) => handleNodeMouseDown(e, node.shot.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(node.shot.id, 'shot');
                }}
              >
                {shotFrames.length > 0 ? (
                  <img
                    src={shotFrames[0].image}
                    alt={node.shot.shotCode}
                    className="w-full h-12 object-cover rounded-t-lg"
                  />
                ) : (
                  <div className="w-full h-12 bg-gray-100 flex items-center justify-center text-xs text-gray-400 rounded-t-lg">
                    No image
                  </div>
                )}
                <div className="p-2">
                  <div className="text-xs font-semibold text-gray-900">{node.shot.shotCode}</div>
                  {sceneName && (
                    <div className="text-xs text-gray-500">{sceneName}</div>
                  )}
                  <div className="text-xs text-gray-600">{node.shot.durationTarget}s</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mini-map */}
        <div className="absolute bottom-4 right-4 w-48 h-32 bg-white border border-gray-300 rounded shadow-lg opacity-75 hover:opacity-100 transition-opacity">
          <div className="text-xs text-gray-600 p-1 border-b border-gray-200">Mini-map</div>
          <div className="relative w-full h-24 overflow-hidden">
            {Array.from(nodes.values()).map((node) => (
              <div
                key={node.shot.id}
                className="absolute bg-blue-500 rounded"
                style={{
                  left: `${(node.x / 2000) * 100}%`,
                  top: `${(node.y / 1500) * 100}%`,
                  width: '2px',
                  height: '2px',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

