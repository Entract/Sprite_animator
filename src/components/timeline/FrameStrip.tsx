import { useRef, useCallback, useEffect, useState } from 'react';
import { useAnimationStore } from '../../stores/animationStore';
import { useUIStore } from '../../stores/uiStore';
import { loadImagesFromFiles } from '../../utils/imageLoader';
import styles from './FrameStrip.module.css';

export function FrameStrip() {
  const selectedAnimationId = useAnimationStore((s) => s.selectedAnimationId);
  const animations = useAnimationStore((s) => s.animations);
  const addFrames = useAnimationStore((s) => s.addFrames);
  const removeFrame = useAnimationStore((s) => s.removeFrame);
  const reorderFrames = useAnimationStore((s) => s.reorderFrames);
  const duplicateFrame = useAnimationStore((s) => s.duplicateFrame);
  const selectedFrameId = useUIStore((s) => s.selectedFrameId);
  const selectFrame = useUIStore((s) => s.selectFrame);
  const currentFrameIndex = useUIStore((s) => s.playback.currentFrameIndex);
  const setCurrentFrameIndex = useUIStore((s) => s.setCurrentFrameIndex);

  const animation = animations.find((a) => a.id === selectedAnimationId);
  const frames = animation?.frames ?? [];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null);

  // Select first frame when animation changes
  useEffect(() => {
    if (frames.length > 0 && !frames.find((f) => f.id === selectedFrameId)) {
      selectFrame(frames[0].id);
      setCurrentFrameIndex(0);
    }
  }, [selectedAnimationId, frames.length]);

  const handleAddFiles = useCallback(async () => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedAnimationId || !e.target.files) return;
      const files = Array.from(e.target.files);
      const loaded = await loadImagesFromFiles(files);
      addFrames(
        selectedAnimationId,
        loaded.map((img) => ({
          imageData: img.objectUrl,
          fileName: img.fileName,
          width: img.width,
          height: img.height,
        }))
      );
      e.target.value = '';
    },
    [selectedAnimationId, addFrames]
  );

  const handleFrameClick = (frameId: string, index: number) => {
    selectFrame(frameId);
    setCurrentFrameIndex(index);
  };

  // Drag reorder
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragSourceIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverFrame = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (
      dragSourceIndex !== null &&
      dragOverIndex !== null &&
      dragSourceIndex !== dragOverIndex &&
      selectedAnimationId
    ) {
      reorderFrames(selectedAnimationId, dragSourceIndex, dragOverIndex);
      setCurrentFrameIndex(dragOverIndex);
    }
    setDragSourceIndex(null);
    setDragOverIndex(null);
  };

  if (!animation) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>Select or create an animation</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.strip}>
        {frames.map((frame, index) => (
          <div
            key={frame.id}
            className={`${styles.thumb} ${
              frame.id === selectedFrameId ? styles.selected : ''
            } ${index === currentFrameIndex ? styles.current : ''} ${
              dragOverIndex === index ? styles.dragOver : ''
            }`}
            onClick={() => handleFrameClick(frame.id, index)}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOverFrame(e, index)}
            onDragEnd={handleDragEnd}
          >
            <img
              src={frame.imageData}
              alt={frame.fileName}
              className={styles.thumbImg}
              draggable={false}
            />
            <span className={styles.thumbIndex}>{index + 1}</span>
            <div className={styles.thumbActions}>
              <button
                className={styles.thumbBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateFrame(animation.id, frame.id);
                }}
                title="Duplicate"
              >
                D
              </button>
              <button
                className={`${styles.thumbBtn} ${styles.deleteBtn}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeFrame(animation.id, frame.id);
                }}
                title="Delete"
              >
                X
              </button>
            </div>
          </div>
        ))}

        <button className={styles.addBtn} onClick={handleAddFiles} title="Add Frames">
          +
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}
