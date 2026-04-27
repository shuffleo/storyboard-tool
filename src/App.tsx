import { useEffect, useState, useCallback } from 'react';
import { useStore } from './store/useStore';
import { TableView } from './views/TableView';
import { StoryboardView } from './views/StoryboardView';
import { AnimaticsView } from './views/AnimaticsView';
import { Inspector } from './components/Inspector';
import { TopBar } from './components/TopBar';
import { DebugPanel } from './components/DebugPanel';
import { LandingScreen } from './components/LandingScreen';
import type { RecentProject } from './components/LandingScreen';
import { debugLogger } from './utils/debug';
import { detectFSACapabilities, hasPermission } from './sync/fileSystemAccess';
import type { ProjectFolderHandle } from './sync/fileSystemAccess';
import { db } from './db/indexeddb';

export type ViewType = 'table' | 'storyboard' | 'animatics';

type AppPhase = 'loading' | 'landing' | 'project';

function App() {
  debugLogger.log('App', 'Component rendering');
  const init = useStore((state) => state.init);
  const project = useStore((state) => state.project);
  const projectSource = useStore((state) => state.projectSource);
  const syncStatus = useStore((state) => state.syncStatus);
  const agentEditing = useStore((state) => state.agentEditing);
  const initSync = useStore((state) => state.initSync);
  const teardownSync = useStore((state) => state.teardownSync);
  const openProjectFromHandle = useStore((state) => state.openProjectFromHandle);
  const closeProject = useStore((state) => state.closeProject);
  const [currentView, setCurrentView] = useState<ViewType>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'project' | 'scene' | 'shot' | 'frame' | null>(null);
  const [appPhase, setAppPhase] = useState<AppPhase>('loading');
  const [debugMode, setDebugMode] = useState(debugLogger.isEnabled());
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  useEffect(() => {
    debugLogger.log('App', 'Starting initialization');
    let mounted = true;

    const startup = async () => {
      const capabilities = detectFSACapabilities();

      if (capabilities.supported) {
        const saved = await db.loadDirectoryHandle();
        if (saved) {
          try {
            const granted = await hasPermission(saved.handle);
            if (granted) {
              await openProjectFromHandle({
                directoryHandle: saved.handle,
                projectFilePath: 'project.md',
              });
              if (mounted) setAppPhase('project');
              return;
            }
          } catch {
            debugLogger.log('App', 'Saved handle no longer valid');
          }
        }

        const recents = await db.loadRecentProjects();
        if (mounted) {
          setRecentProjects(recents as RecentProject[]);
          setAppPhase('landing');
        }
      } else {
        await init();
        if (mounted) setAppPhase('project');
      }
    };

    startup().catch((error) => {
      debugLogger.error('App', 'Startup failed', error);
      init().then(() => {
        if (mounted) setAppPhase('project');
      });
    });

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (appPhase === 'project' && projectSource !== 'none') {
      initSync();
      return () => teardownSync();
    }
  }, [appPhase]);

  useEffect(() => {
    const checkDebugMode = () => setDebugMode(debugLogger.isEnabled());
    const interval = setInterval(checkDebugMode, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('retroSkin');
    const retroSkinEnabled = saved === null ? true : saved === 'true';
    if (retroSkinEnabled) document.documentElement.classList.add('retro-skin');
  }, []);

  useEffect(() => {
    document.title = project?.title || 'Untitled Project';
  }, [project?.title]);

  useEffect(() => {
    if (currentView === 'animatics') {
      setSelectedId(null);
      setSelectedType(null);
    }
  }, [currentView]);

  const handleProjectOpened = useCallback(async (handle: ProjectFolderHandle) => {
    try {
      await openProjectFromHandle(handle);
      const recents = await db.loadRecentProjects();
      const existing = recents.findIndex(
        (r: any) => r.directoryHandle === handle.directoryHandle
      );
      const entry = {
        title: useStore.getState().project.title,
        directoryHandle: handle.directoryHandle,
        lastOpened: Date.now(),
      };
      const updated = existing >= 0
        ? [entry, ...recents.filter((_: any, i: number) => i !== existing)]
        : [entry, ...recents];
      await db.saveRecentProjects(updated.slice(0, 10) as any);
      setAppPhase('project');
    } catch (err: any) {
      console.error('Failed to open project:', err);
    }
  }, [openProjectFromHandle]);

  const handleFallbackLoad = useCallback(async () => {
    await init();
    setAppPhase('project');
  }, [init]);

  const handleCloseProject = useCallback(() => {
    closeProject();
    setAppPhase('landing');
    setSelectedId(null);
    setSelectedType(null);
  }, [closeProject]);

  const handleRemoveRecent = useCallback(async (index: number) => {
    setRecentProjects((prev) => prev.filter((_, i) => i !== index));
    const recents = await db.loadRecentProjects();
    const updated = recents.filter((_: any, i: number) => i !== index);
    await db.saveRecentProjects(updated as any);
  }, []);

  const handleSelect = useCallback((id: string, type: 'project' | 'scene' | 'shot' | 'frame') => {
    if (!id || !type) return;
    setSelectedId(id);
    setSelectedType(type);
  }, []);

  if (appPhase === 'loading') {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' }}>
        <div style={{ color: '#94a3b8', fontSize: '16px' }}>Loading...</div>
      </div>
    );
  }

  if (appPhase === 'landing') {
    return (
      <>
        <LandingScreen
          onProjectOpened={handleProjectOpened}
          onFallbackLoad={handleFallbackLoad}
          recentProjects={recentProjects}
          onRemoveRecent={handleRemoveRecent}
        />
        <DebugPanel enabled={debugMode} />
      </>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a', position: 'relative' }}>
      <TopBar
        currentView={currentView}
        onViewChange={setCurrentView}
        projectSource={projectSource}
        syncStatus={syncStatus}
        onCloseProject={handleCloseProject}
      />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {project && currentView === 'table' && <TableView onSelect={handleSelect} />}
          {project && currentView === 'storyboard' && <StoryboardView onSelect={handleSelect} />}
          {project && currentView === 'animatics' && <AnimaticsView onSelect={handleSelect} />}
          {!project && (
            <div style={{ padding: '20px', color: '#e2e8f0', fontSize: '14px' }}>
              <div style={{ marginBottom: '10px' }}>No project loaded.</div>
            </div>
          )}
        </div>
        {selectedId && selectedType && (
          <Inspector
            selectedId={selectedId}
            selectedType={selectedType}
            currentView={currentView}
            onClose={() => {
              setSelectedId(null);
              setSelectedType(null);
            }}
          />
        )}
      </div>
      {agentEditing && (
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(2px)',
          pointerEvents: 'all',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid rgba(148, 163, 184, 0.3)',
              borderTopColor: '#818cf8',
              borderRadius: '50%',
              animation: 'agent-spin 0.8s linear infinite',
            }} />
            <div style={{ color: '#e2e8f0', fontSize: '16px', fontWeight: 500 }}>
              Agent is editing...
            </div>
            <div style={{ color: '#94a3b8', fontSize: '13px' }}>
              Changes will appear when the agent finishes
            </div>
          </div>
          <style>{`@keyframes agent-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      <DebugPanel enabled={debugMode} />
    </div>
  );
}

export default App;
