import { useState } from 'react';
import { analyzePolicy } from '../api/client';
import Spinner from './ui/Spinner';
import type { PolicyAnalysisResult } from '../api/client';
import type { Gate, Zone } from '../types';
import { isAxiosError } from 'axios';

/**
 * LLM objectsToRemove 항목 하나에 대한 제거 결과.
 * 부모(SimulationComparePage)가 beforeObjects와 매칭한 뒤 채워서 넘게준다.
 */
export type ObjectRemovalResult = {
  objectType: string;
  zoneId: number;
  action: string;
  zoneName: string;        // zones에서 조회해서 담아옵
  status: 'removed' | 'compliant'; // '철거 완료' | '현장 준수 처리'
};

interface PolicyAnalysisPanelProps {
  onAnalyzeSuccess: (result: PolicyAnalysisResult) => void;
  /** LLM 분석 완료 후 "수동으로 편집" 버튼을 누를 때 호출 */
  onSwitchToManual?: () => void;
  /** "다시 분석" 버튼으로 초기화할 때 호출 (설정값 리셋) */
  onReset?: () => void;
  /** true이면 분석 완료 결과 요약 화면 표시, false이면 입력 폼 표시 */
  isLlmMode?: boolean;
  /**
   * objectsToRemove 각 항목의 처리 결과.
   * 부모가 beforeObjects와 비교해서 계산 후 넘겨준다.
   * - 'removed'  : Before에 해당 오브젝트가 있었고 제거됨 → "철거 완료" 배지
   * - 'compliant': Before에 없었음 (이미 준수) → "현장 준수 처리" 배지
   * 미전달 시 모두 'compliant'로 폴백.
   */
  objectRemovalResults?: ObjectRemovalResult[];
  /**
   * 2026-08-12 추가 (UIUX 피드백 p01)
   * LLM이 돌려주는 것은 zoneId/facilityId 같은 번호뿐이라, 요약이 "Zone 1 ↔ Zone 3",
   * "게이트 폐쇄: 2, 5번"처럼 사람이 못 읽는 형태로 나왔다("북/중앙/남측으로 명시" 지적).
   * 화면에 이미 있는 구역·게이트 목록을 넘겨받아 번호를 이름으로 바꿔 보여준다.
   * 없거나 못 찾은 번호는 예전처럼 번호 그대로 둔다(지워진 구역을 가리키는 옛 결과 대비).
   */
  zones?: Zone[];
  gates?: Gate[];
}

const ACTION_LABEL: Record<string, string> = {
  close: '폐쇄',
  open: '개방',
  one_way: '일방통행',
};

