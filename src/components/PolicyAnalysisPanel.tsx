import { useState } from 'react';
import { analyzePolicy } from '../api/client';
import Spinner from './ui/Spinner';
import type { PolicyAnalysisResult } from '../api/client';

interface PolicyAnalysisPanelProps {
  onAnalyzeSuccess: (result: PolicyAnalysisResult) => void;
}

export default function PolicyAnalysisPanel({ onAnalyzeSuccess }: PolicyAnalysisPanelProps) {
  const [policyText, setPolicyText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!policyText.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await analyzePolicy(policyText);
      onAnalyzeSuccess(result);
      setPolicyText('');
    } catch (err: any) {
      setError(err?.response?.data?.detail || '공문 분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

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
      
      {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
      
      <button
        onClick={handleAnalyze}
        disabled={!policyText.trim() || isAnalyzing}
        className="mt-3 w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white text-sm font-medium rounded transition-colors flex justify-center items-center h-9"
      >
        {isAnalyzing ? <Spinner /> : 'AI 분석 및 자동 세팅'}
      </button>
    </div>
  );
}
