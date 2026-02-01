'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Memory } from '@/types/memory';
import { MemoryCard } from './MemoryCard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type SortKey = 'salience' | 'createdAt' | 'lastAccessed' | 'decayedScore';
type ViewStyle = 'grid' | 'list';

interface MemoriesViewProps {
  memories: Memory[];
  selectedMemory: Memory | null;
  onSelectMemory: (m: Memory | null) => void;
}

export function MemoriesView({ memories, selectedMemory, onSelectMemory }: MemoriesViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('salience');
  const [viewStyle, setViewStyle] = useState<ViewStyle>('grid');
  const [bulkMode, setBulkMode] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const sorted = useMemo(() => {
    const arr = [...memories];
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'salience': return b.salience - a.salience;
        case 'createdAt': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'lastAccessed': return new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime();
        case 'decayedScore': return (b.decayedScore ?? b.salience) - (a.decayedScore ?? a.salience);
        default: return 0;
      }
    });
    return arr;
  }, [memories, sortKey]);

  const handleCheck = useCallback((id: number, val: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (val) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const selectAll = () => setChecked(new Set(sorted.map((m) => m.id)));
  const _deselectAll = () => setChecked(new Set());

  const deleteSelected = async () => {
    if (checked.size === 0) return;
    setDeleting(true);
    try {
      await Promise.all(
        Array.from(checked).map((id) =>
          fetch(`${API_BASE}/api/memories/${id}`, { method: 'DELETE' })
        )
      );
      setChecked(new Set());
      queryClient.invalidateQueries({ queryKey: ['memories'] });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 shrink-0">
        <span className="text-xs text-slate-400">{memories.length} memories</span>

        <div className="w-px h-5 bg-slate-700" />

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded px-2 py-1"
        >
          <option value="salience">Salience</option>
          <option value="createdAt">Created</option>
          <option value="lastAccessed">Last Accessed</option>
          <option value="decayedScore">Decay Score</option>
        </select>

        <div className="flex items-center border border-slate-700 rounded overflow-hidden">
          <button
            onClick={() => setViewStyle('grid')}
            className={`px-2 py-1 text-xs ${viewStyle === 'grid' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Grid
          </button>
          <button
            onClick={() => setViewStyle('list')}
            className={`px-2 py-1 text-xs ${viewStyle === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            List
          </button>
        </div>

        <div className="w-px h-5 bg-slate-700" />

        <button
          onClick={() => { setBulkMode(!bulkMode); setChecked(new Set()); }}
          className={`px-2 py-1 text-xs rounded ${bulkMode ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
        >
          Select
        </button>

        {bulkMode && (
          <>
            <button onClick={selectAll} className="px-2 py-1 text-xs text-slate-400 hover:text-white">
              Select all
            </button>
            <button
              onClick={deleteSelected}
              disabled={checked.size === 0 || deleting}
              className="px-2 py-1 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 disabled:opacity-40"
            >
              {deleting ? 'Deleting...' : `Delete (${checked.size})`}
            </button>
          </>
        )}
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div
          className={
            viewStyle === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'
              : 'flex flex-col gap-3 max-w-2xl'
          }
        >
          {sorted.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              isSelected={selectedMemory?.id === memory.id}
              onSelect={onSelectMemory}
              isChecked={bulkMode ? checked.has(memory.id) : undefined}
              onCheck={bulkMode ? handleCheck : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
