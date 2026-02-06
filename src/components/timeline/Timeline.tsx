import { useUIStore } from '../../stores/uiStore';
import { PlaybackControls } from './PlaybackControls';
import { FrameStrip } from './FrameStrip';
import { KeyframeTimeline } from './KeyframeTimeline';
import styles from './Timeline.module.css';

export function Timeline() {
  const mode = useUIStore((s) => s.mode);

  return (
    <div className={styles.timeline}>
      {/* Shared controls could go here, or inside specific timelines */}
      {mode === 'frame' ? (
        <>
            <PlaybackControls />
            <FrameStrip />
        </>
      ) : (
        <KeyframeTimeline />
      )}
    </div>
  );
}
