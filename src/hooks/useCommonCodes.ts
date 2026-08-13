import { useCallback, useEffect, useState } from 'react';
import { fetchCommonCodes } from '../api/client';
import { CATEGORY_CODE_OPTIONS } from '../constants/categoryCode';
import { MARKET_CODE_OPTIONS } from '../constants/marketCode';
import { ORG_CODE_OPTIONS } from '../constants/orgCode';
import { ROLE_LABELS } from '../types/auth';

// 2026-08-12 추가 (UIUX 피드백 "코드값은 무조건 공통코드 테이블에서, 하드코딩 하지 말 것")
//
// 지금까지 공통코드를 쓰는 화면마다 같은 코드를 복사해 두고 있었다.
//   useState(로컬 상수) -> useRef 가드(StrictMode 이중 호출 방지) -> useEffect에서
//   fetchCommonCodes -> 성공하면 교체, 실패하면 로컬 상수 유지
// 이게 게시판 목록/상세/작성, 회원가입, 비밀번호 찾기, 회원관리까지 여섯 군데에
// 흩어져 있었고, 그러면서도 정작 두 도메인은 API를 아예 부르지 않았다.
//   - POL(정책 유형): ScenarioHistoryPage가 코드→이름 표를 파일 안에 직접 갖고 있어,
//     DB에 코드가 추가되면 화면에는 'POLXX' 같은 원본 코드가 그대로 노출됐다.
//   - ROL(권한): types/auth.ts의 ROLE_LABELS를 그대로 화면에 뿌리고 있었다.
//
// 이 훅 하나로 모은다. 도메인별로 모듈 수준에 캐시를 둬서
//   (1) 같은 도메인을 여러 화면이 써도 요청은 앱 전체에서 한 번만 나가고
//   (2) 같은 화면이 두 번 마운트돼도(StrictMode) 중복 호출이 없어
//   화면마다 있던 useRef 가드가 필요 없어진다.
//
// 로컬 상수는 "값의 출처"가 아니라 네트워크 실패용 폴백으로만 남긴다. BE가 잠깐
// 죽었다고 소속기관 셀렉트가 텅 비면 회원가입 자체가 막히기 때문이다. 폴백을 쓴
// 경우는 캐시에 넣지 않아서, 다음 화면에서 다시 시도한다.

export type CommonCodeDomain = 'ROL' | 'ORG' | 'LVL' | 'POL' | 'MKT' | 'BCT';

/** 화면에서 쓰는 형태. BE 응답의 codeName을 name으로 옮겨 담는다. */
export interface CodeOption {
  code: string;
  name: string;
}

/**
 * 네트워크 실패 시에만 쓰는 폴백. comcode-seed.sql과 같은 값으로 맞춰둔다.
 * 여기 없는 도메인(LVL)은 아직 화면에서 쓰지 않아 빈 배열이다.
 */
const FALLBACKS: Record<CommonCodeDomain, CodeOption[]> = {
  MKT: MARKET_CODE_OPTIONS,
  BCT: CATEGORY_CODE_OPTIONS,
  ORG: ORG_CODE_OPTIONS,
  ROL: (Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((code) => ({
    code,
    name: ROLE_LABELS[code],
  })),
  POL: [
    { code: 'POLNO', name: '없음' },
    { code: 'POLFR', name: '화재' },
    { code: 'POLAC', name: '음향이상' },
    { code: 'POLCB', name: '통로폐쇄' },
  ],
  LVL: [],
};

/** 도메인별로 한 번 받아온 값. 앱이 살아 있는 동안 유지한다(공통코드는 거의 안 바뀐다). */
const cache = new Map<CommonCodeDomain, CodeOption[]>();
/** 진행 중인 요청. 같은 도메인을 동시에 여러 화면이 요구해도 요청은 하나다. */
const inFlight = new Map<CommonCodeDomain, Promise<CodeOption[]>>();

function loadDomain(domain: CommonCodeDomain): Promise<CodeOption[]> {
  const cached = cache.get(domain);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(domain);
  if (pending) return pending;

  const request = fetchCommonCodes(domain)
      .then((codes) => {
        // 빈 배열이면 그 도메인이 아직 시드되지 않았다는 뜻이다. 빈 셀렉트를 캐시해
        // 두면 그 화면은 앱을 새로 뜨울 때까지 계속 비어 있게 되므로 폴백을 쓴다.
        if (codes.length === 0) return FALLBACKS[domain];
        const options = codes.map((c) => ({ code: c.code, name: c.codeName }));
        cache.set(domain, options);
        return options;
      })
      .catch((err) => {
        console.error(`공통코드(${domain}) 조회 실패, 로컬 폴백 사용`, err);
        return FALLBACKS[domain];
      })
      .finally(() => {
        inFlight.delete(domain);
      });

  inFlight.set(domain, request);
  return request;
}

export interface UseCommonCodesResult {
  options: CodeOption[];
  /** 코드값을 사람이 읽는 이름으로. 모르는 코드는 코드값을 그대로 돌려준다. */
  labelOf: (code: string | null | undefined) => string;
  isLoading: boolean;
}

/**
 * 공통코드 한 도메인을 읽는다.
 *
 * @example
 *   const { options, labelOf } = useCommonCodes('POL');
 *   labelOf(scenario.policyTypeCode)   // 'POLFR' -> '화재'
 */
export function useCommonCodes(domain: CommonCodeDomain): UseCommonCodesResult {
  // 이미 받아둔 도메인이면 첫 렌더부터 값이 있어 셀렉트가 비었다가 채워지지 않는다.
  const [options, setOptions] = useState<CodeOption[]>(() => cache.get(domain) ?? FALLBACKS[domain]);
  const [isLoading, setLoading] = useState(() => !cache.has(domain));

  useEffect(() => {
    const hit = cache.get(domain);
    if (hit) {
      setOptions(hit);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    loadDomain(domain).then((next) => {
      // 화면을 빠르게 오갈 때 이미 사라진 컴포넌트에 setState 하지 않는다.
      if (!alive) return;
      setOptions(next);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [domain]);

  const labelOf = useCallback(
      (code: string | null | undefined) => {
        if (!code) return '-';
        return options.find((o) => o.code === code)?.name ?? code;
      },
      [options],
  );

  return { options, labelOf, isLoading };
}
