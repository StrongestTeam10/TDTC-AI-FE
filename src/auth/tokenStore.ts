// 2026-07-24 추가
// api/client.ts(axios 인터셉터)와 store/authStore.ts(zustand, 로그인 상태) 양쪽에서
// 토큰에 접근해야 하는데, 서로를 직접 import하면 순환 참조가 생겨서 이 작은 중간
// 모듈을 둠. client.ts는 여기서 토큰을 "읽기"만 하고, authStore.ts가 로그인/로그아웃/
// 새로고침 복원 시점에 여기에 토큰을 "쓴다".
let currentToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function getToken(): string | null {
  return currentToken;
}

export function setToken(token: string | null): void {
  currentToken = token;
}

// 2026-07-24: API가 401(인증 실패/토큰 만료)을 응답하면 client.ts가 이 핸들러를
// 호출해서 authStore가 로그인 상태를 정리(로그아웃)하도록 함. RequireAuth가 user
// 상태 변화를 구독하고 있어서, 이 핸들러만 호출되면 자동으로 /login으로 이동됨.
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}
