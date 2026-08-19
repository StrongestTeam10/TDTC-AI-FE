import { useThemeStore } from '../../store/themeStore';

// 2026-08-19 추가 (성능)
//
// 랜딩·로그인·회원가입에 같은 배경 블록이 네 번 복사돼 있었고, 라이트/다크 이미지를
// 둘 다 DOM에 넣은 뒤 dark:hidden / dark:block 으로 감췄다. 이건 표시만 끄는 것이라
// 브라우저는 두 장을 모두 내려받는다 - 비로그인도 보는 공개 랜딩에서 방문 1회당
// 12.9MB가 나가고 있었다(src 전체 소스가 1.1MB인데 그 12배).
//
// <picture media="(prefers-color-scheme: dark)"> 로는 못 고친다. 이 앱의 테마는
// ThemeToggle 로 수동 선택할 수 있어서(store/themeStore.ts) OS 설정과 다를 수 있고,
// 그러면 미디어 쿼리가 반대 이미지를 고른다. resolvedTheme 을 보고 실제로 한 장만
// 렌더해야 한다.
//
// 이미지는 PNG -> WebP(q90)로 교체했다(합계 12.88MB -> 761KB, 94.2% 감소).
// 원본 PNG의 투명 영역은 부모 배경색으로 미리 합성해서 구웠다 - 네 군데 부모가 모두
// bg-slate-50 / dark:bg-slate-950 으로 같아서 합성 결과가 화면에 보이던 것과 동일하다.
// (libvips 빌드가 손실 WebP의 알파를 지원하지 않는 제약도 이 방식으로 함께 피했다.)
//
// ! 부모 배경색을 바꾸면 이미지를 다시 구워야 한다. 그때는 아래 색을 함께 고칠 것:
//   bg-light.webp <- slate-50 (#f8fafc) / bg-dark.webp <- slate-950 (#020617)

const MASK =
  'linear-gradient(to bottom, black 0%, black 60%, transparent 100%), ' +
  'linear-gradient(to right, black 0%, black calc(100% - 15px), transparent 100%)';

interface BackdropImageProps {
  // 랜딩은 absolute, 로그인·회원가입은 fixed + pointer-events-none 을 쓴다.
  className?: string;
}

export default function BackdropImage({
  className = 'absolute inset-0',
}: BackdropImageProps) {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  return (
    <div
      className={className}
      style={{
        WebkitMaskImage: MASK,
        WebkitMaskComposite: 'source-in',
        maskImage: MASK,
        maskComposite: 'intersect',
      }}
    >
      <img
        src={resolvedTheme === 'dark' ? '/images/bg-dark.webp' : '/images/bg-light.webp'}
        // 순수 장식이다. alt 를 채우면 스크린리더가 인증 화면마다 읽는다.
        alt=""
        width={2754}
        height={1536}
        className="h-full w-full object-cover object-center"
      />
    </div>
  );
}
