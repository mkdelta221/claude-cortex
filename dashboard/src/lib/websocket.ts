/**
 * WebSocket client for real-time memory updates
 *
 * Connects to the visualization server's WebSocket endpoint
 * and dispatches events to React Query for cache invalidation.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws/events';

export type WebSocketEventType =
  | 'initial_state'
  | 'memory_created'
  | 'memory_accessed'
  | 'memory_updated'
  | 'memory_deleted'
  | 'consolidation_complete'
  | 'decay_tick'
  // Phase 4: Worker events
  | 'worker_light_tick'
  | 'worker_medium_tick'
  | 'link_discovered'
  | 'predictive_consolidation';

// Alias for backwards compatibility
export type MemoryEventType = WebSocketEventType;

interface WebSocketMessage {
  type: WebSocketEventType;
  data?: unknown;
}

interface UseMemoryWebSocketOptions {
  enabled?: boolean;
  onMessage?: (event: WebSocketMessage) => void;
}

// Reconnection configuration
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds max
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Hook to connect to memory WebSocket and handle real-time updates
 */
export function useMemoryWebSocket(options: UseMemoryWebSocketOptions = {}) {
  const { enabled = true, onMessage } = options;
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<{
    type: WebSocketEventType;
    data?: unknown;
    timestamp: string;
  } | null>(null);

  // Use ref for onMessage to avoid recreating connect callback when callback changes
  // This prevents WebSocket reconnections on every render
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    if (!enabled || wsRef.current?.readyState === WebSocket.OPEN) return;

    // Clear any pending reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        // Reset reconnect state on successful connection
        reconnectAttemptsRef.current = 0;
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
        console.log('[WebSocket] Connected to memory server');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage & { timestamp?: string };
          setLastEvent({
            type: message.type,
            data: message.data,
            timestamp: message.timestamp || new Date().toISOString(),
          });

          // Notify external handler (use ref to avoid stale closure)
          onMessageRef.current?.(message);

          // Invalidate relevant queries based on event type
          switch (message.type) {
            case 'initial_state':
              // Full state received, refresh everything
              queryClient.invalidateQueries({ queryKey: ['memories'] });
              queryClient.invalidateQueries({ queryKey: ['stats'] });
              queryClient.invalidateQueries({ queryKey: ['links'] });
              break;

            case 'memory_created':
            case 'memory_updated':
            case 'memory_deleted':
              // Memory changed, refresh memories list
              queryClient.invalidateQueries({ queryKey: ['memories'] });
              queryClient.invalidateQueries({ queryKey: ['stats'] });
              break;

            case 'consolidation_complete':
              // Major changes, refresh everything
              queryClient.invalidateQueries({ queryKey: ['memories'] });
              queryClient.invalidateQueries({ queryKey: ['stats'] });
              queryClient.invalidateQueries({ queryKey: ['links'] });
              break;

            case 'decay_tick':
              // Just decay scores updated, soft refresh
              // We don't invalidate here to avoid constant refetches
              // The dashboard can handle this via the onMessage callback
              break;

            // Phase 4: Worker events
            case 'link_discovered':
              // New link created, refresh links
              queryClient.invalidateQueries({ queryKey: ['links'] });
              break;

            case 'predictive_consolidation':
              // Predictive consolidation ran, refresh everything
              queryClient.invalidateQueries({ queryKey: ['memories'] });
              queryClient.invalidateQueries({ queryKey: ['stats'] });
              queryClient.invalidateQueries({ queryKey: ['links'] });
              break;

            case 'worker_light_tick':
            case 'worker_medium_tick':
              // Worker ticks don't require cache invalidation
              // Dashboard can track via onMessage callback if needed
              break;
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      ws.onerror = () => {
        // Use warn instead of error to avoid Next.js error overlay in dev mode
        // WebSocket connection failures are expected when API server isn't running
        console.warn('[WebSocket] Connection failed - is the API server running?');
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('[WebSocket] Disconnected');

        // Attempt to reconnect with exponential backoff
        if (enabled && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = reconnectDelayRef.current;
          reconnectAttemptsRef.current++;

          // Exponential backoff: double the delay each time, up to max
          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 2,
            MAX_RECONNECT_DELAY
          );

          console.log(
            `[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          console.error('[WebSocket] Max reconnection attempts reached. Use reconnect() to try again.');
        }
      };
    } catch (err) {
      console.error('[WebSocket] Failed to connect:', err);
    }
  }, [enabled, queryClient]); // onMessage accessed via ref to prevent reconnection loops

  // Connect on mount
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, connect]);

  // Manual reconnect that resets backoff state
  const manualReconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
    connect();
  }, [connect]);

  return {
    isConnected,
    lastEvent,
    reconnect: manualReconnect,
    reconnectAttempts: reconnectAttemptsRef.current,
  };
}
