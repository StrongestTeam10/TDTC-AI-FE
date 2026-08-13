import React, { RefObject, useState } from 'react';
import styles from './CctvDashboard.module.css';

export interface Zone {
  id: number;
  name: string;
  empty?: boolean;
}

const ZONES: Zone[] = [
  { id: 1, name: '남측 구역' },
  { id: 2, name: '중앙 구역' },
  { id: 3, name: '북측 구역' },
  { id: 4, name: '', empty: true },
  { id: 5, name: '', empty: true },
  { id: 6, name: '', empty: true }, // 테스트용 6번째 슬롯
];

interface Props {
  activeZoneId: number | null;
  onSelectZone: (zoneId: number | null) => void;
  onExpandZone: (zoneId: number) => void;
  videoRef: RefObject<HTMLVideoElement>;
  videoSrc: string | null;
  isPlaying: boolean;
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
  onTogglePlay: () => void;
}

export default function CctvZoneGallery({
  activeZoneId,
  onSelectZone,
  onExpandZone,
  videoRef,
  videoSrc,
  isPlaying,
  onLoadedMetadata,
  onTimeUpdate,
  onTogglePlay
}: Props) {
  const ITEMS_PER_PAGE = 4;
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(ZONES.length / ITEMS_PER_PAGE);

  const handleBgClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onSelectZone(null); // Deselect on empty background click
    }
  };

  const currentZones = ZONES.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  return (
    <div className={styles.galleryWrapper} onClick={handleBgClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button 
          onClick={(e) => { e.stopPropagation(); setPage(p => Math.max(0, p - 1)); }}
          disabled={page === 0}
          style={{ padding: '8px', cursor: page === 0 ? 'not-allowed' : 'pointer', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-main)', opacity: page === 0 ? 0.5 : 1 }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>

        <div className={styles.galleryScrollContainer} onClick={handleBgClick} style={{ flex: 1 }}>
          {currentZones.map((zone) => {
            const isActive = activeZoneId === zone.id;
            
            if (zone.empty) {
              return (
                <div key={`empty-${zone.id}`} className={styles.galleryItem} style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'transparent', cursor: 'default' }} onClick={handleBgClick} />
              );
            }

            // Render video in the active zone, or zone 1 if none selected
            const shouldRenderVideo = isActive || (activeZoneId === null && zone.id === 1);

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
                  {shouldRenderVideo && videoSrc ? (
                    <>
                      <video
                        className={styles.galleryVideoBlurBg}
                        src={videoSrc}
                        muted
                        loop={false}
                        playsInline
                        autoPlay
                      />
                      <video
                        ref={videoRef}
                        className={styles.galleryVideoMain}
                        src={videoSrc}
                        muted
                        loop={false}
                        playsInline
                        autoPlay
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isActive) {
                            onSelectZone(null); // click again to return to comprehensive
                          } else {
                            onSelectZone(zone.id);
                          }
                        }}
                        onLoadedMetadata={onLoadedMetadata}
                        onTimeUpdate={onTimeUpdate}
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
                    </>
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: '#111827' }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button 
          onClick={(e) => { e.stopPropagation(); setPage(p => Math.min(totalPages - 1, p + 1)); }}
          disabled={page === totalPages - 1}
          style={{ padding: '8px', cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-main)', opacity: page === totalPages - 1 ? 0.5 : 1 }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
    </div>
  );
}