export default function PolicyAnalysisPanel({
  onAnalyzeSuccess,
  onSwitchToManual,
  onReset,
  isLlmMode = false,
  objectRemovalResults,
  zones = [],
  gates = [],
}: PolicyAnalysisPanelProps) {
  const zoneLabel = (zoneId: number) =>
    zones.find((z) => z.zoneId === zoneId)?.zoneName ?? `구역 ${zoneId}`;
  const gateLabel = (facilityId: number) =>
    gates.find((g) => g.facilityId === facilityId)?.name ?? `${facilityId}번`;
  const [policyText, setPolicyText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 마지막 분석 성공 결과 (LLM 모드 요약 표시용) */
  const [lastResult, setLastResult] = useState<PolicyAnalysisResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (selected.size > 10 * 1024 * 1024) {
        setError('파일 크기는 10MB를 초과할 수 없습니다. (OOM 방지)');
        e.target.value = '';
        setFile(null);
        return;
      }
      setFile(selected);
      setError(null);
    }
  };

  const handleAnalyze = async () => {
    if (!policyText.trim() && !file) {
      setError('공문 텍스트를 입력하거나 문서를 첨부해주세요.');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await analyzePolicy(policyText, file);
      setLastResult(result);
      onAnalyzeSuccess(result);
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.detail ?? '공문 분석 중 오류가 발생했습니다.' : '공문 분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  /** 다시 분석: 결과·입력 초기화 후 입력 폼으로 복귀 */
  const handleReanalyze = () => {
    setLastResult(null);
    setPolicyText('');
    setFile(null);
    setError(null);
    onReset?.();
  };

  /* ─────────────────────────────────────────────────
     LLM 모드: 분석 완료 결과 요약
  ───────────────────────────────────────────────── */
  if (isLlmMode && lastResult) {
    const { objectsToRemove = [], corridorPolicies = [], closedGateIds = [], agentCount } = lastResult;
    const hasAny = objectsToRemove.length > 0 || corridorPolicies.length > 0 || closedGateIds.length > 0 || agentCount;

    return (
      <div className="rounded-lg border border-blue-700 bg-blue-950/40 p-4 space-y-3">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-blue-300 flex items-center gap-2">
            <span>✨</span> LLM 정책 자동 세팅 완료
          </h3>
          <span className="text-[10px] bg-blue-800/60 text-blue-300 px-2 py-0.5 rounded-full font-medium tracking-wide">
            POLICY MODE
          </span>
        </div>

        {/* 추출된 항목 목록 */}
        <div className="rounded-md bg-slate-900/60 p-3 space-y-2">
          {!hasAny && (
            <p className="text-xs text-slate-400">추출된 정책 항목이 없습니다.</p>
          )}

          {/* 오브젝트 제거 정책: 항목별로 철거됨/현장 준수 구분 */}
          {(() => {
            // objectRemovalResults(부모 계산값) 우선 사용, 없으면 모두 compliant로 폴백
            const items: ObjectRemovalResult[] = objectRemovalResults && objectRemovalResults.length > 0
              ? objectRemovalResults
              : objectsToRemove.map(o => ({
                  ...o,
                  zoneName: `Zone ${o.zoneId}`,
                  status: 'compliant' as const,
                }));

            const OBJ_LABEL: Record<string, string> = {
              obstacle: '장애물/적재물',
              food_truck: '푸드트럭',
              event_zone: '행사존',
              rest_area: '휴게공간',
            };

            if (items.length === 0) return null;
            return (
              <div className="space-y-1.5">
                {items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span
                      className={`mt-0.5 shrink-0 ${
                        item.status === 'removed' ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      ✓
                    </span>
                    <span className="text-slate-300">
                      {OBJ_LABEL[item.objectType] ?? item.objectType}{' '}
                      <span className="text-slate-500">({item.zoneName})</span>
                      {item.status === 'removed' ? (
                        <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] bg-emerald-900/50 text-emerald-300 font-medium">
                          철거 완료
                        </span>
                      ) : (
                        <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] bg-slate-700/60 text-slate-300 font-medium">
                          현장 준수 처리
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* 통로 정책 */}
          {corridorPolicies.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
              <span className="text-blue-400 mt-0.5 shrink-0">→</span>
              <span>
                통로 정책:{' '}
                <span className="text-blue-300">{zoneLabel(c.fromZoneId)} ↔ {zoneLabel(c.toZoneId)}</span>
                {' '}
                <span className="text-slate-400">{ACTION_LABEL[c.action] ?? c.action}</span>
                {c.action === 'one_way' && c.allowedDirection && (
                  <span className="text-slate-500 ml-1">
                    ({c.allowedDirection === 'from_to' ? '출발→도착' : '도착→출발'})
                  </span>
                )}
              </span>
            </div>
          ))}

          {/* 게이트 폐쇄 */}
          {closedGateIds.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-slate-300">
              <span className="text-orange-400 mt-0.5 shrink-0">✗</span>
              <span>
                게이트 폐쇄:{' '}
                <span className="text-orange-300">{closedGateIds.map(gateLabel).join(', ')}</span>
              </span>
            </div>
          )}

          {/* 수용 인원 제한 */}
          {agentCount && (
            <div className="flex items-start gap-2 text-xs text-slate-300">
              <span className="text-yellow-400 mt-0.5 shrink-0">⚑</span>
              <span>
                수용 인원 제한:{' '}
                <span className="text-yellow-300 font-medium">{agentCount.toLocaleString()}명</span>
              </span>
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          아래 시나리오 설정이 잠겨 있습니다.
          직접 조작하려면{' '}
          <span className="font-medium text-slate-200">"수동으로 편집"</span>을 누르세요.
        </p>

        {/* 액션 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={handleReanalyze}
            className="flex-1 py-1.5 text-xs border border-slate-600 text-slate-400 rounded hover:border-slate-400 hover:text-slate-200 transition-colors"
          >
            다시 분석
          </button>
          <button
            onClick={() => onSwitchToManual?.()}
            className="flex-1 rounded border border-slate-500 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-300 hover:bg-slate-700/40"
          >
            수동으로 편집
          </button>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────
     기본 모드: 공문 입력 폼
  ───────────────────────────────────────────────── */
  return (
    <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <h3 className="text-md font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
        <span className="text-blue-500">✨</span> 공문 AI 자동 세팅
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        정부 공문 텍스트를 입력하면 LLM이 분석하여 시나리오 환경을 자동으로 설정합니다.
      </p>

      <textarea
        className="w-full h-24 p-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="공문 텍스트를 이곳에 붙여넣으세요..."
        value={policyText}
        onChange={(e) => setPolicyText(e.target.value)}
        disabled={isAnalyzing}
      />

      <div className="mt-2">
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
          첨부파일 (선택) — 최대 10MB
        </label>
        <input
          type="file"
          accept=".pdf,.docx,.png,.jpg,.jpeg"
          onChange={handleFileChange}
          disabled={isAnalyzing}
          className="block w-full text-xs text-slate-500 file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-slate-700 dark:file:text-slate-200 dark:hover:file:bg-slate-600"
        />
        {file && (
          <p className="mt-1 text-xs text-green-600 dark:text-green-400">
            ✅ {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
          </p>
        )}
      </div>

      {error && <div className="mt-2 text-xs text-red-500">{error}</div>}

      <button
        onClick={handleAnalyze}
        disabled={(!policyText.trim() && !file) || isAnalyzing}
        className="mt-3 w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white text-sm font-medium rounded transition-colors flex justify-center items-center h-9"
      >
        {isAnalyzing ? <Spinner /> : 'AI 분석 및 자동 세팅'}
      </button>
    </div>
  );
}
