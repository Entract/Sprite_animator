import { useUIStore } from '../../stores/uiStore';
import { useAnimationStore } from '../../stores/animationStore';
import styles from './PlaybackControls.module.css';

export function PlaybackControls() {
  const isPlaying = useUIStore((s) => s.playback.isPlaying);
  const currentFrameIndex = useUIStore((s) => s.playback.currentFrameIndex);
  const setPlaying = useUIStore((s) => s.setPlaying);
  const setCurrentFrameIndex = useUIStore((s) => s.setCurrentFrameIndex);

  const selectedAnimationId = useAnimationStore((s) => s.selectedAnimationId);
  const animations = useAnimationStore((s) => s.animations);
  const animation = animations.find((a) => a.id === selectedAnimationId);
  const frameCount = animation?.frames.length ?? 0;

  const stepBack = () => {
    if (frameCount === 0) return;
    setPlaying(false);
    setCurrentFrameIndex(
      currentFrameIndex <= 0 ? frameCount - 1 : currentFrameIndex - 1
    );
  };

  const stepForward = () => {
    if (frameCount === 0) return;
    setPlaying(false);
    setCurrentFrameIndex(
      currentFrameIndex >= frameCount - 1 ? 0 : currentFrameIndex + 1
    );
  };

  const goToStart = () => {
    setPlaying(false);
    setCurrentFrameIndex(0);
  };

  const goToEnd = () => {
    setPlaying(false);
    setCurrentFrameIndex(Math.max(0, frameCount - 1));
  };

  const togglePlay = () => {
    if (frameCount < 2) return;
    setPlaying(!isPlaying);
  };

  return (
    <div className={styles.controls}>
      <button onClick={goToStart} disabled={frameCount === 0} title="Go to Start">
        &#9198;
      </button>
      <button onClick={stepBack} disabled={frameCount === 0} title="Step Back">
        &#9194;
      </button>
      <button
        onClick={togglePlay}
        disabled={frameCount < 2}
        className={isPlaying ? styles.playing : ''}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '\u23F8' : '\u25B6'}
      </button>
      <button onClick={stepForward} disabled={frameCount === 0} title="Step Forward">
        &#9193;
      </button>
      <button onClick={goToEnd} disabled={frameCount === 0} title="Go to End">
        &#9197;
      </button>

      <span className={styles.separator} />

      <span className={styles.frameInfo}>
        {frameCount > 0
          ? `${currentFrameIndex + 1} / ${frameCount}`
          : '0 / 0'}
      </span>

      {animation && (
        <>
          <span className={styles.separator} />
          <span className={styles.fpsLabel}>FPS:</span>
          <span className={styles.fpsValue}>{animation.fps}</span>
        </>
      )}
    </div>
  );
}
