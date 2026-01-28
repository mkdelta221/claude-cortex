'use client';

/**
 * Version Panel Component
 *
 * Displays current version, checks for updates, and allows
 * updating and restarting the server.
 */

import { useState } from 'react';
import {
  useVersion,
  useForceCheckForUpdates,
  usePerformUpdate,
  useRestartServer,
  VersionInfo,
} from '@/hooks/useMemories';
import { Button } from '@/components/ui/button';

type UpdateState = 'idle' | 'checking' | 'updating' | 'restarting' | 'success' | 'error';

export function VersionPanel() {
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRestartPrompt, setShowRestartPrompt] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);

  const { data: versionData, isLoading: versionLoading } = useVersion();
  const checkMutation = useForceCheckForUpdates();
  const updateMutation = usePerformUpdate();
  const restartMutation = useRestartServer();

  const handleCheckUpdates = async () => {
    setUpdateState('checking');
    setErrorMessage(null);
    try {
      const result = await checkMutation.mutateAsync();
      setUpdateInfo(result);
      setUpdateState('idle');
    } catch {
      setErrorMessage('Failed to check for updates');
      setUpdateState('error');
    }
  };

  const handleUpdate = async () => {
    setUpdateState('updating');
    setErrorMessage(null);
    try {
      const result = await updateMutation.mutateAsync();
      if (result.success) {
        setUpdateState('success');
        if (result.requiresRestart) {
          setShowRestartPrompt(true);
        }
        // Clear update info since we just updated
        setUpdateInfo(null);
      } else {
        setErrorMessage(result.error || 'Update failed');
        setUpdateState('error');
      }
    } catch (err) {
      setErrorMessage('Update failed: ' + (err as Error).message);
      setUpdateState('error');
    }
  };

  const handleRestart = async () => {
    if (
      !confirm(
        'This will restart the server. The page will need to be refreshed after restart. Continue?'
      )
    ) {
      return;
    }

    setUpdateState('restarting');
    try {
      await restartMutation.mutateAsync();
      // Show message to refresh page - server will disconnect
      setErrorMessage(null);
    } catch {
      setErrorMessage('Failed to restart server');
      setUpdateState('error');
    }
  };

  if (versionLoading) {
    return (
      <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700 animate-pulse">
        <div className="h-4 bg-slate-700 rounded w-24"></div>
      </div>
    );
  }

  const hasUpdate = updateInfo?.updateAvailable;
  const currentVersion = versionData?.version || 'unknown';
  const latestVersion = updateInfo?.latestVersion;

  return (
    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
      {/* Version Display */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-400">Version</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-slate-300">v{currentVersion}</span>
          {hasUpdate && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-green-500/20 text-green-400 border border-green-500/30">
              Update available
            </span>
          )}
        </div>
      </div>

      {/* Update Info */}
      {updateInfo && latestVersion && currentVersion !== latestVersion && (
        <div className="text-xs text-slate-500 mb-3">
          Latest: v{latestVersion}
          {updateInfo.cacheHit && <span className="text-slate-600"> (cached)</span>}
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="px-2 py-1.5 mb-3 rounded text-xs bg-red-500/20 border border-red-500/30 text-red-300">
          {errorMessage}
        </div>
      )}

      {/* Success Message with Restart Prompt */}
      {updateState === 'success' && showRestartPrompt && (
        <div className="px-2 py-1.5 mb-3 rounded text-xs bg-green-500/20 border border-green-500/30 text-green-300">
          Update complete! Restart the server to apply changes.
        </div>
      )}

      {/* Restarting Message */}
      {updateState === 'restarting' && (
        <div className="px-2 py-1.5 mb-3 rounded text-xs bg-orange-500/20 border border-orange-500/30 text-orange-300">
          Restarting server... Refresh the page in a few seconds.
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCheckUpdates}
          disabled={checkMutation.isPending || updateState === 'updating'}
          className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-600/20"
          title="Check npm for newer versions"
        >
          {checkMutation.isPending || updateState === 'checking' ? '...' : 'Check Updates'}
        </Button>

        {hasUpdate && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUpdate}
            disabled={updateState === 'updating' || updateState === 'restarting'}
            className="flex-1 border-green-600 text-green-400 hover:bg-green-600/20 hover:text-green-300"
            title="Update to latest version via npm"
          >
            {updateState === 'updating' ? '...' : 'Update'}
          </Button>
        )}

        {showRestartPrompt && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRestart}
            disabled={updateState === 'restarting'}
            className="flex-1 border-orange-600 text-orange-400 hover:bg-orange-600/20 hover:text-orange-300"
            title="Restart the server to apply updates"
          >
            {updateState === 'restarting' ? '...' : 'Restart'}
          </Button>
        )}
      </div>
    </div>
  );
}
