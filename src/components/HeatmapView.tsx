import type { AgentState, SpatialNode } from '../types';

interface HeatmapViewProps {
  layout: SpatialNode[];
  agents: AgentState[];
  width?: number;
  height?: number;
}

const STATE_COLOR: Record<AgentState['state'], string> = {
  normal: '#3b82f6',
  congested: '#f59e0b',
  evacuating: '#ef4444',
};

/**
 * 시장 레이아웃 위에 에이전트 위치를 점으로 표시하는 2D 뷰.
 * 실제 스케일 변환은 layout 좌표 범위에 맞춰 조정 필요.
 */
export default function HeatmapView({
  layout,
  agents,
  width = 640,
  height = 480,
}: HeatmapViewProps) {
  const xs = layout.map((n) => n.xCoord);
  const ys = layout.map((n) => n.yCoord);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);

  const scaleX = (x: number) =>
    ((x - minX) / (maxX - minX || 1)) * (width - 40) + 20;
  const scaleY = (y: number) =>
    ((y - minY) / (maxY - minY || 1)) * (height - 40) + 20;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
      <svg width={width} height={height} className="w-full h-auto">
        {/* 통로/점포 구조 (정적) */}
        {layout.map((node) =>
          node.connectedNodes.map((targetId) => {
            const target = layout.find((n) => n.nodeId === targetId);
            if (!target) return null;
            return (
              <line
                key={`${node.nodeId}-${targetId}`}
                x1={scaleX(node.xCoord)}
                y1={scaleY(node.yCoord)}
                x2={scaleX(target.xCoord)}
                y2={scaleY(target.yCoord)}
                stroke="#334155"
                strokeWidth={2}
              />
            );
          })
        )}

        {/* 노드 (점포/입구) */}
        {layout.map((node) => (
          <circle
            key={node.nodeId}
            cx={scaleX(node.xCoord)}
            cy={scaleY(node.yCoord)}
            r={4}
            fill="#475569"
          />
        ))}

        {/* 에이전트 (동적) */}
        {agents.map((agent) => (
          <circle
            key={agent.agentId}
            cx={scaleX(agent.x)}
            cy={scaleY(agent.y)}
            r={5}
            fill={STATE_COLOR[agent.state]}
            opacity={0.85}
          />
        ))}
      </svg>

      <div className="mt-3 flex gap-4 text-xs text-slate-400">
        {Object.entries(STATE_COLOR).map(([state, color]) => (
          <span key={state} className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {state}
          </span>
        ))}
      </div>
    </div>
  );
}
