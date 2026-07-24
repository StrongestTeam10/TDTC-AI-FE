// 2026-07-24 추가
// 행안부 가이드라인 - IV.컴포넌트 - 피드백 - 스피너(Spinner) 반영.
// 데이터 로딩 중임을 알리는 공통 컴포넌트. 페이지 전체를 덮는 용도가 아니라,
// 로딩 중인 영역 안에 자리를 잡고 보여주는 용도로 씀(레이아웃이 갑자기 비었다가
// 채워지는 느낌을 줄이기 위함).
interface SpinnerProps {
  label?: string;
  className?: string;
}

export default function Spinner({ label = '불러오는 중...', className = '' }: SpinnerProps) {
  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-2 py-10 text-sm text-slate-400 ${className}`}
    >
      <span
        aria-hidden
        className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-blue-500"
      />
      <span>{label}</span>
    </div>
  );
}
