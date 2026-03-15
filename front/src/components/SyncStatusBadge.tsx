import { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { subscribeToStatus, syncAll, type SyncStatus } from '../offlineSync';

export const SyncStatusBadge = () => {
  const [status, setStatus] = useState<SyncStatus>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToStatus((newStatus, count) => {
      setStatus(newStatus);
      setPendingCount(count);
      setIsSyncing(newStatus === 'syncing');
    });
    return unsubscribe;
  }, []);

  const handleSync = async () => {
    if (pendingCount > 0 && !isSyncing) {
      setIsSyncing(true);
      await syncAll();
      setIsSyncing(false);
    }
  };

  if (status === 'online' && pendingCount === 0) {
    return null;
  }

  return (
    <button
      onClick={handleSync}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
        status === 'offline'
          ? 'bg-red-500/20 text-red-400'
          : pendingCount > 0
            ? 'bg-yellow-500/20 text-yellow-400'
            : 'bg-green-500/20 text-green-400'
      }`}
    >
      {isSyncing ? (
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
      ) : status === 'offline' ? (
        <CloudOff className="w-3.5 h-3.5" />
      ) : (
        <Cloud className="w-3.5 h-3.5" />
      )}
      {pendingCount > 0 && <span>{pendingCount}</span>}
      {status === 'offline' && <span>Офлайн</span>}
    </button>
  );
};
