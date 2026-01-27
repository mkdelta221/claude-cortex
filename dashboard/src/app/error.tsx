'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[claude-cortex] Dashboard error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 rounded-lg border border-gray-800 p-6 text-center">
        <div className="text-4xl mb-4">🧠</div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Visualization Error
        </h2>
        <p className="text-gray-400 mb-4">
          The brain visualization encountered an error. This might be due to WebGL
          compatibility or memory constraints.
        </p>
        {error.message && (
          <pre className="text-xs text-red-400 bg-gray-950 p-3 rounded mb-4 overflow-auto max-h-32 text-left">
            {error.message}
          </pre>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}
