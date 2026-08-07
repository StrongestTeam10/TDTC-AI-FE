import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, RefObject } from 'react';
import styles from './CctvDashboard.module.css';
import type { CctvAnalysisProgress, CctvConnectionStatus } from '../../types/cctv';

// 2026-08-06: 원본 index.html의 <div class="card video-card"> 블록 + dashboard.js의
// 7~8번 섹션(비디오/타임라인 컨트롤, 파일 업로드, 드래그 앤 드롭).
//
// 원본 <source src="../results/cctv_mangwon_raw_video.mp4">는 public/ 아래에 그런
// 파일이 없어 항상 404였다. 기본 영상 없이 플레이스홀더로 시작하고, 영상이 정해졌을
// 때만 <video>에 src를 준다.

const ACCEPTED_VIDEO_EXTENSIONS = ['.mov', '.mp4', '.webm', '.avi'];

const WS_STATUS_TEXT: Record<CctvConnectionStatus, string> = {
  open: 'AI 스트림 연결됨',
  connecting: 'AI 스트림 연결 중',
  closed: 'AI 서버 미연결 (폴백 데이터)',
  disabled: 'AI 스트림 사용 안 함',
};

interface CctvVideoPanelProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** 재생할 영상 주소. 업로드 전에는 null이라 플레이스홀더가 보인다. */
  videoSrc: string | null;
  /** 상단 배지에 표시할 파일명 */
  fileLabel: string;
  isPlaying: boolean;
  currentFrame: number;
  totalFrames: number;
  /** 초 단위 표시(프레임/10) */
  frameTimeLabel: string;
  analysis: CctvAnalysisProgress;
  wsStatus: CctvConnectionStatus;
  /** 대피 위험이 설정 시간 이상 지속됨 */
  isDispatchAlarmActive: boolean;
  /** 비디오 좌상단 기상 배지 문구 */
  weatherBadgeText: string;
  onSelectVideo: (file: File) => void;
  onTogglePlay: () => void;
  onSeekFrame: (frame: number) => void;
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
}

export default function CctvVideoPanel({
  videoRef,
  videoSrc,
  fileLabel,
  isPlaying,
  currentFrame,
  totalFrames,
  frameTimeLabel,
  analysis,
  wsStatus,
  isDispatchAlarmActive,
  weatherBadgeText,
  onSelectVideo,
  onTogglePlay,
  onSeekFrame,
  onLoadedMetadata,
  onTimeUpdate,
}: CctvVideoPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setDragOver] = useState(false);

  function acceptFile(file: File | undefined | null) {
    if (!file) return;

    const nameLower = file.name.toLowerCase();
    const isValidVideo =
        file.type.startsWith('video/') ||
        ACCEPTED_VIDEO_EXTENSIONS.some((ext) => nameLower.endsWith(ext));

    if (!isValidVideo) {
      alert('⚠️ 올바른 비디오 파일(MP4, MOV, WebM, AVI 등)을 선택해 주세요.');
      return;
    }
    onSelectVideo(file);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    acceptFile(e.target.files?.[0]);
    // 같은 파일을 다시 골랐을 때도 change가 발생하도록 값을 비운다.
    e.target.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    acceptFile(e.dataTransfer.files?.[0]);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  return (
      <div className={`${styles.card} ${styles.videoCard}`}>
        <div className={styles.cardTitle}>
          <div className={styles.titleLeft}>
            <span>📹 CCTV Real-Time Stream &amp; 3D BEV Top-View Map</span>
            <span className={styles.cctvFileBadge}>{fileLabel}</span>
          </div>
          <div className={styles.titleRightActions}>
            <button
                type="button"
                className={styles.btnCctvUpload}
                title="새로운 CCTV 영상 업로드 (MP4/WebM)"
                onClick={() => fileInputRef.current?.click()}
            >
              📁 CCTV 업로드
            </button>
            <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/avi,video/quicktime,.mov"
                style={{ display: 'none' }}
                onChange={handleInputChange}
            />
            <span className={`${styles.wsStatusBadge} ${styles[wsStatus]}`}>
              <span className={styles.wsDot} />
              {WS_STATUS_TEXT[wsStatus]}
            </span>
          </div>
        </div>

        <div
            className={`${styles.videoContainer} ${isDragOver ? styles.dragOver : ''}`}
            onDragEnter={handleDragOver}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
          {analysis.isAnalyzing && (
              <div className={`${styles.aiLoadingOverlay} ${styles.active}`}>
                <div className={styles.aiSpinnerContainer}>
                  <div className={styles.aiPulseRing} />
                  <div className={styles.aiSpinnerIcon}>🤖</div>
                </div>
                <h3 className={styles.aiLoadingTitle}>{analysis.title}</h3>
                <div className={styles.aiProgressTrack}>
                  <div className={styles.aiProgressBar} style={{ width: `${analysis.percent}%` }} />
                </div>
                <span className={styles.aiLoadingPercent}>{analysis.percent}%</span>
                <p className={styles.aiLoadingSub}>
                  YOLO 객체 감지 ➔ CSRNet 밀집도 ➔ 3D BEV 좌표역투영 ➔ CRI 스코어링 진행 중
                </p>
              </div>
          )}

          {!videoSrc && (
              <div className={styles.videoPlaceholderOverlay}>
                <div className={styles.placeholderContent}>
                  <div className={styles.placeholderIcon}>📂</div>
                  <h3 className={styles.placeholderTitle}>CCTV 영상을 업로드해 주세요</h3>
                  <p className={styles.placeholderSub}>
                    우측 상단의 [📁 CCTV 업로드] 버튼을 누르거나 영상을 이 영역에 드래그 앤 드롭하면,
                    원본 영상의 얼굴을 완벽 가리는 실시간 가우시안 블러 및 밀집 구역 라인 분석이
                    구동됩니다.
                  </p>
                </div>
              </div>
          )}

          <div className={styles.videoOverlayBadge}>
            <span>{weatherBadgeText}</span>
          </div>

          <div
              className={`${styles.dispatchOverlay} ${isDispatchAlarmActive ? styles.active : ''}`}
          >
            🚨 EMERGENCY DISPATCH ACTIVE 🚨
            <br />
            <span className={styles.dispatchSub}>대피 위험 수준 지속 감지 - 관제소 출동 신호 발생</span>
          </div>

          <video
              ref={videoRef}
              src={videoSrc ?? undefined}
              autoPlay
              loop
              muted
              playsInline
              className={styles.videoPlayer}
              onLoadedMetadata={onLoadedMetadata}
              onTimeUpdate={onTimeUpdate}
          />
        </div>

        <div className={styles.playbackControls}>
          <button type="button" className={styles.btnControl} onClick={onTogglePlay}>
            {isPlaying ? 'PAUSE' : 'PLAY'}
          </button>
          <input
              type="range"
              min={1}
              max={totalFrames}
              value={currentFrame}
              className={styles.timelineSlider}
              onChange={(e) => onSeekFrame(Number(e.target.value))}
          />
          <span className={styles.frameCounterText}>{frameTimeLabel}</span>
        </div>
      </div>
  );
}
