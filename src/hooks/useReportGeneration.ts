import { useCallback, useState } from 'react';
import {
  generateReport,
  fetchReportDownloadUrl,
  type ReportGenerateRequest,
  type ReportGenerateResponse,
} from '../api/client';
import { toDisplayErrorMessage } from '../utils/errorMessage';

// 2026-08-06 추가
// 보고서 생성/다운로드를 두 화면(비교 시뮬레이션, 시나리오 이력)에서 쓰기 때문에
// 진행 상태와 오류 처리를 여기 모았다. 생성은 1~3분 걸리는 작업이라 "어느 시나리오가
// 지금 만들어지고 있는지"를 화면이 알아야 버튼을 잠글 수 있다.

/**
 * 받은 presigned URL로 다운로드를 시작한다.
 *
 * BE가 responseContentDisposition을 attachment로 넣어 서명하므로 이동해도 화면이
 * 바뀌지 않고 파일만 내려온다. 새 탭(_blank)을 쓰지 않는 이유는 팝업 차단에 막히기
 * 때문이고, location 대입 대신 앵커를 쓰는 이유는 일부 브라우저가 location 이동을
 * 페이지 이탈로 보고 진행 중인 XHR을 끊기 때문이다.
 */
function startDownload(url: string) {
  const link = document.createElement('a');
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function useReportGeneration() {
  // 지금 보고서를 만들고 있는 시나리오 번호. 목록에서 행별로 버튼을 잠그는 데 쓴다.
  const [generatingScenarioId, setGeneratingScenarioId] = useState<number | null>(null);
  // 다운로드 주소를 재발급받는 중인 시나리오 번호(생성과 달리 몇 초면 끝난다).
  const [downloadingScenarioId, setDownloadingScenarioId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<ReportGenerateResponse | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * 보고서를 만든다. 성공하면 응답을, 실패하면 null을 돌려준다(오류 문구는 error에 담긴다).
   *
   * 두 건이 동시에 돌지 않도록 막는다. BE는 같은 시나리오의 동시 생성을 409로 거절하고
   * 늦은 쪽이 올린 파일을 되돌리므로(ReportService.abandonReport) 어차피 한 건은 헛일이 된다.
   */
  const generate = useCallback(
      async (request: ReportGenerateRequest): Promise<ReportGenerateResponse | null> => {
        if (generatingScenarioId !== null) return null;
        setGeneratingScenarioId(request.scenarioId);
        setError(null);
        try {
          const response = await generateReport(request);
          setLastReport(response);
          // 생성 직후의 URL은 바로 유효하므로 재발급 없이 그대로 내려받는다.
          startDownload(response.downloadUrl);
          return response;
        } catch (err) {
          console.error('보고서 생성 실패', err);
          setError(toDisplayErrorMessage(err, '보고서 생성에 실패했습니다.'));
          return null;
        } finally {
          setGeneratingScenarioId(null);
        }
      },
      [generatingScenarioId],
  );

  /**
   * 이미 만들어 둔 보고서를 내려받는다. 주소만 새로 발급받으므로 보고서를 다시 만들지 않는다
   * (presigned URL은 수명이 짧아 DB에 담아둘 수 없어 BE가 S3 키만 저장한다).
   */
  const download = useCallback(async (scenarioId: number): Promise<boolean> => {
    setDownloadingScenarioId(scenarioId);
    setError(null);
    try {
      const { downloadUrl } = await fetchReportDownloadUrl(scenarioId);
      startDownload(downloadUrl);
      return true;
    } catch (err) {
      console.error('보고서 다운로드 실패', err);
      setError(toDisplayErrorMessage(err, '보고서를 내려받지 못했습니다.'));
      return false;
    } finally {
      setDownloadingScenarioId(null);
    }
  }, []);

  return {
    generate,
    download,
    generatingScenarioId,
    downloadingScenarioId,
    isGenerating: generatingScenarioId !== null,
    error,
    clearError,
    lastReport,
  };
}
