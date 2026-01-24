'use client';

/**
 * Memory Detail
 * Shows detailed information about a selected memory
 * including related memories and decay visualization
 */

import { useMemo } from 'react';
import { Memory, MemoryLink } from '@/types/memory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getCategoryColor, getTypeColor } from '@/lib/category-colors';
import { calculateDecayFactor } from '@/lib/position-algorithm';

interface MemoryDetailProps {
  memory: Memory;
  links?: MemoryLink[];
  memories?: Memory[];
  onClose: () => void;
  onReinforce?: (id: number) => void;
  onSelectMemory?: (id: number) => void;
}

// Relationship styling
const RELATIONSHIP_STYLES: Record<string, { color: string; label: string; icon: string }> = {
  references: { color: '#60a5fa', label: 'References', icon: '→' },
  extends: { color: '#34d399', label: 'Extends', icon: '⊃' },
  contradicts: { color: '#f87171', label: 'Contradicts', icon: '⊗' },
  related: { color: '#a78bfa', label: 'Related', icon: '~' },
};

// Get health status based on decay
function getHealthStatus(decayFactor: number): { label: string; color: string; bgColor: string } {
  if (decayFactor > 0.7) {
    return { label: 'Healthy', color: '#22C55E', bgColor: 'rgba(34, 197, 94, 0.15)' };
  }
  if (decayFactor > 0.4) {
    return { label: 'Fading', color: '#EAB308', bgColor: 'rgba(234, 179, 8, 0.15)' };
  }
  return { label: 'Critical', color: '#EF4444', bgColor: 'rgba(239, 68, 68, 0.15)' };
}

export function MemoryDetail({
  memory,
  links = [],
  memories = [],
  onClose,
  onReinforce,
  onSelectMemory,
}: MemoryDetailProps) {
  const decayFactor = calculateDecayFactor(memory);
  const categoryColor = getCategoryColor(memory.category);
  const typeColor = getTypeColor(memory.type);
  const healthStatus = getHealthStatus(decayFactor);

  // Find related memories through links
  const relatedMemories = useMemo(() => {
    const related: Array<{
      memory: Memory;
      relationship: string;
      strength: number;
      direction: 'from' | 'to';
    }> = [];

    for (const link of links) {
      if (link.source_id === memory.id) {
        const target = memories.find(m => m.id === link.target_id);
        if (target) {
          related.push({
            memory: target,
            relationship: link.relationship,
            strength: link.strength,
            direction: 'to',
          });
        }
      } else if (link.target_id === memory.id) {
        const source = memories.find(m => m.id === link.source_id);
        if (source) {
          related.push({
            memory: source,
            relationship: link.relationship,
            strength: link.strength,
            direction: 'from',
          });
        }
      }
    }

    // Sort by strength
    return related.sort((a, b) => b.strength - a.strength);
  }, [memory.id, links, memories]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const timeSince = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const hours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  };

  return (
    <Card className="bg-slate-900 border-slate-700 h-full overflow-auto">
      <CardHeader className="border-b border-slate-700 pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg font-semibold text-white leading-tight">
            {memory.title}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-slate-400 hover:text-white -mt-1"
          >
            ✕
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{
              backgroundColor: categoryColor + '20',
              color: categoryColor,
            }}
          >
            {memory.category}
          </span>
          <span
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{
              backgroundColor: typeColor + '20',
              color: typeColor,
            }}
          >
            {memory.type.replace('_', '-')}
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Content */}
        <div>
          <h4 className="text-xs font-medium text-slate-400 mb-1">Content</h4>
          <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
            {memory.content}
          </p>
        </div>

        {/* Health Status Banner */}
        <div
          className="rounded-lg p-3 flex items-center gap-3"
          style={{ backgroundColor: healthStatus.bgColor }}
        >
          <div
            className="w-3 h-3 rounded-full animate-pulse"
            style={{ backgroundColor: healthStatus.color }}
          />
          <div>
            <div className="text-sm font-medium" style={{ color: healthStatus.color }}>
              {healthStatus.label}
            </div>
            <div className="text-xs text-slate-400">
              {decayFactor > 0.7
                ? 'Memory is strong and stable'
                : decayFactor > 0.4
                ? 'Memory is fading - reinforce to preserve'
                : 'Memory at risk of deletion - reinforce now'}
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="text-xs text-slate-400">Salience</div>
            <div className="text-lg font-bold text-white">
              {(memory.salience * 100).toFixed(0)}%
            </div>
            <div className="mt-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full transition-all"
                style={{ width: `${memory.salience * 100}%` }}
              />
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-3">
            <div className="text-xs text-slate-400">Decay Factor</div>
            <div className="text-lg font-bold text-white">
              {(decayFactor * 100).toFixed(0)}%
            </div>
            <div className="mt-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${decayFactor * 100}%`,
                  backgroundColor: healthStatus.color,
                }}
              />
            </div>
          </div>
        </div>

        {/* Access info */}
        <div className="bg-slate-800 rounded-lg p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">Access Count</span>
            <span className="text-sm font-medium text-white">
              {memory.accessCount} times
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">Last Accessed</span>
            <span className="text-sm text-white">
              {timeSince(memory.lastAccessed)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">Created</span>
            <span className="text-sm text-white">
              {formatDate(memory.createdAt)}
            </span>
          </div>
        </div>

        {/* Related Memories */}
        {relatedMemories.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-2">
              <span className="inline-block w-4 h-4">🔗</span>
              Related Memories ({relatedMemories.length})
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {relatedMemories.map(({ memory: related, relationship, strength, direction }) => {
                const style = RELATIONSHIP_STYLES[relationship] || RELATIONSHIP_STYLES.related;
                const relatedCategoryColor = getCategoryColor(related.category);

                return (
                  <button
                    key={related.id}
                    onClick={() => onSelectMemory?.(related.id)}
                    className="w-full text-left p-2 bg-slate-800 hover:bg-slate-750 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: style.color }}
                      />
                      <span
                        className="text-[10px] font-medium"
                        style={{ color: style.color }}
                      >
                        {direction === 'to' ? `${style.icon} ${style.label}` : `${style.label} ${style.icon}`}
                      </span>
                      <span className="text-[10px] text-slate-500 ml-auto">
                        {(strength * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="text-sm text-white truncate group-hover:text-blue-400 transition-colors">
                      {related.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px]"
                        style={{
                          backgroundColor: relatedCategoryColor + '20',
                          color: relatedCategoryColor,
                        }}
                      >
                        {related.category}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {(related.salience * 100).toFixed(0)}% salience
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tags */}
        {memory.tags && memory.tags.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-2">Tags</h4>
            <div className="flex flex-wrap gap-1">
              {memory.tags.map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {onReinforce && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onReinforce(memory.id)}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              ⚡ Reinforce Memory
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
