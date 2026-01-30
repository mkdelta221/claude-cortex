'use client';

/**
 * Memory Data Hooks
 * TanStack Query hooks for fetching memory data
 *
 * Uses WebSocket for real-time updates with polling as fallback.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Memory, MemoryStats, MemoryLink } from '@/types/memory';
import { useMemoryWebSocket } from '@/lib/websocket';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Pagination metadata from API
export interface PaginationInfo {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

// Paginated response from API
interface PaginatedMemoriesResponse {
  memories: Memory[];
  pagination: PaginationInfo;
}

// Fetch memories with pagination support
async function fetchMemories(options?: {
  project?: string;
  type?: string;
  category?: string;
  limit?: number;
  offset?: number;
  mode?: 'recent' | 'important' | 'search';
  query?: string;
}): Promise<PaginatedMemoriesResponse> {
  const params = new URLSearchParams();
  if (options?.project) params.set('project', options.project);
  if (options?.type) params.set('type', options.type);
  if (options?.category) params.set('category', options.category);
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());
  if (options?.mode) params.set('mode', options.mode);
  if (options?.query) params.set('query', options.query);

  const response = await fetch(`${API_BASE}/api/memories?${params}`);
  if (!response.ok) throw new Error('Failed to fetch memories');
  return response.json();
}

// Fetch memory stats
async function fetchStats(project?: string): Promise<MemoryStats> {
  const params = project ? `?project=${project}` : '';
  const response = await fetch(`${API_BASE}/api/stats${params}`);
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}

// Fetch memory links
async function fetchLinks(project?: string): Promise<MemoryLink[]> {
  const params = project ? `?project=${project}` : '';
  const response = await fetch(`${API_BASE}/api/links${params}`);
  if (!response.ok) throw new Error('Failed to fetch links');
  return response.json();
}

// Project info from API
export interface ProjectInfo {
  project: string | null;
  memory_count: number;
  label: string;
}

// Fetch list of projects
async function fetchProjects(): Promise<{ projects: ProjectInfo[] }> {
  const response = await fetch(`${API_BASE}/api/projects`);
  if (!response.ok) throw new Error('Failed to fetch projects');
  return response.json();
}

// Access a memory (reinforce)
async function accessMemory(id: number): Promise<Memory> {
  const response = await fetch(`${API_BASE}/api/memories/${id}/access`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to access memory');
  return response.json();
}

// Trigger consolidation
async function triggerConsolidation(): Promise<{
  success: boolean;
  consolidated: number;
  decayed: number;
  deleted: number;
}> {
  const response = await fetch(`${API_BASE}/api/consolidate`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to consolidate');
  return response.json();
}

// Hook: Get all memories with pagination
// Polling is reduced because WebSocket handles real-time updates
export function useMemories(options?: {
  project?: string;
  type?: string;
  category?: string;
  limit?: number;
  offset?: number;
  mode?: 'recent' | 'important' | 'search';
  query?: string;
}) {
  const query = useQuery({
    queryKey: ['memories', options],
    queryFn: () => fetchMemories(options),
    refetchInterval: 30000, // Fallback poll every 30 seconds (WebSocket handles real-time)
  });

  // Extract memories array and pagination from response
  return {
    ...query,
    data: query.data?.memories,
    pagination: query.data?.pagination,
  };
}

// Hook: Get memory stats
export function useStats(project?: string) {
  return useQuery({
    queryKey: ['stats', project],
    queryFn: () => fetchStats(project),
    refetchInterval: 30000, // Fallback poll every 30 seconds
  });
}

// Hook: Get memory links
export function useMemoryLinks(project?: string) {
  return useQuery({
    queryKey: ['links', project],
    queryFn: () => fetchLinks(project),
    refetchInterval: 60000, // Fallback poll every 60 seconds
  });
}

// Hook: Get list of projects
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    refetchInterval: 60000, // Refresh project list every minute
  });
}

// Hook: Combined memories with WebSocket real-time updates
export function useMemoriesWithRealtime(options?: {
  project?: string;
  type?: string;
  category?: string;
  limit?: number;
  offset?: number;
  mode?: 'recent' | 'important' | 'search';
  query?: string;
}) {
  // Connect to WebSocket for real-time updates
  const ws = useMemoryWebSocket();

  // Fetch memories with reduced polling (WebSocket handles most updates)
  const memories = useMemories(options);

  return {
    ...memories,
    isConnected: ws.isConnected,
    lastEvent: ws.lastEvent,
  };
}

// Hook: Access/reinforce a memory
export function useAccessMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: accessMemory,
    onSuccess: () => {
      // Invalidate memories to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

// Hook: Trigger consolidation
export function useConsolidate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: triggerConsolidation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

// ============================================
// CONTROL API
// ============================================

// Control status response
export interface ControlStatus {
  paused: boolean;
  uptime: number;
  uptimeFormatted: string;
}

// Fetch control status
async function fetchControlStatus(): Promise<ControlStatus> {
  const response = await fetch(`${API_BASE}/api/control/status`);
  if (!response.ok) throw new Error('Failed to fetch control status');
  return response.json();
}

// Pause memory creation
async function pauseMemoryCreation(): Promise<{ paused: boolean }> {
  const response = await fetch(`${API_BASE}/api/control/pause`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to pause');
  return response.json();
}

// Resume memory creation
async function resumeMemoryCreation(): Promise<{ paused: boolean }> {
  const response = await fetch(`${API_BASE}/api/control/resume`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to resume');
  return response.json();
}

// Hook: Get control status
export function useControlStatus() {
  return useQuery({
    queryKey: ['control-status'],
    queryFn: fetchControlStatus,
    refetchInterval: 10000, // Poll every 10 seconds for uptime updates
  });
}

// Hook: Pause memory creation
export function usePauseMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: pauseMemoryCreation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['control-status'] });
    },
  });
}

// Hook: Resume memory creation
export function useResumeMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: resumeMemoryCreation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['control-status'] });
    },
  });
}

// ============================================
// VERSION API
// ============================================

// Version info from API
export interface VersionInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checkedAt: string;
  cacheHit: boolean;
}

// Update result from API
export interface UpdateResult {
  success: boolean;
  previousVersion: string;
  newVersion: string | null;
  error?: string;
  requiresRestart: boolean;
}

// Fetch current version
async function fetchVersion(): Promise<{ version: string }> {
  const response = await fetch(`${API_BASE}/api/version`);
  if (!response.ok) throw new Error('Failed to fetch version');
  return response.json();
}

// Check for updates
async function checkForUpdates(force = false): Promise<VersionInfo> {
  const params = force ? '?force=true' : '';
  const response = await fetch(`${API_BASE}/api/version/check${params}`);
  if (!response.ok) throw new Error('Failed to check for updates');
  return response.json();
}

// Perform update
async function performUpdate(): Promise<UpdateResult> {
  const response = await fetch(`${API_BASE}/api/version/update`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to perform update');
  return response.json();
}

// Restart server
async function restartServer(): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/api/version/restart`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to restart server');
  return response.json();
}

// Hook: Get current version
export function useVersion() {
  return useQuery({
    queryKey: ['version'],
    queryFn: fetchVersion,
    staleTime: Infinity, // Version doesn't change during session
  });
}

// Hook: Check for updates (enabled on demand)
export function useCheckForUpdates(enabled = false) {
  return useQuery({
    queryKey: ['version-check'],
    queryFn: () => checkForUpdates(false),
    enabled,
    staleTime: 5 * 60 * 1000, // Match server cache TTL (5 minutes)
  });
}

// Hook: Force check for updates
export function useForceCheckForUpdates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => checkForUpdates(true),
    onSuccess: data => {
      queryClient.setQueryData(['version-check'], data);
    },
  });
}

// Hook: Perform update
export function usePerformUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: performUpdate,
    onSuccess: result => {
      if (result.success) {
        // Invalidate version queries to pick up new version
        queryClient.invalidateQueries({ queryKey: ['version'] });
        queryClient.invalidateQueries({ queryKey: ['version-check'] });
      }
    },
  });
}

// Hook: Restart server
export function useRestartServer() {
  return useMutation({
    mutationFn: restartServer,
  });
}

// ============================================
// INSIGHTS API
// ============================================

// Activity data for heatmap
export interface ActivityDay {
  date: string;
  count: number;
}

async function fetchActivity(project?: string): Promise<{ activity: ActivityDay[] }> {
  const params = project ? `?project=${project}` : '';
  const response = await fetch(`${API_BASE}/api/memories/activity${params}`);
  if (!response.ok) throw new Error('Failed to fetch activity');
  return response.json();
}

export function useActivity(project?: string) {
  return useQuery({
    queryKey: ['activity', project],
    queryFn: () => fetchActivity(project),
    staleTime: 5 * 60 * 1000,
  });
}

// Memory quality data
export interface QualityData {
  neverAccessed: { count: number; items: Array<Record<string, unknown>> };
  stale: { count: number; items: Array<Record<string, unknown>> };
  duplicates: { count: number; items: Array<Record<string, unknown>> };
}

async function fetchQuality(project?: string): Promise<QualityData> {
  const params = project ? `?project=${project}` : '';
  const response = await fetch(`${API_BASE}/api/memories/quality${params}`);
  if (!response.ok) throw new Error('Failed to fetch quality');
  return response.json();
}

export function useQuality(project?: string) {
  return useQuery({
    queryKey: ['quality', project],
    queryFn: () => fetchQuality(project),
    staleTime: 5 * 60 * 1000,
  });
}

// Contradictions data
export interface Contradiction {
  memoryAId: number;
  memoryATitle: string;
  memoryBId: number;
  memoryBTitle: string;
  score: number;
  reason: string;
  sharedTopics: string[];
}

async function fetchContradictions(project?: string): Promise<{ contradictions: Contradiction[]; count: number }> {
  const params = project ? `?project=${project}` : '';
  const response = await fetch(`${API_BASE}/api/contradictions${params}`);
  if (!response.ok) throw new Error('Failed to fetch contradictions');
  return response.json();
}

export function useContradictions(project?: string) {
  return useQuery({
    queryKey: ['contradictions', project],
    queryFn: () => fetchContradictions(project),
    staleTime: 5 * 60 * 1000,
  });
}
