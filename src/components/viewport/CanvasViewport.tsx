import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { Stage, Layer } from 'react-konva';
import { useUIStore } from '../../stores/uiStore';
import { useAnimationStore } from '../../stores/animationStore';
import { GridBackground } from './GridBackground';
import { getCachedImage } from '../../utils/imageLoader';
import { FrameRenderer } from './FrameRenderer';
import { SkeletonRenderer } from './SkeletonRenderer';
import { removeColorFromImage, removeBackgroundAI } from '../../utils/imageProcessing';
import styles from './CanvasViewport.module.css';
import { 
  MousePointer2, 
  BoxSelect, 
  Wand2, 
  Magnet, 
  Brush, 
  Eraser, 
  Zap, 
  Sparkles, 
  Undo2 
} from 'lucide-react';

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
  const frames = useMemo(() => animation?.frames ?? [], [animation?.frames]);

  // Keep zoom in a ref for the non-passive event listener
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

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

  // Non-passive wheel listener for zooming
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scaleBy = 1.1;
      const currentZoom = zoomRef.current;
      const newZoom = e.deltaY < 0 ? currentZoom * scaleBy : currentZoom / scaleBy;
      setZoom(newZoom);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setZoom]);

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

  const activeTool = useUIStore((s) => s.activeTool);
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const fuzzyThreshold = useUIStore((s) => s.fuzzyThreshold);
  const setFuzzyThreshold = useUIStore((s) => s.setFuzzyThreshold);
  const brushSize = useUIStore((s) => s.brushSize);
  const setBrushSize = useUIStore((s) => s.setBrushSize);
  const currentFrameIndex = useUIStore((s) => s.playback.currentFrameIndex);
  
  const { undo } = useAnimationStore();
  
  // Abort controller ref
  const abortRef = useRef(false);

  const handleApplyFuzzyToAll = async () => {
    if (!animation || !selectedAnimationId) return;
    
    const currentFrame = animation.frames[currentFrameIndex];
    if (!currentFrame) return;

    const img = images.get(currentFrame.id);
    if (!img) return;

    // Use top-left pixel as background color
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
    const pixelData = ctx.getImageData(0, 0, 1, 1).data;
    const targetColor = { r: pixelData[0], g: pixelData[1], b: pixelData[2], a: pixelData[3] };

    setIsProcessing(true);
    abortRef.current = false;

    try {
      for (const frame of animation.frames) {
        if (abortRef.current) break;
        const newImageData = await removeColorFromImage(
          frame.imageData,
          targetColor,
          fuzzyThreshold
        );
        useAnimationStore.getState().updateFrame(selectedAnimationId, frame.id, { imageData: newImageData });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const [isProcessing, setIsProcessing] = useState(false);

  const handleAIRemove = async () => {
    if (!animation || !selectedAnimationId || isProcessing) return;
    const currentFrame = animation.frames[currentFrameIndex];
    if (!currentFrame) return;

    setIsProcessing(true);
    abortRef.current = false;
    try {
      const newImageData = await removeBackgroundAI(currentFrame.imageData);
      if (!abortRef.current) {
        useAnimationStore.getState().updateFrame(selectedAnimationId, currentFrame.id, { imageData: newImageData });
      }
    } catch (err) {
      console.error('AI Removal failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAIRemoveAll = async () => {
    if (!animation || !selectedAnimationId || isProcessing) return;
    
    setIsProcessing(true);
    abortRef.current = false;
    try {
      for (const frame of animation.frames) {
        if (abortRef.current) break;
        const newImageData = await removeBackgroundAI(frame.imageData);
        useAnimationStore.getState().updateFrame(selectedAnimationId, frame.id, { imageData: newImageData });
      }
    } catch (err) {
      console.error('AI Removal All failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStopProcessing = () => {
    abortRef.current = true;
    setIsProcessing(false); // Force UI state reset, though loop might take a moment to notice
  };

  return (
    <div
      ref={containerRef}
      className={styles.viewport}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {mode === 'frame' && (
        <div className={styles.toolbar}>
          <button
            className={styles.toolBtn}
            onClick={undo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={28} />
          </button>
          <div className={styles.toolSpacer} />
          
          {/* Selection Group */}
          <button
            className={`${styles.toolBtn} ${activeTool === 'select' ? styles.activeTool : ''}`}
            onClick={() => setActiveTool('select')}
            title="Select / Pan (S)"
          >
            <MousePointer2 size={28} />
          </button>
          <button
            className={`${styles.toolBtn} ${activeTool === 'box-select' ? styles.activeTool : ''}`}
            onClick={() => setActiveTool('box-select')}
            title="Box Select (M) - Drag to select, Del to delete"
          >
            <BoxSelect size={28} />
          </button>
          
          <div className={styles.toolSpacer} />

          {/* Magic Group */}
          <button
            className={`${styles.toolBtn} ${activeTool === 'fuzzy' ? styles.activeTool : ''}`}
            onClick={() => setActiveTool('fuzzy')}
            title="Fuzzy Select / Magic Wand (W)"
          >
            <Wand2 size={28} />
          </button>
          <button
            className={`${styles.toolBtn} ${activeTool === 'keep-island' ? styles.activeTool : ''}`}
            onClick={() => setActiveTool('keep-island')}
            title="Keep Connected / Island (K)"
          >
            <Magnet size={28} />
          </button>

          <div className={styles.toolSpacer} />

          {/* Draw Group */}
          <button
            className={`${styles.toolBtn} ${activeTool === 'brush' ? styles.activeTool : ''}`}
            onClick={() => setActiveTool('brush')}
            title="Brush (B)"
          >
            <Brush size={28} />
          </button>
          <button
            className={`${styles.toolBtn} ${activeTool === 'eraser' ? styles.activeTool : ''}`}
            onClick={() => setActiveTool('eraser')}
            title="Eraser (E)"
          >
            <Eraser size={28} />
          </button>
          <button
            className={`${styles.toolBtn} ${activeTool === 'smart-eraser' ? styles.activeTool : ''}`}
            onClick={() => setActiveTool('smart-eraser')}
            title="Smart Eraser (Shift+E)"
          >
            <Zap size={28} />
          </button>

          <div className={styles.toolSpacer} />

          {/* AI Group */}
          <button
            className={`${styles.toolBtn} ${activeTool === 'ai-remove' ? styles.activeTool : ''}`}
            onClick={() => setActiveTool('ai-remove')}
            title="AI Background Removal (A)"
          >
            <Sparkles size={28} />
          </button>
          
          <div className={styles.toolSpacer} />
          
          {(activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'smart-eraser') && (
            <div className={styles.toolOptions}>
              <label>Size</label>
              <input
                type="range"
                min="1"
                max="50"
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
              />
              <span>{brushSize}px</span>
            </div>
          )}

          {(activeTool === 'fuzzy' || activeTool === 'smart-eraser') && (
            <div className={styles.toolOptions}>
              <label>Threshold</label>
              <input
                type="range"
                min="0"
                max="255"
                value={fuzzyThreshold}
                onChange={(e) => setFuzzyThreshold(parseInt(e.target.value))}
              />
              <span>{fuzzyThreshold}</span>
              {activeTool === 'fuzzy' && (
                <button 
                  className={styles.actionBtn}
                  onClick={handleApplyFuzzyToAll}
                  disabled={isProcessing}
                  title="Remove this color from ALL frames"
                >
                  {isProcessing ? 'Processing...' : 'Apply to All'}
                </button>
              )}
            </div>
          )}
          
          {activeTool === 'ai-remove' && (
            <div className={styles.toolOptions}>
              <button 
                className={styles.actionBtn}
                onClick={handleAIRemove}
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Remove Background'}
              </button>
              <button 
                className={styles.actionBtn}
                onClick={handleAIRemoveAll}
                disabled={isProcessing}
                title="AI Remove background from ALL frames"
              >
                {isProcessing ? 'Processing All...' : 'Apply AI to All'}
              </button>
            </div>
          )}

          {isProcessing && (
             <button 
               className={`${styles.actionBtn} ${styles.stopBtn}`}
               onClick={handleStopProcessing}
               title="Stop Processing"
             >
               STOP
             </button>
          )}
        </div>
      )}
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
