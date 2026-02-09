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
import { extractFramesFromVideo } from './utils/videoUtils';
import { processImage } from './utils/imageProcessing';
import { PlaybackEngine } from './engine/PlaybackEngine';
import { exportSkeleton } from './engine/ExportEngine';
import { downloadJson } from './utils/fileUtils';
import { MotionLab } from './components/motion-lab/MotionLab';
import {
  deleteNamedSession,
  listNamedSessions,
  loadAutosaveSession,
  loadNamedSession,
  saveAutosaveSession,
  saveNamedSession,
  type PersistedSession,
} from './utils/sessionPersistence';
import styles from './App.module.css';

const playbackEngine = new PlaybackEngine();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizeSessionName(name: string): string {
  const cleaned = name.trim();
  return cleaned || 'Session';
}

function App() {
  const [showExport, setShowExport] = useState(false);
  const [sessionHydrated, setSessionHydrated] = useState(false);

  const mode = useUIStore((s) => s.mode);
  const activeTool = useUIStore((s) => s.activeTool);
  const fuzzyThreshold = useUIStore((s) => s.fuzzyThreshold);
  const brushSize = useUIStore((s) => s.brushSize);
  const selectedFrameId = useUIStore((s) => s.selectedFrameId);
  const onionSkin = useUIStore((s) => s.onionSkin);
  const viewport = useUIStore((s) => s.viewport);
  const showGrid = useUIStore((s) => s.showGrid);
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

  const skeletons = useRigStore((s) => s.skeletons);
  const selectedSkeletonId = useRigStore((s) => s.selectedSkeletonId);
  const selectedBoneId = useRigStore((s) => s.selectedBoneId);
  const selectedIKConstraintId = useRigStore((s) => s.selectedIKConstraintId);
  const selectedRigAnimationId = useRigStore((s) => s.selectedRigAnimationId);
  const rigCurrentTime = useRigStore((s) => s.currentTime);
  const setRigTime = useRigStore((s) => s.setRigTime);
  const setKeyframe = useRigStore((s) => s.setKeyframe);
  const getSelectedRigAnimation = useRigStore((s) => s.getSelectedRigAnimation);
  const getSelectedSkeleton = useRigStore((s) => s.getSelectedSkeleton);
  const rigAnimation = getSelectedRigAnimation();
  const selectedSkeleton = getSelectedSkeleton();

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

  const buildSessionSnapshot = useCallback(
    (name: string): PersistedSession => ({
      version: 2,
      name: sanitizeSessionName(name),
      savedAt: new Date().toISOString(),
      animations,
      selectedAnimationId,
      skeletons,
      rig: {
        selectedSkeletonId,
        selectedBoneId,
        selectedIKConstraintId,
        selectedRigAnimationId,
        currentTime: rigCurrentTime,
      },
      ui: {
        mode,
        activeTool,
        fuzzyThreshold,
        brushSize,
        selectedFrameId,
        currentFrameIndex,
        onionSkin: {
          enabled: onionSkin.enabled,
          prevCount: onionSkin.prevCount,
          nextCount: onionSkin.nextCount,
          opacity: onionSkin.opacity,
        },
        viewport: {
          zoom: viewport.zoom,
          panX: viewport.panX,
          panY: viewport.panY,
        },
        showGrid,
        leftPanelWidth,
        rightPanelWidth,
        timelineHeight,
      },
    }),
    [
      animations,
      selectedAnimationId,
      skeletons,
      selectedSkeletonId,
      selectedBoneId,
      selectedIKConstraintId,
      selectedRigAnimationId,
      rigCurrentTime,
      mode,
      activeTool,
      fuzzyThreshold,
      brushSize,
      selectedFrameId,
      currentFrameIndex,
      onionSkin,
      viewport,
      showGrid,
      leftPanelWidth,
      rightPanelWidth,
      timelineHeight,
    ]
  );

  const applySessionSnapshot = useCallback((session: PersistedSession) => {
    const safeAnimations = Array.isArray(session.animations) ? session.animations : [];
    const safeSelectedAnimationId =
      session.selectedAnimationId &&
      safeAnimations.some((a) => a.id === session.selectedAnimationId)
        ? session.selectedAnimationId
        : (safeAnimations[0]?.id ?? null);

    const selectedAnimation = safeAnimations.find((a) => a.id === safeSelectedAnimationId);
    const safeSkeletons = Array.isArray(session.skeletons) ? session.skeletons : [];
    const rig = session.rig || {
      selectedSkeletonId: null,
      selectedBoneId: null,
      selectedIKConstraintId: null,
      selectedRigAnimationId: null,
      currentTime: 0,
    };

    const safeSelectedSkeletonId =
      rig.selectedSkeletonId &&
      safeSkeletons.some((s) => s.id === rig.selectedSkeletonId)
        ? rig.selectedSkeletonId
        : (safeSkeletons[0]?.id ?? null);

    const selectedSkeletonForRig = safeSkeletons.find((s) => s.id === safeSelectedSkeletonId);
    const safeSelectedBoneId =
      rig.selectedBoneId &&
      selectedSkeletonForRig?.bones.some((b) => b.id === rig.selectedBoneId)
        ? rig.selectedBoneId
        : null;
    const safeSelectedIKConstraintId =
      rig.selectedIKConstraintId &&
      selectedSkeletonForRig?.ikConstraints.some((ik) => ik.id === rig.selectedIKConstraintId)
        ? rig.selectedIKConstraintId
        : null;
    const safeSelectedRigAnimationId =
      rig.selectedRigAnimationId &&
      selectedSkeletonForRig?.rigAnimations.some((a) => a.id === rig.selectedRigAnimationId)
        ? rig.selectedRigAnimationId
        : null;
    const selectedRigAnim = selectedSkeletonForRig?.rigAnimations.find(
      (a) => a.id === safeSelectedRigAnimationId
    );
    const safeRigTime = selectedRigAnim
      ? clamp(Number(rig.currentTime) || 0, 0, selectedRigAnim.duration)
      : 0;

    const uiDefaults = useUIStore.getState();
    const savedUi = session.ui ?? uiDefaults;
    const validModes = new Set(['frame', 'rig', 'motion-lab']);
    const validTools = new Set([
      'select',
      'fuzzy',
      'brush',
      'eraser',
      'ai-remove',
      'smart-eraser',
      'box-select',
      'keep-island',
    ]);

    const safeSelectedFrameId =
      savedUi.selectedFrameId &&
      selectedAnimation?.frames.some((f) => f.id === savedUi.selectedFrameId)
        ? savedUi.selectedFrameId
        : null;

    useAnimationStore.setState((state) => ({
      ...state,
      animations: safeAnimations,
      selectedAnimationId: safeSelectedAnimationId,
      canUndo: false,
      canRedo: false,
    }));

    useRigStore.setState((state) => ({
      ...state,
      skeletons: safeSkeletons,
      selectedSkeletonId: safeSelectedSkeletonId,
      selectedBoneId: safeSelectedBoneId,
      selectedIKConstraintId: safeSelectedIKConstraintId,
      selectedRigAnimationId: safeSelectedRigAnimationId,
      currentTime: safeRigTime,
      canUndo: false,
      canRedo: false,
    }));

    useUIStore.setState((state) => ({
      ...state,
      mode: validModes.has(savedUi.mode) ? savedUi.mode : 'frame',
      activeTool: validTools.has(savedUi.activeTool) ? savedUi.activeTool : 'select',
      fuzzyThreshold: clamp(Number(savedUi.fuzzyThreshold) || 20, 0, 255),
      brushSize: clamp(Number(savedUi.brushSize) || 5, 1, 100),
      selectedFrameId: safeSelectedFrameId,
      playback: {
        isPlaying: false,
        currentFrameIndex: Math.max(0, Number(savedUi.currentFrameIndex) || 0),
      },
      onionSkin: {
        enabled: !!savedUi.onionSkin?.enabled,
        prevCount: clamp(Number(savedUi.onionSkin?.prevCount) || 0, 0, 5),
        nextCount: clamp(Number(savedUi.onionSkin?.nextCount) || 0, 0, 5),
        opacity: clamp(Number(savedUi.onionSkin?.opacity) || 0.3, 0.05, 1),
      },
      viewport: {
        zoom: clamp(Number(savedUi.viewport?.zoom) || 1, 0.1, 10),
        panX: Number(savedUi.viewport?.panX) || 0,
        panY: Number(savedUi.viewport?.panY) || 0,
      },
      showGrid: savedUi.showGrid ?? true,
      leftPanelWidth: clamp(Number(savedUi.leftPanelWidth) || 240, 180, 400),
      rightPanelWidth: clamp(Number(savedUi.rightPanelWidth) || 260, 180, 400),
      timelineHeight: clamp(Number(savedUi.timelineHeight) || 200, 120, 400),
    }));
  }, []);

  // Restore latest autosave on startup
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const autosave = await loadAutosaveSession();
        if (!cancelled && autosave) {
          applySessionSnapshot(autosave);
        }
      } catch (err) {
        console.error('Failed to restore autosave session:', err);
      } finally {
        if (!cancelled) {
          setSessionHydrated(true);
        }
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, [applySessionSnapshot]);

  // Autosave current workspace in background
  useEffect(() => {
    if (!sessionHydrated) return;

    const timer = window.setTimeout(() => {
      const autosave = buildSessionSnapshot('Autosave');
      saveAutosaveSession(autosave).catch((err) => {
        console.error('Autosave failed:', err);
      });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [sessionHydrated, buildSessionSnapshot]);

  const handleExportProjectFile = useCallback(() => {
    const defaultName = sanitizeSessionName(animation?.name || 'sprite_animator_session');
    const nameInput = window.prompt('Export session file name:', defaultName);
    if (!nameInput) return;
    const snapshot = buildSessionSnapshot(nameInput);
    downloadJson(snapshot, `${sanitizeSessionName(nameInput)}.json`);
  }, [animation?.name, buildSessionSnapshot]);

  const handleImportProjectFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const raw = JSON.parse(text) as Partial<PersistedSession> & {
          version?: number;
          animations?: unknown;
          skeletons?: unknown;
        };

        const fallback = buildSessionSnapshot(file.name.replace(/\.json$/i, ''));
        let session: PersistedSession;

        if (raw.version === 2 && Array.isArray(raw.animations) && Array.isArray(raw.skeletons)) {
          session = {
            ...fallback,
            ...raw,
            animations: raw.animations as PersistedSession['animations'],
            skeletons: raw.skeletons as PersistedSession['skeletons'],
            savedAt: new Date().toISOString(),
          };
        } else if (Array.isArray(raw.animations)) {
          // Backward compatibility for older export format
          session = {
            ...fallback,
            version: 2,
            name: sanitizeSessionName(file.name.replace(/\.json$/i, '')),
            savedAt: new Date().toISOString(),
            animations: raw.animations as PersistedSession['animations'],
            skeletons: Array.isArray(raw.skeletons)
              ? (raw.skeletons as PersistedSession['skeletons'])
              : [],
          };
        } else {
          throw new Error('Invalid session file format');
        }

        applySessionSnapshot(session);
        await saveAutosaveSession(session);
      } catch (err) {
        console.error('Failed to load project:', err);
        alert('Failed to import session file');
      }
    };
    input.click();
  }, [applySessionSnapshot, buildSessionSnapshot]);

  const handleSaveNamedSession = useCallback(async () => {
    const defaultName = sanitizeSessionName(animation?.name || 'My Session');
    const nameInput = window.prompt('Save session name:', defaultName);
    if (!nameInput) return;
    const sessionName = sanitizeSessionName(nameInput);

    try {
      const existing = await loadNamedSession(sessionName);
      if (existing && !window.confirm(`Session "${sessionName}" already exists. Overwrite it?`)) {
        return;
      }

      const snapshot = buildSessionSnapshot(sessionName);
      await saveNamedSession(sessionName, snapshot);
      await saveAutosaveSession(snapshot);
      alert(`Saved session "${sessionName}".`);
    } catch (err) {
      console.error('Failed to save named session:', err);
      alert('Failed to save named session');
    }
  }, [animation?.name, buildSessionSnapshot]);

  const handleLoadNamedSession = useCallback(async () => {
    try {
      const sessions = await listNamedSessions();
      if (sessions.length === 0) {
        alert('No saved sessions found.');
        return;
      }

      const lines = sessions
        .map((s, idx) => `${idx + 1}. ${s.name} (${new Date(s.savedAt).toLocaleString()})`)
        .join('\n');

      const input = window.prompt(
        `Load session (enter number or exact name):\n\n${lines}`,
        sessions[0].name
      );
      if (!input) return;

      const trimmed = input.trim();
      let targetName = trimmed;
      if (/^\d+$/.test(trimmed)) {
        const idx = parseInt(trimmed, 10) - 1;
        if (idx >= 0 && idx < sessions.length) {
          targetName = sessions[idx].name;
        }
      }

      const session = await loadNamedSession(targetName);
      if (!session) {
        alert(`Session "${targetName}" was not found.`);
        return;
      }

      applySessionSnapshot(session);
      await saveAutosaveSession({ ...session, savedAt: new Date().toISOString() });
      alert(`Loaded session "${session.name}".`);
    } catch (err) {
      console.error('Failed to load named session:', err);
      alert('Failed to load named session');
    }
  }, [applySessionSnapshot]);

  const handleDeleteNamedSession = useCallback(async () => {
    try {
      const sessions = await listNamedSessions();
      if (sessions.length === 0) {
        alert('No saved sessions to delete.');
        return;
      }

      const lines = sessions
        .map((s, idx) => `${idx + 1}. ${s.name}`)
        .join('\n');

      const input = window.prompt(
        `Delete which session? (enter number or exact name)\n\n${lines}`
      );
      if (!input) return;

      const trimmed = input.trim();
      let targetName = trimmed;
      if (/^\d+$/.test(trimmed)) {
        const idx = parseInt(trimmed, 10) - 1;
        if (idx >= 0 && idx < sessions.length) {
          targetName = sessions[idx].name;
        }
      }

      if (!window.confirm(`Delete session "${targetName}"?`)) {
        return;
      }

      await deleteNamedSession(targetName);
      alert(`Deleted session "${targetName}".`);
    } catch (err) {
      console.error('Failed to delete named session:', err);
      alert('Failed to delete named session');
    }
  }, []);

  const setActiveTool = useUIStore((s) => s.setActiveTool);

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
      } else if (e.key === 's' || e.key === 'S') {
        if (e.ctrlKey) {
          e.preventDefault();
          handleSaveNamedSession();
        } else {
          setActiveTool('select');
        }
      } else if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        handleLoadNamedSession();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (mode === 'frame' && animation && animation.frames.length >= 2) {
          setPlaying(!isPlaying);
        } else if (mode === 'rig' && rigAnimation) {
          setPlaying(!isPlaying);
        }
      } else if (e.key === 'w' || e.key === 'W') {
        setActiveTool('fuzzy');
      } else if (e.key === 'm' || e.key === 'M') {
        setActiveTool('box-select');
      } else if (e.key === 'a' || e.key === 'A') {
        setActiveTool('ai-remove');
      } else if (e.key === 'b' || e.key === 'B') {
        setActiveTool('brush');
      } else if (e.key === 'e' || e.key === 'E') {
        if (e.ctrlKey) {
          e.preventDefault();
          if (mode === 'frame' && animation && animation.frames.length > 0) {
            setShowExport(true);
          } else if (mode === 'rig' && selectedSkeleton) {
            exportSkeleton(selectedSkeleton);
          }
        } else if (e.shiftKey) {
          setActiveTool('smart-eraser');
        } else {
          setActiveTool('eraser');
        }
      } else if (e.key === 'k' || e.key === 'K') {
        // Add keyframe for selected bone at current time (Rig mode)
        e.preventDefault();
        if (mode === 'rig' && selectedSkeletonId && selectedRigAnimationId && selectedBoneId) {
          setKeyframe(selectedSkeletonId, selectedRigAnimationId, selectedBoneId, rigCurrentTime);
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
        } else if (mode === 'rig' && rigAnimation) {
          setPlaying(false);
          const step = 1000 / 30; // ~33ms step
          setRigTime(Math.max(0, rigCurrentTime - step));
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (mode === 'frame' && animation && animation.frames.length > 0) {
          setPlaying(false);
          setCurrentFrameIndex(
            currentFrameIndex >= animation.frames.length - 1
              ? 0
              : currentFrameIndex + 1
          );
        } else if (mode === 'rig' && rigAnimation) {
          setPlaying(false);
          const step = 1000 / 30;
          setRigTime(Math.min(rigAnimation.duration, rigCurrentTime + step));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, animation, rigAnimation, isPlaying, currentFrameIndex, rigCurrentTime,
      selectedSkeletonId, selectedRigAnimationId, selectedBoneId, selectedSkeleton,
      undo, redo, handleSaveNamedSession, handleLoadNamedSession]);

  // Handle file drops on the whole app
  const handleFilesDropped = useCallback(
    async (files: File[]) => {
      const currentMode = useUIStore.getState().mode;
      if (currentMode !== 'frame') return;

      let animId = selectedAnimationId;

      if (!animId) {
        animId = useAnimationStore.getState().createAnimation();
      }

      const imageFiles = files.filter(f => f.type === 'image/png' || f.name.toLowerCase().endsWith('.png'));
      const videoFiles = files.filter(f => f.type === 'video/mp4' || f.name.toLowerCase().endsWith('.mp4'));

      const selectedFrameId = useUIStore.getState().selectedFrameId;

      if (imageFiles.length === 1 && selectedFrameId && animId) {
        // "Paste" mode: draw this image onto the selected frame
        const loaded = await loadImagesFromFiles(imageFiles);
        if (loaded.length > 0) {
          const img = loaded[0];
          const animationStore = useAnimationStore.getState();
          const anim = animationStore.animations.find(a => a.id === animId);
          const frame = anim?.frames.find(f => f.id === selectedFrameId);
          
          if (frame) {
            const newImageData = await processImage(frame.imageData, (ctx) => {
              // Draw the new image on top, centered or just at 0,0
              ctx.drawImage(img.htmlImage, 0, 0);
            });
            animationStore.updateFrame(animId, selectedFrameId, { imageData: newImageData });
            return; // Exit early
          }
        }
      }

      if (imageFiles.length > 0) {
        const loaded = await loadImagesFromFiles(imageFiles);
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
      }

      for (const videoFile of videoFiles) {
        try {
          // You could potentially ask for FPS here, but defaulting to 12 as per animation default
          const targetFps = useAnimationStore.getState().animations.find(a => a.id === animId)?.fps || 12;
          const extracted = await extractFramesFromVideo(videoFile, targetFps);
          if (extracted.length > 0) {
            addFrames(
              animId!,
              extracted.map((frame, index) => ({
                imageData: frame.imageData,
                fileName: `${videoFile.name}_frame_${index.toString().padStart(3, '0')}.png`,
                width: frame.width,
                height: frame.height,
              }))
            );
          }
        } catch (err) {
          console.error('Failed to extract frames from video:', err);
        }
      }
    },
    [selectedAnimationId, addFrames]
  );

  return (
    <DropZone onFilesDropped={handleFilesDropped} className={styles.app}>
      <MenuBar
        onSaveSession={handleSaveNamedSession}
        onLoadSession={handleLoadNamedSession}
        onDeleteSession={handleDeleteNamedSession}
        onExportFile={handleExportProjectFile}
        onImportFile={handleImportProjectFile}
      />
      <div className={styles.body}>
        {mode === 'motion-lab' ? (
          <MotionLab />
        ) : (
          <>
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
                {mode === 'rig' && selectedSkeleton && (
                  <div className={styles.exportArea}>
                    <button
                      className={styles.exportBtn}
                      onClick={() => exportSkeleton(selectedSkeleton)}
                    >
                      Export Skeleton
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
          </>
        )}
      </div>

      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </DropZone>
  );
}

export default App;
