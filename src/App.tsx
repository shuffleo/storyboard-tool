import { useEffect, useState } from 'react';
import { useStore } from './store/useStore';
import { TableView } from './views/TableView';
import { StoryboardView } from './views/StoryboardView';
import { Inspector } from './components/Inspector';
import { TopBar } from './components/TopBar';

export type ViewType = 'table' | 'storyboard';

function App() {
  console.log('App: Component rendering...');
  // ALL hooks must be called before any conditional returns
  const init = useStore((state) => state.init);
  const project = useStore((state) => state.project);
  const [currentView, setCurrentView] = useState<ViewType>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'project' | 'scene' | 'shot' | 'frame' | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    console.log('App: Starting initialization...');
    let mounted = true;
    init()
      .then(() => {
        console.log('App: Initialization complete');
        if (mounted) setIsInitialized(true);
      })
      .catch((error) => {
        console.error('App: Failed to initialize:', error);
        if (mounted) setIsInitialized(true); // Still show the app even if init fails
      });
    return () => {
      mounted = false;
    };
  }, []); // Empty deps - only run once

  const handleSelect = (id: string, type: 'project' | 'scene' | 'shot' | 'frame') => {
    setSelectedId(id);
    setSelectedType(type);
  };

  if (!isInitialized) {
    console.log('App: Not initialized, showing loading screen');
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
        <div style={{ color: '#6b7280', fontSize: '16px' }}>Loading...</div>
      </div>
    );
  }
  
  console.log('App: Initialized, rendering main app');
  console.log('App: Project state:', project ? 'exists' : 'null');

  // Always show TopBar, even if project is null (it will handle it)
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f9fafb' }}>
      <TopBar currentView={currentView} onViewChange={setCurrentView} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {project && currentView === 'table' && <TableView onSelect={handleSelect} />}
          {project && currentView === 'storyboard' && <StoryboardView onSelect={handleSelect} />}
          {!project && (
            <div style={{ padding: '20px', color: '#6b7280', fontSize: '14px' }}>
              <div style={{ marginBottom: '10px' }}>No project loaded.</div>
              <div style={{ fontSize: '12px', color: '#9ca3af' }}>Check browser console (F12) for initialization logs.</div>
            </div>
          )}
        </div>
        {selectedId && selectedType && (
          <Inspector
            selectedId={selectedId}
            selectedType={selectedType}
            onClose={() => {
              setSelectedId(null);
              setSelectedType(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

export default App;

