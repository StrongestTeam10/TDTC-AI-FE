import { useState } from 'react';
import { analyzePolicy } from '../api/client';
import Spinner from './ui/Spinner';
import type { PolicyAnalysisResult } from '../api/client';

interface PolicyAnalysisPanelProps {
  onAnalyzeSuccess: (result: PolicyAnalysisResult) => void;
}

export default function PolicyAnalysisPanel({ onAnalyzeSuccess }: PolicyAnalysisPanelProps) {
  const [policyText, setPolicyText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<React.ReactNode | null>(null);

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
    setSuccessMessage(null);
    try {
      const result = await analyzePolicy(policyText, file);
      
      const summary = (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded text-xs text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300">
          <p className="font-semibold mb-1">✅ 분석 완료 {file ? `(파일: ${file.name})` : '(텍스트 직접 입력)'}</p>
          <ul className="list-disc pl-4 space-y-1">
            {result.agentCount ? <li>수용 인원: {result.agentCount}명으로 자동 설정</li> : null}
            {result.objectsToRemove?.length > 0 ? <li>철거 대상: {result.objectsToRemove.length}건 감지</li> : null}
            {result.corridorPolicies?.length > 0 ? <li>통로 통제: {result.corridorPolicies.length}건 감지</li> : null}
            {result.closedGateIds?.length > 0 ? <li>폐쇄 게이트: {result.closedGateIds.join(', ')}번</li> : null}
            {!result.agentCount && !result.objectsToRemove?.length && !result.corridorPolicies?.length && !result.closedGateIds?.length && (
              <li>특이 사항(변경점) 없음</li>
            )}
          </ul>
        </div>
      );
      
      setSuccessMessage(summary);
      onAnalyzeSuccess(result);
      setPolicyText('');
      setFile(null);
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
      
      <div className="mt-2">
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
          첨부파일 (선택) - 최대 10MB
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
      
      {successMessage}
      
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
