// 2026-07-24 추가
// 행안부 가이드라인 사용성 원칙: "오류 메시지는 명확하고 간결하게 제공한다".
// 지금까지 ScenarioPage/PredictionPage는 window.alert()로 오류를 띄웠는데,
// alert()는 (1) 화면 흐름을 강제로 막고 (2) 모바일에서 UX가 나쁘고
// (3) 가이드라인이 말하는 "화면 안내 영역"과 맞지 않아서 이 배너로 교체함.
interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded border border-red-500/40 px-2 py-1 text-xs text-red-200 hover:bg-red-500/20"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}
