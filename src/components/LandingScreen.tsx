import { useState } from 'react';
import { detectFSACapabilities, openProjectFolder, createProjectFolder, requestPermission } from '../sync/fileSystemAccess';
import type { ProjectFolderHandle } from '../sync/fileSystemAccess';

export interface RecentProject {
  title: string;
  directoryHandle: FileSystemDirectoryHandle;
  lastOpened: number;
}

interface LandingScreenProps {
  onProjectOpened: (handle: ProjectFolderHandle) => void;
  onFallbackLoad: () => void;
  recentProjects: RecentProject[];
  onRemoveRecent: (index: number) => void;
}

export function LandingScreen({ onProjectOpened, onFallbackLoad, recentProjects, onRemoveRecent }: LandingScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [showTitleInput, setShowTitleInput] = useState(false);
  const [newTitle, setNewTitle] = useState('Untitled Project');
  const [loading, setLoading] = useState(false);

  const capabilities = detectFSACapabilities();

  const handleOpenProject = async () => {
    setError(null);
    setLoading(true);
    try {
      const handle = await openProjectFolder();
      onProjectOpened(handle);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled picker
      } else {
        setError(err.message || 'Failed to open project folder');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    setError(null);
    setLoading(true);
    try {
      const handle = await createProjectFolder(newTitle);
      onProjectOpened(handle);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled picker
      } else {
        setError(err.message || 'Failed to create project');
      }
    } finally {
      setLoading(false);
      setShowTitleInput(false);
    }
  };

  const handleRecentProject = async (rp: RecentProject, index: number) => {
    setError(null);
    setLoading(true);
    try {
      const granted = await requestPermission(rp.directoryHandle);
      if (granted) {
        onProjectOpened({
          directoryHandle: rp.directoryHandle,
          projectFilePath: 'project.md',
        });
      } else {
        setError('Permission denied for this folder. It may have been moved or deleted.');
        onRemoveRecent(index);
      }
    } catch {
      setError('Could not access this project folder. It may have been moved.');
      onRemoveRecent(index);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0f172a',
      color: '#e2e8f0',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 480, width: '100%', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, color: '#f1f5f9' }}>
            Storyboard
          </h1>
          <p style={{ fontSize: 14, color: '#94a3b8' }}>
            Visual storytelling, organized.
          </p>
        </div>

        {error && (
          <div style={{
            padding: '12px 16px',
            marginBottom: 16,
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            color: '#fca5a5',
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {capabilities.supported ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {showTitleInput ? (
              <div style={{
                padding: 20,
                backgroundColor: '#1e293b',
                borderRadius: 12,
                border: '1px solid #334155',
              }}>
                <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>
                  Project Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: 8,
                    color: '#f1f5f9',
                    fontSize: 15,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    onClick={handleCreateProject}
                    disabled={loading || !newTitle.trim()}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: loading ? 'wait' : 'pointer',
                      opacity: loading || !newTitle.trim() ? 0.5 : 1,
                    }}
                  >
                    {loading ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    onClick={() => setShowTitleInput(false)}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#334155',
                      color: '#e2e8f0',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowTitleInput(true)}
                disabled={loading}
                style={{
                  padding: '14px 20px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: loading ? 'wait' : 'pointer',
                  transition: 'background-color 0.15s',
                }}
              >
                Create New Project
              </button>
            )}

            <button
              onClick={handleOpenProject}
              disabled={loading}
              style={{
                padding: '14px 20px',
                backgroundColor: '#1e293b',
                color: '#e2e8f0',
                border: '1px solid #334155',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? 'wait' : 'pointer',
                transition: 'background-color 0.15s',
              }}
            >
              {loading ? 'Opening...' : 'Open Existing Project'}
            </button>

            {recentProjects.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 13, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  Recent Projects
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {recentProjects.map((rp, i) => (
                    <button
                      key={i}
                      onClick={() => handleRecentProject(rp, i)}
                      disabled={loading}
                      style={{
                        padding: '10px 14px',
                        backgroundColor: '#1e293b',
                        color: '#e2e8f0',
                        border: '1px solid #334155',
                        borderRadius: 8,
                        fontSize: 14,
                        textAlign: 'left',
                        cursor: loading ? 'wait' : 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>{rp.title}</span>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        {new Date(rp.lastOpened).toLocaleDateString()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 20 }}>
              Your browser doesn't support direct folder access. The app will use internal storage.
            </p>
            <button
              onClick={onFallbackLoad}
              style={{
                padding: '14px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Continue with Internal Storage
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
