'use client';

/**
 * Main Dashboard Page
 * Multi-view dashboard for the Claude Cortex memory system
 */

import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useMemoriesWithRealtime, useStats, useAccessMemory, useConsolidate, useProjects, useMemoryLinks, useControlStatus, usePauseMemory, useResumeMemory } from '@/hooks/useMemories';
import { useDashboardStore } from '@/lib/store';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSuggestions } from '@/hooks/useSuggestions';
import { MemoryDetail } from '@/components/memory/MemoryDetail';
import { MemoriesView } from '@/components/memories/MemoriesView';
import { NavRail } from '@/components/nav/NavRail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InsightsView } from '@/components/insights/InsightsView';
import { Memory } from '@/types/memory';

// Dynamic imports (avoid SSR issues with canvas/WebGL)
const KnowledgeGraph = dynamic(
  () => import('@/components/graph/KnowledgeGraph'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-slate-950">
        <div className="text-slate-400 animate-pulse">Loading Graph...</div>
      </div>
    ),
  }
);

const BrainScene = dynamic(
  () => import('@/components/brain/BrainScene').then((mod) => mod.BrainScene),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-slate-950">
        <div className="text-slate-400 animate-pulse">Loading 3D Brain...</div>
      </div>
    ),
  }
);

export default function DashboardPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Debounce search to avoid API calls on every keystroke
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // Zustand store
  const { viewMode, selectedMemory, setSelectedMemory } = useDashboardStore();

  // Search suggestions
  const { data: suggestions = [] } = useSuggestions(searchQuery);

  // Fetch projects for dropdown
  const { data: projectsData } = useProjects();

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSuggestion = (text: string) => {
    setSearchQuery(text);
    setShowSuggestions(false);
    searchInputRef.current?.focus();
  };

  // Data fetching with real-time WebSocket updates
  const {
    data: memories = [],
    isLoading: memoriesLoading,
    isConnected,
  } = useMemoriesWithRealtime({
    limit: 200,
    query: debouncedSearch || undefined,
    mode: debouncedSearch ? 'search' : 'recent',
    project: selectedProject,
    type: typeFilter,
    category: categoryFilter,
  });
  const { data: stats, isLoading: statsLoading } = useStats(selectedProject);
  const { data: links = [] } = useMemoryLinks(selectedProject);

  // Mutations
  const accessMutation = useAccessMemory();
  const consolidateMutation = useConsolidate();

  // Control status
  const { data: controlStatus } = useControlStatus();
  const pauseMutation = usePauseMemory();
  const resumeMutation = useResumeMemory();
  const isPaused = controlStatus?.paused ?? false;

  const handleSelectMemory = (memory: Memory | null) => {
    setSelectedMemory(memory);
  };

  const handleSelectMemoryById = (id: number) => {
    const memory = memories.find(m => m.id === id);
    if (memory) {
      setSelectedMemory(memory);
    }
  };

  const handleReinforce = (id: number) => {
    accessMutation.mutate(id);
  };

  const handleConsolidate = () => {
    consolidateMutation.mutate();
  };

  return (
    <div className="h-screen w-screen bg-slate-950 text-white overflow-hidden flex flex-col">
      {/* Top Bar */}
      <header className="h-14 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            🧠 Claude Cortex
          </h1>

          {/* Project Selector */}
          <select
            value={selectedProject || ''}
            onChange={(e) => setSelectedProject(e.target.value || undefined)}
            className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:ring-blue-500 focus:border-blue-500"
          >
            {projectsData?.projects.map((p) => (
              <option key={p.project || 'all'} value={p.project || ''}>
                {p.label} ({p.memory_count})
              </option>
            ))}
          </select>

          {/* Search Input */}
          <div className="relative">
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowSuggestions(false);
                }
              }}
              className="w-64 bg-slate-800 border-slate-700 text-white placeholder:text-slate-400 focus:ring-blue-500"
            />
            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50"
              >
                {suggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.type}-${suggestion.text}-${index}`}
                    onClick={() => handleSelectSuggestion(suggestion.text)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-700 transition-colors flex items-center gap-2"
                  >
                    <span className="text-white text-sm truncate flex-1">
                      {suggestion.text}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-600 text-slate-300">
                      {suggestion.type}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filter Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={`border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 ${showFilters ? 'bg-slate-700' : ''}`}
            title="Filter memories by type and category"
          >
            Filters {(typeFilter || categoryFilter) && '•'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-400 px-2">
            <span
              className={`w-2 h-2 rounded-full ${isPaused ? 'bg-orange-500 animate-pulse' : (isConnected ? 'bg-green-500' : 'bg-yellow-500')}`}
              title={isPaused ? 'Memory creation paused' : (isConnected ? 'Real-time connected' : 'Polling mode')}
            />
            {memories.length} memories
          </div>
        </div>
      </header>

      {/* Filter Bar (collapsible) */}
      {showFilters && (
        <div className="h-12 border-b border-slate-800 flex items-center gap-4 px-4 bg-slate-900/30">
          {/* Type filters */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Type:</span>
            {['short_term', 'long_term', 'episodic'].map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(typeFilter === type ? undefined : type)}
                className={`px-2 py-1 text-xs rounded-full transition-colors ${
                  typeFilter === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {type.replace('_', '-')}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-slate-700" />

          {/* Category filters */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Category:</span>
            {['architecture', 'pattern', 'error', 'learning', 'preference', 'context'].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(categoryFilter === cat ? undefined : cat)}
                className={`px-2 py-1 text-xs rounded-full transition-colors ${
                  categoryFilter === cat
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Clear filters */}
          {(typeFilter || categoryFilter) && (
            <>
              <div className="w-px h-6 bg-slate-700" />
              <button
                onClick={() => {
                  setTypeFilter(undefined);
                  setCategoryFilter(undefined);
                }}
                className="px-2 py-1 text-xs text-red-400 hover:text-red-300"
              >
                Clear all
              </button>
            </>
          )}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <NavRail />

        {/* Active View */}
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex-1 relative overflow-hidden"
          >
            {viewMode === 'brain' && (
              memoriesLoading ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-slate-400 animate-pulse">Loading memories...</div>
                </div>
              ) : (
                <BrainScene
                  memories={memories}
                  links={links}
                  selectedMemory={selectedMemory}
                  onSelectMemory={handleSelectMemory}
                />
              )
            )}
            {viewMode === 'graph' && (
              <KnowledgeGraph
                memories={memories}
                links={links}
                selectedMemory={selectedMemory}
                onSelectMemory={handleSelectMemory}
              />
            )}
            {viewMode === 'memories' && (
              <MemoriesView
                memories={memories}
                selectedMemory={selectedMemory}
                onSelectMemory={handleSelectMemory}
              />
            )}
            {viewMode === 'insights' && (
              <InsightsView selectedProject={selectedProject} stats={stats} />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Right Detail Panel */}
        {selectedMemory && (
          <div className="w-80 border-l border-slate-800 overflow-y-auto shrink-0">
            <MemoryDetail
              memory={selectedMemory}
              links={links}
              memories={memories}
              onClose={() => setSelectedMemory(null)}
              onReinforce={handleReinforce}
              onSelectMemory={handleSelectMemoryById}
            />
          </div>
        )}
      </div>
    </div>
  );
}
