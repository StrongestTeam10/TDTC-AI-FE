import type { AgentState, Zone } from '../types';

interface HeatmapViewProps {
    zones: Zone[];
    agents: AgentState[];
    width?: number;
    height?: number;
}

export default function HeatmapView({
                                        zones,
                                        agents,
                                        width = 640,
                                        height = 480,
                                    }: HeatmapViewProps) {
    // 실제 서비스에서는 D3.js나 Canvas를 활용해 구역(Polygon)과 에이전트를 매핑합니다.
    return (
        <div
            className="relative rounded-lg border border-slate-700 bg-slate-900 overflow-hidden flex items-center justify-center"
            style={{ width: width, minHeight: height }}
        >
            <div className="absolute top-4 left-4 text-xs text-slate-400">
                로드된 구역: {zones.length}개 / 유동 인구: {agents.length}명
            </div>
            <div className="text-slate-600">
                [2D 캔버스 / 맵 렌더링 영역]
            </div>
        </div>
    );
}