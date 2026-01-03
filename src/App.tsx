import { useEffect, useState, useCallback } from 'react';
import { useStore } from './store/useStore';
import { TableView } from './views/TableView';
import { StoryboardView } from './views/StoryboardView';
import { AnimaticsView } from './views/AnimaticsView';
import { Inspector } from './components/Inspector';
import { TopBar } from './components/TopBar';
import { DebugPanel } from './components/DebugPanel';
import { debugLogger } from './utils/debug';

export type ViewType = 'table' | 'storyboard' | 'animatics';

function App() {
  debugLogger.log('App', 'Component rendering');
  // ALL hooks must be called before any conditional returns
  const init = useStore((state) => state.init);
  const project = useStore((state) => state.project);
  const [currentView, setCurrentView] = useState<ViewType>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'project' | 'scene' | 'shot' | 'frame' | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [debugMode, setDebugMode] = useState(debugLogger.isEnabled());

  useEffect(() => {
    debugLogger.log('App', 'Starting initialization');
    let mounted = true;
    init()
      .then(() => {
        debugLogger.log('App', 'Initialization complete');
        if (mounted) setIsInitialized(true);
      })
      .catch((error) => {
        debugLogger.error('App', 'Failed to initialize', error);
        if (mounted) setIsInitialized(true); // Still show the app even if init fails
      });
    return () => {
      mounted = false;
    };
  }, []); // Empty deps - only run once

  // Listen for debug mode changes
  useEffect(() => {
    const checkDebugMode = () => {
      setDebugMode(debugLogger.isEnabled());
    };
    const interval = setInterval(checkDebugMode, 500);
    return () => clearInterval(interval);
  }, []);

  // Apply retro skin on mount if enabled (default to true)
  useEffect(() => {
    const saved = localStorage.getItem('retroSkin');
    const retroSkinEnabled = saved === null ? true : saved === 'true';
    if (retroSkinEnabled) {
      document.documentElement.classList.add('retro-skin');
    }
  }, []);

  // Update document title with project name
  useEffect(() => {
    const projectTitle = project?.title || 'Untitled Project';
    document.title = projectTitle;
  }, [project?.title]);

  // Clear selection when switching to Animatics view (Inspector should be hidden by default)
  useEffect(() => {
    if (currentView === 'animatics') {
      setSelectedId(null);
      setSelectedType(null);
    }
  }, [currentView]);

  const handleSelect = useCallback((id: string, type: 'project' | 'scene' | 'shot' | 'frame') => {
      debugLogger.log('App', 'handleSelect called', { 
      id, 
      type,
      idType: typeof id,
      idLength: id?.length,
      typeType: typeof type,
      previousId: selectedId,
      previousType: selectedType,
      currentView
    });
    
    try {
      debugLogger.log('App', 'Validating handleSelect parameters', {
        idExists: !!id,
        idValid: !!id && id.length > 0,
        typeExists: !!type,
        typeValid: ['project', 'scene', 'shot', 'frame'].includes(type)
      });
      
      if (!id || !type) {
        debugLogger.warn('App', 'Invalid select: id or type is missing', { 
          id, 
          type,
          idFalsy: !id,
          typeFalsy: !type,
          idValue: id,
          typeValue: type
        });
        return;
      }
      
      debugLogger.info('App', 'Setting selection state', { 
        id, 
        type, 
        previousId: selectedId, 
        previousType: selectedType,
        willChange: selectedId !== id || selectedType !== type
      });
      
      debugLogger.log('App', 'Calling setSelectedId', { 
        oldId: selectedId,
        newId: id,
        idType: typeof id
      });
      setSelectedId(id);
      debugLogger.log('App', 'setSelectedId called - state update queued');
      
      debugLogger.log('App', 'Calling setSelectedType', { 
        oldType: selectedType,
        newType: type,
        typeType: typeof type
      });
      setSelectedType(type);
      debugLogger.log('App', 'setSelectedType called - state update queued');
      
      debugLogger.log('App', 'Selection state updates queued successfully', {
        newId: id,
        newType: type,
        note: 'React will batch these updates and re-render'
      });
    } catch (error) {
      debugLogger.error('App', 'Error in handleSelect - EXCEPTION CAUGHT', error, { 
        id, 
        type,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        previousId: selectedId,
        previousType: selectedType
      });
    }
  }, [selectedId, selectedType, currentView]);

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
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a' }}>
      <TopBar currentView={currentView} onViewChange={setCurrentView} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {project && currentView === 'table' && <TableView onSelect={handleSelect} />}
          {project && currentView === 'storyboard' && <StoryboardView onSelect={handleSelect} />}
          {project && currentView === 'animatics' && <AnimaticsView onSelect={handleSelect} />}
          {!project && (
            <div style={{ padding: '20px', color: '#e2e8f0', fontSize: '14px' }}>
              <div style={{ marginBottom: '10px' }}>No project loaded.</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Check browser console (F12) for initialization logs.</div>
            </div>
          )}
        </div>
        {selectedId && selectedType && (
          <Inspector
            selectedId={selectedId}
            selectedType={selectedType}
            currentView={currentView}
            onClose={() => {
              debugLogger.log('App', 'Closing Inspector');
              setSelectedId(null);
              setSelectedType(null);
            }}
          />
        )}
      </div>
      {/* DebugPanel rendered via portal to body - always visible */}
      <DebugPanel enabled={debugMode} />
    </div>
  );
}

export default App;

