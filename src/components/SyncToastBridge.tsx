import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { useToast } from './Toast';
import type { SyncStatus } from '../sync/wsClient';

export function SyncToastBridge() {
  const syncStatus = useStore((s) => s.syncStatus);
  const { showToast } = useToast();
  const prevStatus = useRef<SyncStatus | null>(null);
  const hasConnectedOnce = useRef(false);

  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = syncStatus;

    if (syncStatus === 'connected') {
      if (hasConnectedOnce.current && prev === 'disconnected') {
        showToast('Reconnected to companion server', 'success', 3000);
      }
      hasConnectedOnce.current = true;
    }

    if (syncStatus === 'disconnected' && hasConnectedOnce.current && prev === 'connected') {
      showToast('Disconnected from companion server. Reconnecting...', 'warning', 5000);
    }
  }, [syncStatus, showToast]);

  return null;
}
