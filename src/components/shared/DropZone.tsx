import { useCallback, useState, useRef } from 'react';
import styles from './DropZone.module.css';

interface DropZoneProps {
  onFilesDropped: (files: File[]) => void;
  children: React.ReactNode;
  className?: string;
}

export function DropZone({ onFilesDropped, children, className }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCountRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    if (dragCountRef.current === 1) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current = 0;
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files).filter((f) => {
        const lowerName = f.name.toLowerCase();
        return (
          f.type === 'image/png' ||
          lowerName.endsWith('.png') ||
          f.type === 'video/mp4' ||
          lowerName.endsWith('.mp4')
        );
      });

      if (files.length > 0) {
        onFilesDropped(files);
      }
    },
    [onFilesDropped]
  );

  return (
    <div
      className={`${styles.dropZone} ${isDragging ? styles.dragging : ''} ${className || ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && (
        <div className={styles.overlay}>
          <div className={styles.overlayText}>Drop PNG or MP4 files here</div>
        </div>
      )}
    </div>
  );
}
