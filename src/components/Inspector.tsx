import { useStore } from '../store/useStore';
import { Shot, Scene, StoryboardFrame, Project } from '../types';

interface InspectorProps {
  selectedId: string | null;
  selectedType: 'project' | 'scene' | 'shot' | 'frame' | null;
  onClose: () => void;
}

export function Inspector({ selectedId, selectedType, onClose }: InspectorProps) {
  const project = useStore((state) => state.project);
  const scenes = useStore((state) => state.scenes);
  const shots = useStore((state) => state.shots);
  const frames = useStore((state) => state.frames);
  const updateProject = useStore((state) => state.updateProject);
  const updateScene = useStore((state) => state.updateScene);
  const updateShot = useStore((state) => state.updateShot);
  const updateFrame = useStore((state) => state.updateFrame);

  if (!selectedId || !selectedType) {
    return (
      <div className="w-80 bg-white border-l border-gray-200 p-4">
        <div className="text-gray-500 text-sm">Select an item to edit</div>
      </div>
    );
  }

  let item: Project | Scene | Shot | StoryboardFrame | null = null;
  let updateFn: ((updates: any) => void) | null = null;

  if (selectedType === 'project') {
    item = project;
    updateFn = (updates) => updateProject(updates);
  } else if (selectedType === 'scene') {
    item = scenes.find((s) => s.id === selectedId) || null;
    updateFn = (updates) => updateScene(selectedId, updates);
  } else if (selectedType === 'shot') {
    item = shots.find((s) => s.id === selectedId) || null;
    updateFn = (updates) => updateShot(selectedId, updates);
  } else if (selectedType === 'frame') {
    item = frames.find((f) => f.id === selectedId) || null;
    updateFn = (updates) => updateFrame(selectedId, updates);
  }

  if (!item || !updateFn) {
    return (
      <div className="w-80 bg-white border-l border-gray-200 p-4">
        <div className="text-gray-500 text-sm">Item not found</div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 capitalize">{selectedType}</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {selectedType === 'project' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={(item as Project).title}
                onChange={(e) => updateFn({ title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">FPS</label>
              <input
                type="number"
                value={(item as Project).fps}
                onChange={(e) => updateFn({ fps: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Aspect Ratio</label>
              <input
                type="text"
                value={(item as Project).aspectRatio}
                onChange={(e) => updateFn({ aspectRatio: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Global Notes</label>
              <textarea
                value={(item as Project).globalNotes}
                onChange={(e) => updateFn({ globalNotes: e.target.value })}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        {selectedType === 'scene' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scene Number</label>
              <input
                type="text"
                value={(item as Scene).sceneNumber}
                onChange={(e) => updateFn({ sceneNumber: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={(item as Scene).title}
                onChange={(e) => updateFn({ title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
              <textarea
                value={(item as Scene).summary}
                onChange={(e) => updateFn({ summary: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={(item as Scene).notes}
                onChange={(e) => updateFn({ notes: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        {selectedType === 'shot' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shot Code</label>
              <input
                type="text"
                value={(item as Shot).shotCode}
                onChange={(e) => updateFn({ shotCode: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scene</label>
              <select
                value={(item as Shot).sceneId || ''}
                onChange={(e) => updateFn({ sceneId: e.target.value || undefined })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Script Text</label>
              <textarea
                value={(item as Shot).scriptText}
                onChange={(e) => updateFn({ scriptText: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={(item as Shot).tags.join(', ')}
                onChange={(e) => updateFn({ tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">General Notes</label>
              <textarea
                value={(item as Shot).generalNotes}
                onChange={(e) => updateFn({ generalNotes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        {selectedType === 'frame' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Caption</label>
              <textarea
                value={(item as StoryboardFrame).caption}
                onChange={(e) => updateFn({ caption: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <img
                src={(item as StoryboardFrame).image}
                alt={(item as StoryboardFrame).caption}
                className="w-full rounded-md border border-gray-300"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

