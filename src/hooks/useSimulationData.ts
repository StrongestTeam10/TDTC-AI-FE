import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDashboardSnapshot, fetchMarkets, fetchZones } from '../api/client';
import { useSimulationStore } from '../store/simulationStore';
import { toDisplayErrorMessage } from '../utils/errorMessage';

// 2026-07-24: BE /dashboard/snapshot이 marketId를 필수로 받도록 바뀌면서
// 시장 목록이 로드되어 marketId를 알 수 있을 때까지 스냅샷 조회를 미룸.
//
// 2026-07-24 (2차): 지금까지 로드 실패 시 console.error만 찍고 화면엔 아무 표시가
// 없어서 "왜 아무것도 안 보이지?"를 사용자가 알 수 없었음. loadError를 반환해서
// DashboardPage가 오류 배너를 보여줄 수 있게 함.
//
// 2026-07-26: "실시간 관제"라는 이름과 달리 지금까지는 최초 진입/수동 새로고침
// 시에만 조회됐음(자동 갱신 없음). capturedAt이 없는 "최신" 모드에 한해 일정
// 주기로 자동 재조회하는 폴링을 추가함. 특정 과거 시점을 선택한 경우는 고정된
// 스냅샷을 보는 것이므로 폴링하지 않음.
const DASHBOARD_POLL_INTERVAL_MS = 2_000;

// 2026-07-27 추가: 시장/구역별 권한 분리(관리자는 시장 전환 가능, 그 외는 본인 담당
// 시장 하나만 조회됨 - BE가 /markets 응답 자체를 이미 필터링해서 내려줌). 관리자가
// 상단 탭으로 다른 시장을 선택하면 DashboardPage가 marketIdOverride로 넘겨준다.
// 넘기지 않으면(비관리자, 혹은 관리자가 아직 아무 탭도 선택하지 않은 최초 진입 시)
// 로드된 시장 목록의 첫 번째 시장을 기본값으로 사용한다.
export function useSimulationData(capturedAt?: string, marketIdOverride?: number) {
  const {
    markets,
    setMarkets,
    zones,
    setZones,
    dashboardSnapshot,
    setDashboardSnapshot,
    isDashboardLoading,
    setDashboardLoading,
  } = useSimulationStore();

  const [loadError, setLoadError] = useState<string | null>(null);
  // 폴링 도중 이전 요청이 아직 안 끝났으면 겹쳐서 호출하지 않기 위한 가드
  // (네트워크가 느려서 응답이 폴링 주기보다 오래 걸리는 경우 대비)
  const isFetchingRef = useRef(false);

  // 2026-07-27: 기존엔 시장 목록을 불러온 직후 그 안에서 바로 markets[0]의 구역까지
  // 함께 불러왔는데(단일 시장 가정), 관리자가 시장을 전환하면 그때마다 새로 선택된
  // 시장의 구역을 다시 불러와야 해서 "시장 목록 로드"와 "구역 로드"를 분리했다.
  const loadMarkets = useCallback(async () => {
    if (markets.length > 0) return;
    try {
      const marketData = await fetchMarkets();
      setMarkets(marketData);
    } catch (err) {
      console.error('시장 정보 로드 실패', err);
      setLoadError(toDisplayErrorMessage(err, '시장 정보를 불러오지 못했습니다.'));
    }
  }, [markets.length, setMarkets]);

  const marketId = marketIdOverride ?? markets[0]?.marketId;

  useEffect(() => {
    loadMarkets();
  }, [loadMarkets]);

  useEffect(() => {
    if (!marketId) return;
    fetchZones(marketId)
        .then(setZones)
        .catch((err) => {
          console.error('구역 정보 로드 실패', err);
          setLoadError(toDisplayErrorMessage(err, '구역 정보를 불러오지 못했습니다.'));
        });
  }, [marketId, setZones]);

  const loadSnapshot = useCallback(async () => {
    if (!marketId) return;
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setDashboardLoading(true);
    setLoadError(null);
    try {
      const snapshot = await fetchDashboardSnapshot(marketId, { capturedAt });
      setDashboardSnapshot(snapshot);
    } catch (err) {
      console.error('스냅샷 로드 실패', err);
      setLoadError(toDisplayErrorMessage(err, '관제 데이터를 불러오지 못했습니다.'));
    } finally {
      setDashboardLoading(false);
      isFetchingRef.current = false;
    }
  }, [marketId, capturedAt, setDashboardSnapshot, setDashboardLoading]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  // "최신(실시간)" 모드(capturedAt 없음)일 때만 일정 주기로 자동 재조회한다.
  // 브라우저 탭이 백그라운드로 가면(document.hidden) 불필요한 API 호출을 막기 위해
  // 폴링을 멈추고, 다시 탭을 보면 즉시 한 번 갱신한 뒤 폴링을 재개한다.
  const isPolling = Boolean(marketId) && !capturedAt;

  useEffect(() => {
    if (!isPolling) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(loadSnapshot, DASHBOARD_POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        loadSnapshot();
        start();
      }
    };

    start();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPolling, loadSnapshot]);

  return {
    markets,
    zones,
    dashboardSnapshot,
    isDashboardLoading,
    loadError,
    isPolling,
    refetch: loadSnapshot,
  };
}
