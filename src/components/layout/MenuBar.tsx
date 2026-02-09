import { useUIStore } from '../../stores/uiStore';
import { useAnimationStore } from '../../stores/animationStore';
import styles from './MenuBar.module.css';

interface MenuBarProps {
  onSaveSession: () => void;
  onLoadSession: () => void;
  onDeleteSession: () => void;
  onExportFile: () => void;
  onImportFile: () => void;
}

export function MenuBar({
  onSaveSession,
  onLoadSession,
  onDeleteSession,
  onExportFile,
  onImportFile,
}: MenuBarProps) {
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
        <div className={styles.branding}>
          <img src="/logo.png" className={styles.logo} alt="MotionWeaver2D Logo" />
          <span className={styles.title}>MotionWeaver<span className={styles.titleAccent}>2D</span></span>
        </div>
        <div className={styles.actions}>
          <button onClick={onSaveSession} title="Save Named Session (Ctrl+S)">
            Save Session
          </button>
          <button onClick={onLoadSession} title="Load Named Session (Ctrl+O)">
            Load Session
          </button>
          <button onClick={onDeleteSession} title="Delete Named Session">
            Delete Session
          </button>
          <span className={styles.separator} />
          <button onClick={onExportFile} title="Export Session JSON">
            Export File
          </button>
          <button onClick={onImportFile} title="Import Session JSON">
            Import File
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
        <button
          className={mode === 'motion-lab' ? styles.modeActive : styles.modeBtn}
          onClick={() => setMode('motion-lab')}
        >
          Motion Lab
        </button>
      </div>
    </div>
  );
}
