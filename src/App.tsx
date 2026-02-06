import { useCallback, useEffect, useState } from 'react';
import { MenuBar } from './components/layout/MenuBar';
import { LeftPanel } from './components/layout/LeftPanel';
import { PropertiesPanel } from './components/layout/PropertiesPanel';
import { PanelResizer } from './components/layout/PanelResizer';
import { CanvasViewport } from './components/viewport/CanvasViewport';
import { Timeline } from './components/timeline/Timeline';
import { DropZone } from './components/shared/DropZone';
import { ExportDialog } from './components/panels/ExportDialog';
import { useAnimationStore } from './stores/animationStore';
import { useRigStore } from './stores/rigStore';
import { useUIStore } from './stores/uiStore';
import { loadImagesFromFiles } from './utils/imageLoader';
import { PlaybackEngine } from './engine/PlaybackEngine';
import styles from './App.module.css';

const playbackEngine = new PlaybackEngine();

function App() {
  const [showExport, setShowExport] = useState(false);

  const mode = useUIStore((s) => s.mode);
  const leftPanelWidth = useUIStore((s) => s.leftPanelWidth);
  const rightPanelWidth = useUIStore((s) => s.rightPanelWidth);
  const timelineHeight = useUIStore((s) => s.timelineHeight);
  const setLeftPanelWidth = useUIStore((s) => s.setLeftPanelWidth);
  const setRightPanelWidth = useUIStore((s) => s.setRightPanelWidth);
  const setTimelineHeight = useUIStore((s) => s.setTimelineHeight);

  const isPlaying = useUIStore((s) => s.playback.isPlaying);
  const setPlaying = useUIStore((s) => s.setPlaying);
  const currentFrameIndex = useUIStore((s) => s.playback.currentFrameIndex);
  const setCurrentFrameIndex = useUIStore((s) => s.setCurrentFrameIndex);

  const selectedAnimationId = useAnimationStore((s) => s.selectedAnimationId);
  const animations = useAnimationStore((s) => s.animations);
  const addFrames = useAnimationStore((s) => s.addFrames);
  const { undo, redo } = useAnimationStore();
  const animation = animations.find((a) => a.id === selectedAnimationId);

  const selectedRigAnimationId = useRigStore((s) => s.selectedRigAnimationId);
  const rigCurrentTime = useRigStore((s) => s.currentTime);
  const setRigTime = useRigStore((s) => s.setRigTime);
  const getSelectedRigAnimation = useRigStore((s) => s.getSelectedRigAnimation);
  const rigAnimation = getSelectedRigAnimation();

  // Playback engine sync
  useEffect(() => {
    if (isPlaying) {
      if (mode === 'frame' && animation) {
        playbackEngine.configure(
          animation.fps,
          animation.frames.length,
          animation.loop,
          currentFrameIndex
        );
        playbackEngine.play((frameIndex) => {
          setCurrentFrameIndex(frameIndex);
        });
      } else if (mode === 'rig' && rigAnimation) {
         playbackEngine.configureRig(
             rigAnimation.duration,
             rigAnimation.loop,
             rigCurrentTime
         );
         playbackEngine.playRig((time) => {
             setRigTime(time);
         });
      }
    } else {
      playbackEngine.stop();
    }

    return () => {
      playbackEngine.stop();
    };
  }, [isPlaying, mode, animation, rigAnimation, currentFrameIndex, rigCurrentTime]);

  // Stop playback when switching animations or modes
  useEffect(() => {
    setPlaying(false);
  }, [selectedAnimationId, selectedRigAnimationId, mode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (mode === 'frame' && animation && animation.frames.length >= 2) {
           setPlaying(!isPlaying);
        } else if (mode === 'rig' && rigAnimation) {
           setPlaying(!isPlaying);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (mode === 'frame' && animation && animation.frames.length > 0) {
          setPlaying(false);
          setCurrentFrameIndex(
            currentFrameIndex <= 0
              ? animation.frames.length - 1
              : currentFrameIndex - 1
          );
        }
        // TODO: Step for rig?
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (mode === 'frame' && animation && animation.frames.length > 0) {
          setPlaying(false);
          setCurrentFrameIndex(
            currentFrameIndex >= animation.frames.length - 1
              ? 0
              : currentFrameIndex + 1
          );
        }
        // TODO: Step for rig?
      } else if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        if (mode === 'frame' && animation && animation.frames.length > 0) {
          setShowExport(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, animation, rigAnimation, isPlaying, currentFrameIndex, undo, redo]);

  // Handle file drops on the whole app
  const handleFilesDropped = useCallback(
    async (files: File[]) => {
      const currentMode = useUIStore.getState().mode;
      if (currentMode !== 'frame') return;

      let animId = selectedAnimationId;

      if (!animId) {
        animId = useAnimationStore.getState().createAnimation();
      }

      const loaded = await loadImagesFromFiles(files);
      if (loaded.length > 0) {
        addFrames(
          animId,
          loaded.map((img) => ({
            imageData: img.objectUrl,
            fileName: img.fileName,
            width: img.width,
            height: img.height,
          }))
        );
      }
    },
    [selectedAnimationId, addFrames]
  );

  return (
    <DropZone onFilesDropped={handleFilesDropped} className={styles.app}>
      <MenuBar />
      <div className={styles.body}>
        <div className={styles.mainArea}>
          <div className={styles.leftPanel} style={{ width: leftPanelWidth }}>
            <LeftPanel />
          </div>

          <PanelResizer
            direction="horizontal"
            onResize={(delta) => setLeftPanelWidth(leftPanelWidth + delta)}
          />

          <div className={styles.center}>
            <CanvasViewport />
          </div>

          <PanelResizer
            direction="horizontal"
            onResize={(delta) => setRightPanelWidth(rightPanelWidth - delta)}
          />

          <div className={styles.rightPanel} style={{ width: rightPanelWidth }}>
            <PropertiesPanel />
            {mode === 'frame' && animation && animation.frames.length > 0 && (
              <div className={styles.exportArea}>
                <button
                  className={styles.exportBtn}
                  onClick={() => setShowExport(true)}
                >
                  Export Sprite Sheet
                </button>
              </div>
            )}
          </div>
        </div>

        <PanelResizer
          direction="vertical"
          onResize={(delta) => setTimelineHeight(timelineHeight - delta)}
        />
        <div className={styles.timeline} style={{ height: timelineHeight }}>
          <Timeline />
        </div>
      </div>

      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </DropZone>
  );
}

export default App;