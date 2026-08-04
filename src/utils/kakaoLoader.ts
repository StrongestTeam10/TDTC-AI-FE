// 2026-08-04 추가 (시설 관리 화면)
//
// 기존엔 KakaoMapView.tsx 안에 이 로더가 있었는데, 시설 위치 등록 화면도 실제
// 카카오맵이 필요해서 중복 없이 공용 유틸로 분리함. SDK는 한 번만 로드되면 되므로
// 모듈 스코프 캐시(kakaoLoaderPromise)를 그대로 유지 - 두 화면이 각자 로드를
// 시도해도 실제 <script> 태그는 한 번만 추가됨.

declare global {
  interface Window {
    kakao: any;
  }
}

const KAKAO_APP_KEY = import.meta.env.VITE_KAKAO_JS_KEY;

let kakaoLoaderPromise: Promise<void> | null = null;

export function loadKakaoSdk(): Promise<void> {
  if (window.kakao?.maps) {
    return Promise.resolve();
  }
  if (kakaoLoaderPromise) {
    return kakaoLoaderPromise;
  }
  if (!KAKAO_APP_KEY) {
    return Promise.reject(new Error('VITE_KAKAO_JS_KEY 환경변수가 설정되지 않았습니다.'));
  }
  kakaoLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('kakao-map-sdk');
    if (existing) {
      existing.addEventListener('load', () => window.kakao.maps.load(() => resolve()));
      existing.addEventListener('error', () => reject(new Error('카카오맵 SDK 로드 실패')));
      return;
    }
    const script = document.createElement('script');
    script.id = 'kakao-map-sdk';
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_APP_KEY}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error('카카오맵 SDK 로드 실패'));
    document.head.appendChild(script);
  });
  return kakaoLoaderPromise;
}
