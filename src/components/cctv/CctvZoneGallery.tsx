import { CCTV_API_BASE_URL } from '../../api/cctvClient';
import React, { useState } from 'react';
import { CCTV_ZONES } from '../../constants/cctvZone';
import styles from './CctvDashboard.module.css';

interface Props {
  activeZoneId: number | null;
  onSelectZone: (zoneId: number | null) => void;
  onExpandZone: (zoneId: number) => void;
}

// 2026-08-13: isPlaying / onTogglePlay 를 Props에서 뺐다. 46bfabf 에서 갤러리 영상이
// autoPlay 로 바뀌면서 재생/일시정지 버튼이 사라져 둘 다 쓰이지 않는데, 선언만 남아
// 있어서 빌드가 깨졌다(TS6133). 재생 컨트롤을 다시 붙일 때 같이 되살리면 된다.
//
// 2026-08-19: 구역 목록을 constants/cctvZone.ts 로 옮겼다. 여기 있던 배열에는 빈 슬롯
// 3개(그중 하나는 "테스트용 6번째 슬롯")가 섞여 있었고, ITEMS_PER_PAGE 가 4라 2페이지가
// 빈칸만 두 개인 화면이 됐다. 실제 구역이 3개뿐이라 이제 페이지가 하나이고, 넘김 버튼은
// 페이지가 둘 이상일 때만 나온다.
export default function CctvZoneGallery({
  activeZoneId,
  onSelectZone,
  onExpandZone,
}: Props) {
  const ITEMS_PER_PAGE = 4;
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(CCTV_ZONES.length / ITEMS_PER_PAGE);

  const handleBgClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onSelectZone(null); // 빈 배경을 누르면 선택 해제
    }
  };

  const currentZones = CCTV_ZONES.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  return (
    <div className={styles.galleryWrapper} onClick={handleBgClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {totalPages > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); setPage(p => Math.max(0, p - 1)); }}
            disabled={page === 0}
            style={{ padding: '8px', cursor: page === 0 ? 'not-allowed' : 'pointer', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-color)', opacity: page === 0 ? 0.5 : 1 }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
        )}

        <div className={styles.galleryScrollContainer} onClick={handleBgClick} style={{ flex: 1 }}>
          {currentZones.map((zone) => {
            const isActive = activeZoneId === zone.id;

            return (
              <div
                key={zone.id}
                className={`${styles.galleryItem} ${isActive ? styles.activeZone : ''}`}
                onClick={() => {
                  if (isActive) onSelectZone(null);
                  else onSelectZone(zone.id);
                }}
              >
                <div className={styles.zoneBadge}>
                  {zone.name}
                </div>

                <div className={styles.videoLayers}>
                  <img
                    className={styles.galleryVideoBlurBg}
                    src={`${CCTV_API_BASE_URL}/api/v1/cctv/stream?zone_id=${zone.id}&ngrok-skip-browser-warning=true`}
                    alt={`Zone ${zone.id} Blur Background`}
                  />
                  <img
                    className={styles.galleryVideoMain}
                    src={`${CCTV_API_BASE_URL}/api/v1/cctv/stream?zone_id=${zone.id}&ngrok-skip-browser-warning=true`}
                    alt={`Zone ${zone.id} Live Stream`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isActive) {
                        onSelectZone(null);
                      } else {
                        onSelectZone(zone.id);
                      }
                    }}
                  />

                  <button
                    className={styles.btnExpandZone}
                    onClick={(e) => {
                      e.stopPropagation();
                      onExpandZone(zone.id);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <polyline points="9 21 3 21 3 15"></polyline>
                      <line x1="21" y1="3" x2="14" y2="10"></line>
                      <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); setPage(p => Math.min(totalPages - 1, p + 1)); }}
            disabled={page === totalPages - 1}
            style={{ padding: '8px', cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-color)', opacity: page === totalPages - 1 ? 0.5 : 1 }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        )}
      </div>
    </div>
  );
}
