import { useAnimationStore } from '../../stores/animationStore';
import { useUIStore } from '../../stores/uiStore';
import styles from './FrameProperties.module.css';

export function FrameProperties() {
  const selectedAnimationId = useAnimationStore((s) => s.selectedAnimationId);
  const animations = useAnimationStore((s) => s.animations);
  const updateFrame = useAnimationStore((s) => s.updateFrame);
  const setFps = useAnimationStore((s) => s.setFps);
  const setLoop = useAnimationStore((s) => s.setLoop);
  const selectedFrameId = useUIStore((s) => s.selectedFrameId);
  const onionSkin = useUIStore((s) => s.onionSkin);
  const setOnionSkinPrevCount = useUIStore((s) => s.setOnionSkinPrevCount);
  const setOnionSkinNextCount = useUIStore((s) => s.setOnionSkinNextCount);
  const setOnionSkinOpacity = useUIStore((s) => s.setOnionSkinOpacity);

  const animation = animations.find((a) => a.id === selectedAnimationId);
  const frame = animation?.frames.find((f) => f.id === selectedFrameId);

  if (!animation) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>Select an animation to view properties</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>Animation</div>
        <div className={styles.row}>
          <label>FPS</label>
          <input
            type="number"
            value={animation.fps}
            onChange={(e) => setFps(animation.id, parseInt(e.target.value) || 1)}
            min={1}
            max={60}
          />
        </div>
        <div className={styles.row}>
          <label>Loop</label>
          <input
            type="checkbox"
            checked={animation.loop}
            onChange={(e) => setLoop(animation.id, e.target.checked)}
          />
        </div>
        <div className={styles.row}>
          <label>Frames</label>
          <span className={styles.value}>{animation.frames.length}</span>
        </div>
      </div>

      {frame && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>Frame</div>
          <div className={styles.row}>
            <label>File</label>
            <span className={styles.value} title={frame.fileName}>
              {frame.fileName}
            </span>
          </div>
          <div className={styles.row}>
            <label>Size</label>
            <span className={styles.value}>
              {frame.width} x {frame.height}
            </span>
          </div>
          <div className={styles.row}>
            <label>Offset X</label>
            <input
              type="number"
              value={frame.offsetX}
              onChange={(e) =>
                updateFrame(animation.id, frame.id, {
                  offsetX: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>
          <div className={styles.row}>
            <label>Offset Y</label>
            <input
              type="number"
              value={frame.offsetY}
              onChange={(e) =>
                updateFrame(animation.id, frame.id, {
                  offsetY: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>
          <div className={styles.row}>
            <label>Duration (ms)</label>
            <input
              type="number"
              value={frame.duration ?? ''}
              placeholder="auto"
              onChange={(e) =>
                updateFrame(animation.id, frame.id, {
                  duration: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
              min={1}
            />
          </div>
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>Onion Skin</div>
        <div className={styles.row}>
          <label>Prev Frames</label>
          <input
            type="number"
            value={onionSkin.prevCount}
            onChange={(e) => setOnionSkinPrevCount(parseInt(e.target.value) || 0)}
            min={0}
            max={5}
          />
        </div>
        <div className={styles.row}>
          <label>Next Frames</label>
          <input
            type="number"
            value={onionSkin.nextCount}
            onChange={(e) => setOnionSkinNextCount(parseInt(e.target.value) || 0)}
            min={0}
            max={5}
          />
        </div>
        <div className={styles.row}>
          <label>Opacity</label>
          <input
            type="range"
            min={5}
            max={100}
            value={Math.round(onionSkin.opacity * 100)}
            onChange={(e) => setOnionSkinOpacity(parseInt(e.target.value) / 100)}
          />
          <span className={styles.value}>{Math.round(onionSkin.opacity * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
