import { useUIStore } from '../../stores/uiStore';
import { useAnimationStore } from '../../stores/animationStore';
import styles from './MenuBar.module.css';

interface MenuBarProps {
  onSave: () => void;
  onLoad: () => void;
}

export function MenuBar({ onSave, onLoad }: MenuBarProps) {
  const mode = useUIStore((s) => s.mode);
  const setMode = useUIStore((s) => s.setMode);
  const { undo, redo, canUndo, canRedo } = useAnimationStore();
  const showGrid = useUIStore((s) => s.showGrid);
  const toggleGrid = useUIStore((s) => s.toggleGrid);
  const onionSkin = useUIStore((s) => s.onionSkin);
  const toggleOnionSkin = useUIStore((s) => s.toggleOnionSkin);
  const resetViewport = useUIStore((s) => s.resetViewport);

  return (
    <div className={styles.menuBar}>
      <div className={styles.left}>
        <span className={styles.title}>Sprite Animator</span>
        <div className={styles.actions}>
          <button onClick={onSave} title="Save Project (Ctrl+S)">
            Save
          </button>
          <button onClick={onLoad} title="Load Project (Ctrl+O)">
            Load
          </button>
          <span className={styles.separator} />
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            Redo
          </button>
          <span className={styles.separator} />
          <button
            onClick={toggleGrid}
            className={showGrid ? styles.active : ''}
            title="Toggle Grid"
          >
            Grid
          </button>
          <button
            onClick={toggleOnionSkin}
            className={onionSkin.enabled ? styles.active : ''}
            title="Toggle Onion Skin (Frame Mode)"
          >
            Onion
          </button>
          <button onClick={resetViewport} title="Reset Viewport">
            Fit
          </button>
        </div>
      </div>
      <div className={styles.modeSwitch}>
        <button
          className={mode === 'frame' ? styles.modeActive : styles.modeBtn}
          onClick={() => setMode('frame')}
        >
          Frame Mode
        </button>
        <button
          className={mode === 'rig' ? styles.modeActive : styles.modeBtn}
          onClick={() => setMode('rig')}
        >
          Rig Mode
        </button>
      </div>
    </div>
  );
}
