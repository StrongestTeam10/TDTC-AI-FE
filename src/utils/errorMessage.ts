import { isAxiosError } from 'axios';

// 2026-07-24 추가
// 각 페이지에서 catch(err) 했을 때 화면에 보여줄 문구를 통일하기 위한 헬퍼.
// 서버가 내려준 메시지가 있으면 그걸 우선 쓰고, 없으면 상황별 기본 문구를 씀.
export function toDisplayErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const serverMessage = (err.response?.data as { message?: string } | undefined)?.message;
    if (serverMessage) return serverMessage;
    if (err.code === 'ECONNABORTED') return '요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
    if (!err.response) return '서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.';
    return `${fallback} (오류 코드: ${err.response.status})`;
  }
  return fallback;
}
