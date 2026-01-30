'use client';

/**
 * UI State Store
 * Zustand store for dashboard UI state
 */

import { create } from 'zustand';
import { Memory, MemoryEvent } from '@/types/memory';

interface DashboardState {
  // Selected memory
  selectedMemory: Memory | null;
  setSelectedMemory: (memory: Memory | null) => void;

  // View mode
  viewMode: 'graph' | 'memories' | 'insights' | 'brain';
  setViewMode: (mode: 'graph' | 'memories' | 'insights' | 'brain') => void;

  // Filters
  typeFilter: string | null;
  categoryFilter: string | null;
  projectFilter: string | null;
  setTypeFilter: (type: string | null) => void;
  setCategoryFilter: (category: string | null) => void;
  setProjectFilter: (project: string | null) => void;

  // Recent events (for activity feed)
  recentEvents: MemoryEvent[];
  addEvent: (event: MemoryEvent) => void;
  clearEvents: () => void;

  // 3D camera state
  cameraPosition: [number, number, number];
  setCameraPosition: (pos: [number, number, number]) => void;

  // Sidebar visibility
  showLeftSidebar: boolean;
  showRightSidebar: boolean;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;

  // Search query
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  // Selected memory
  selectedMemory: null,
  setSelectedMemory: (memory) => set({ selectedMemory: memory }),

  // View mode
  viewMode: 'graph',
  setViewMode: (mode) => set({ viewMode: mode }),

  // Filters
  typeFilter: null,
  categoryFilter: null,
  projectFilter: null,
  setTypeFilter: (type) => set({ typeFilter: type }),
  setCategoryFilter: (category) => set({ categoryFilter: category }),
  setProjectFilter: (project) => set({ projectFilter: project }),

  // Recent events
  recentEvents: [],
  addEvent: (event) =>
    set((state) => ({
      recentEvents: [event, ...state.recentEvents].slice(0, 50),
    })),
  clearEvents: () => set({ recentEvents: [] }),

  // 3D camera
  cameraPosition: [0, 0, 12],
  setCameraPosition: (pos) => set({ cameraPosition: pos }),

  // Sidebars
  showLeftSidebar: true,
  showRightSidebar: true,
  toggleLeftSidebar: () =>
    set((state) => ({ showLeftSidebar: !state.showLeftSidebar })),
  toggleRightSidebar: () =>
    set((state) => ({ showRightSidebar: !state.showRightSidebar })),

  // Search
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
