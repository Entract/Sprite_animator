import { useRef, useCallback, useEffect, useState } from 'react';
import { Stage, Layer } from 'react-konva';
import { useUIStore } from '../../stores/uiStore';
import { useAnimationStore } from '../../stores/animationStore';
import { GridBackground } from './GridBackground';
import { getCachedImage } from '../../utils/imageLoader';
import { FrameRenderer } from './FrameRenderer';
import { SkeletonRenderer } from './SkeletonRenderer';
import styles from './CanvasViewport.module.css';

export function CanvasViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map());

  const mode = useUIStore((s) => s.mode);
  const zoom = useUIStore((s) => s.viewport.zoom);
  const panX = useUIStore((s) => s.viewport.panX);
  const panY = useUIStore((s) => s.viewport.panY);
  const setZoom = useUIStore((s) => s.setZoom);
  const setPan = useUIStore((s) => s.setPan);
  const showGrid = useUIStore((s) => s.showGrid);
  
  const selectedAnimationId = useAnimationStore((s) => s.selectedAnimationId);
  const animations = useAnimationStore((s) => s.animations);
  const animation = animations.find((a) => a.id === selectedAnimationId);
  const frames = animation?.frames ?? [];

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({
          width: Math.round(entry.contentRect.width),
          height: Math.round(entry.contentRect.height),
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Load images
  useEffect(() => {
    const loadAll = async () => {
      const map = new Map<string, HTMLImageElement>();
      for (const frame of frames) {
        try {
          const img = await getCachedImage(frame.imageData);
          map.set(frame.id, img);
        } catch {
          // skip failed images
        }
      }
      setImages(map);
    };
    loadAll();
  }, [frames]);

  // Zoom handler
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const scaleBy = 1.1;
      const newZoom = e.deltaY < 0 ? zoom * scaleBy : zoom / scaleBy;
      setZoom(newZoom);
    },
    [zoom, setZoom]
  );

  // Pan handler (middle mouse)
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        isPanning.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      setPan(panX + dx / zoom, panY + dy / zoom);
    },
    [panX, panY, zoom, setPan]
  );

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  const centerX = size.width / 2;
  const centerY = size.height / 2;

  return (
    <div
      ref={containerRef}
      className={styles.viewport}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Stage width={size.width} height={size.height}>
        <Layer>
          <GridBackground
            width={size.width}
            height={size.height}
            zoom={zoom}
            panX={panX}
            panY={panY}
            showGrid={showGrid}
          />
        </Layer>

        <Layer
          x={centerX + panX * zoom}
          y={centerY + panY * zoom}
          scaleX={zoom}
          scaleY={zoom}
        >
          {mode === 'frame' ? (
            <FrameRenderer images={images} />
          ) : (
            <SkeletonRenderer />
          )}
        </Layer>
      </Stage>

      {/* Zoom indicator */}
      <div className={styles.zoomIndicator}>
        {Math.round(zoom * 100)}%
      </div>

      {mode === 'frame' && !animation && (
        <div className={styles.emptyMessage}>
          Create an animation to get started
        </div>
      )}

      {mode === 'frame' && animation && frames.length === 0 && (
        <div className={styles.emptyMessage}>
          Drop PNG files here or use the button below to add frames
        </div>
      )}
      
      {mode === 'rig' && (
         <div style={{ position: 'absolute', bottom: 10, left: 10, color: 'white', opacity: 0.5 }}>
            Rig Mode
         </div>
      )}
    </div>
  );
}
