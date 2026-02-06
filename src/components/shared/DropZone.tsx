import { useCallback, useState, useRef } from 'react';
import styles from './DropZone.module.css';

interface DropZoneProps {
  onFilesDropped: (files: File[]) => void;
  accept?: string;
  children: React.ReactNode;
  className?: string;
}

export function DropZone({ onFilesDropped, accept = 'image/png', children, className }: DropZoneProps) {
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
        if (accept === 'image/png') {
          return f.type === 'image/png' || f.name.toLowerCase().endsWith('.png');
        }
        return f.type.startsWith('image/');
      });

      if (files.length > 0) {
        onFilesDropped(files);
      }
    },
    [onFilesDropped, accept]
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
          <div className={styles.overlayText}>Drop PNG files here</div>
        </div>
      )}
    </div>
  );
}
