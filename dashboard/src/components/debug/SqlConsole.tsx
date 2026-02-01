'use client';

/**
 * SQL Console Component
 *
 * Allows executing SQL queries against the memory database.
 * Read-only by default with optional write mode.
 */

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Predefined query templates
const QUERY_TEMPLATES = [
  {
    label: 'Top memories by salience',
    query: 'SELECT id, title, salience, type, category FROM memories ORDER BY salience DESC LIMIT 20',
  },
  {
    label: 'Memory type distribution',
    query: "SELECT type, COUNT(*) as count FROM memories GROUP BY type",
  },
  {
    label: 'Category distribution',
    query: 'SELECT category, COUNT(*) as count FROM memories GROUP BY category ORDER BY count DESC',
  },
  {
    label: 'Contradiction links',
    query: "SELECT * FROM memory_links WHERE relationship = 'contradicts'",
  },
  {
    label: 'Recently accessed',
    query: 'SELECT id, title, last_accessed, access_count FROM memories ORDER BY last_accessed DESC LIMIT 20',
  },
  {
    label: 'Low salience (at risk)',
    query: 'SELECT id, title, salience, decayed_score, type FROM memories WHERE decayed_score < 0.3 ORDER BY decayed_score ASC LIMIT 20',
  },
  {
    label: 'Memories by project',
    query: 'SELECT project, COUNT(*) as count FROM memories GROUP BY project ORDER BY count DESC',
  },
];

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
  error?: string;
}

export function SqlConsole() {
  const [query, setQuery] = useState(QUERY_TEMPLATES[0].query);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [allowWrite, setAllowWrite] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keyboard shortcut: Ctrl+Enter to execute
  const executeQueryRef = useRef<() => void>(() => {});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        executeQueryRef.current();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const executeQuery = async () => {
    if (!query.trim()) return;

    // Safety check for destructive operations
    const upperQuery = query.toUpperCase();
    if (!allowWrite) {
      if (upperQuery.includes('DROP') || upperQuery.includes('DELETE') ||
          upperQuery.includes('TRUNCATE') || upperQuery.includes('INSERT') ||
          upperQuery.includes('UPDATE') || upperQuery.includes('ALTER')) {
        setResult({
          columns: [],
          rows: [],
          rowCount: 0,
          executionTime: 0,
          error: 'Write operations are disabled. Enable "Allow writes" to execute this query.',
        });
        return;
      }
    }

    // Block DROP/TRUNCATE even in write mode
    if (upperQuery.includes('DROP') || upperQuery.includes('TRUNCATE')) {
      setResult({
        columns: [],
        rows: [],
        rowCount: 0,
        executionTime: 0,
        error: 'DROP and TRUNCATE operations are blocked for safety.',
      });
      return;
    }

    setIsExecuting(true);
    const startTime = performance.now();

    try {
      const response = await fetch(`${API_BASE}/api/sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), allowWrite }),
      });

      const data = await response.json();
      const executionTime = performance.now() - startTime;

      if (!response.ok) {
        setResult({
          columns: [],
          rows: [],
          rowCount: 0,
          executionTime,
          error: data.error || 'Query failed',
        });
      } else {
        setResult({
          columns: data.columns || [],
          rows: data.rows || [],
          rowCount: data.rowCount || data.rows?.length || 0,
          executionTime,
        });

        // Add to history
        setHistory((prev) => {
          const updated = [query, ...prev.filter((q) => q !== query)];
          return updated.slice(0, 20); // Keep last 20
        });
      }
    } catch (err) {
      setResult({
        columns: [],
        rows: [],
        rowCount: 0,
        executionTime: performance.now() - startTime,
        error: (err as Error).message,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  executeQueryRef.current = executeQuery;

  const loadTemplate = (templateQuery: string) => {
    setQuery(templateQuery);
    textareaRef.current?.focus();
  };

  const loadFromHistory = (historicalQuery: string) => {
    setQuery(historicalQuery);
    textareaRef.current?.focus();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Query Editor */}
      <div className="p-3 border-b border-slate-700">
        <div className="flex gap-2 mb-2">
          {/* Template Dropdown */}
          <select
            onChange={(e) => e.target.value && loadTemplate(e.target.value)}
            className="bg-slate-800 border border-slate-600 text-white text-xs rounded px-2 py-1"
            value=""
          >
            <option value="">Templates...</option>
            {QUERY_TEMPLATES.map((t) => (
              <option key={t.label} value={t.query}>
                {t.label}
              </option>
            ))}
          </select>

          {/* History Dropdown */}
          {history.length > 0 && (
            <select
              onChange={(e) => e.target.value && loadFromHistory(e.target.value)}
              className="bg-slate-800 border border-slate-600 text-white text-xs rounded px-2 py-1"
              value=""
            >
              <option value="">History...</option>
              {history.map((q, i) => (
                <option key={i} value={q}>
                  {q.slice(0, 50)}...
                </option>
              ))}
            </select>
          )}

          <div className="flex-1" />

          {/* Allow Write Toggle */}
          <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={allowWrite}
              onChange={(e) => setAllowWrite(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800"
            />
            Allow writes
          </label>

          <Button
            onClick={executeQuery}
            disabled={isExecuting || !query.trim()}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isExecuting ? 'Running...' : 'Execute (Ctrl+Enter)'}
          </Button>
        </div>

        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-24 bg-slate-900 border border-slate-600 rounded p-2 text-white font-mono text-sm resize-none focus:outline-none focus:border-blue-500"
          placeholder="Enter SQL query..."
          spellCheck={false}
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto p-3">
        {result?.error && (
          <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300 text-sm mb-3">
            {result.error}
          </div>
        )}

        {result && !result.error && (
          <>
            <div className="text-xs text-slate-400 mb-2">
              {result.rowCount} row{result.rowCount !== 1 ? 's' : ''} returned in{' '}
              {result.executionTime.toFixed(0)}ms
            </div>

            {result.rows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700">
                      {result.columns.map((col) => (
                        <th
                          key={col}
                          className="text-left text-slate-400 font-medium py-2 px-3 bg-slate-800/50"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/30">
                        {result.columns.map((col) => (
                          <td key={col} className="py-2 px-3 text-white">
                            {formatCellValue(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-slate-500 text-center py-4">No rows returned</div>
            )}
          </>
        )}

        {!result && (
          <div className="text-slate-500 text-sm text-center py-8">
            Enter a SQL query and press Execute or Ctrl+Enter
          </div>
        )}
      </div>
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') {
    // Truncate long strings
    if (value.length > 100) {
      return value.slice(0, 100) + '...';
    }
    return value;
  }
  if (typeof value === 'number') {
    // Format decimals nicely
    if (!Number.isInteger(value)) {
      return value.toFixed(4);
    }
    return value.toString();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return JSON.stringify(value);
}
