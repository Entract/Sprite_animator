import { Image as KonvaImage, Rect, Circle } from 'react-konva';
import { useRef, useState, useEffect } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useAnimationStore } from '../../stores/animationStore';
import { applyFuzzySelect, eraseColorLocal, getPixel, clearArea, keepConnected } from '../../utils/imageProcessing';
import type { Pixel } from '../../utils/imageProcessing';

interface FrameRendererProps {
  images: Map<string, HTMLImageElement>;
}

export function FrameRenderer({ images }: FrameRendererProps) {
  const selectedAnimationId = useAnimationStore((s) => s.selectedAnimationId);
  const animations = useAnimationStore((s) => s.animations);
  const updateFrame = useAnimationStore((s) => s.updateFrame);
  
  const animation = animations.find((a) => a.id === selectedAnimationId);
  const frames = animation?.frames ?? [];
  const currentFrameIndex = useUIStore((s) => s.playback.currentFrameIndex);
  const onionSkin = useUIStore((s) => s.onionSkin);
  const activeTool = useUIStore((s) => s.activeTool);
  const fuzzyThreshold = useUIStore((s) => s.fuzzyThreshold);
  const brushSize = useUIStore((s) => s.brushSize);

  const currentFrame = frames[currentFrameIndex];

  // Box Selection State
  const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const isSelecting = useRef(false);
  const selectionStart = useRef<{ x: number, y: number } | null>(null);
  const [cursorPos, setCursorPos] = useState<{x: number, y: number} | null>(null);

  useEffect(() => {
    // Clear selection when tool changes
    if (activeTool !== 'box-select') {
      const timer = setTimeout(() => setSelectionBox(null), 0);
      return () => clearTimeout(timer);
    }
  }, [activeTool]);
  
  // Clear cursor when tool changes
  useEffect(() => {
      const timer = setTimeout(() => setCursorPos(null), 0);
      return () => clearTimeout(timer);
  }, [activeTool]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectionBox && currentFrame && selectedAnimationId) {
        // Delete contents of selection
        const img = images.get(currentFrame.id);
        if (img) {
          const canvas = document.createElement('canvas');
          canvas.width = currentFrame.width;
          canvas.height = currentFrame.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          // Convert selection box coords (relative to frame center) to image coords
          const frameX = selectionBox.x + currentFrame.width / 2;
          const frameY = selectionBox.y + currentFrame.height / 2;

          const changed = clearArea(
            imageData.data,
            imageData.width,
            imageData.height,
            Math.floor(frameX),
            Math.floor(frameY),
            Math.floor(selectionBox.w),
            Math.floor(selectionBox.h)
          );

          if (changed) {
            const newCanvas = document.createElement('canvas');
            newCanvas.width = currentFrame.width;
            newCanvas.height = currentFrame.height;
            const newCtx = newCanvas.getContext('2d')!;
            newCtx.putImageData(imageData, 0, 0);
            
            updateFrame(selectedAnimationId, currentFrame.id, { imageData: newCanvas.toDataURL('image/png') });
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectionBox, currentFrame, selectedAnimationId, images, updateFrame]);


  const handleFrameClick = async (e: any) => {
    if (!currentFrame || !selectedAnimationId) return;

    const pos = e.target.getRelativePointerPosition();
    if (!pos) return;
    const x = Math.floor(pos.x);
    const y = Math.floor(pos.y);

    if (x >= 0 && x < currentFrame.width && y >= 0 && y < currentFrame.height) {
      if (activeTool === 'fuzzy') {
        const newImageData = await applyFuzzySelect(
          currentFrame.imageData,
          x,
          y,
          fuzzyThreshold
        );
        updateFrame(selectedAnimationId, currentFrame.id, { imageData: newImageData });
      } else if (activeTool === 'keep-island') {
        const img = images.get(currentFrame.id);
        if (img) {
           const canvas = document.createElement('canvas');
           canvas.width = currentFrame.width;
           canvas.height = currentFrame.height;
           const ctx = canvas.getContext('2d')!;
           ctx.drawImage(img, 0, 0);
           const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
           
           const changed = keepConnected(
             imageData.data,
             canvas.width,
             canvas.height,
             x,
             y
           );

           if (changed) {
             ctx.putImageData(imageData, 0, 0);
             updateFrame(selectedAnimationId, currentFrame.id, { imageData: canvas.toDataURL('image/png') });
           }
        }
      }
    }
  };

  const isDrawing = useRef(false);
  const drawingCanvas = useRef<HTMLCanvasElement | null>(null);
  const smartEraserTarget = useRef<Pixel | null>(null);

  const startDrawing = (e: any) => {
    if (activeTool === 'box-select') {
      const node = e.target;
      const transform = node.getAbsoluteTransform().copy();
      transform.invert();
      const posAbs = node.getStage().getPointerPosition();
      const localPos = transform.point(posAbs);

      if (localPos) {
        isSelecting.current = true;
        // Adjust for image offset if we clicked the backdrop
        // Backdrop is at same pos as image? No, let's make backdrop cover a large area
        // Actually, let's just use the localPos which is relative to the Group
        selectionStart.current = { x: localPos.x, y: localPos.y };
        setSelectionBox({ x: localPos.x, y: localPos.y, w: 0, h: 0 });
      }
      return;
    }

    if (activeTool !== 'brush' && activeTool !== 'eraser' && activeTool !== 'smart-eraser') return;
    if (!currentFrame || !selectedAnimationId) return;

    isDrawing.current = true;
    
    // Create a temp canvas to draw on
    const canvas = document.createElement('canvas');
    canvas.width = currentFrame.width;
    canvas.height = currentFrame.height;
    const ctx = canvas.getContext('2d')!;
    
    const img = images.get(currentFrame.id);
    if (img) ctx.drawImage(img, 0, 0);
    
    drawingCanvas.current = canvas;

    if (activeTool === 'smart-eraser') {
       const pos = e.target.getRelativePointerPosition();
       if (pos) {
         const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
         smartEraserTarget.current = getPixel(data, Math.floor(pos.x), Math.floor(pos.y), canvas.width);
         // Also apply immediately at start pos
         draw(e);
       }
    } else {
       draw(e);
    }
  };

  const draw = (e: any) => {
    if (activeTool === 'box-select') {
      if (!isSelecting.current || !selectionStart.current) return;
      const node = e.target;
      const transform = node.getAbsoluteTransform().copy();
      transform.invert();
      const posAbs = node.getStage().getPointerPosition();
      const localPos = transform.point(posAbs);

      if (localPos) {
        const x = Math.min(selectionStart.current.x, localPos.x);
        const y = Math.min(selectionStart.current.y, localPos.y);
        const w = Math.abs(localPos.x - selectionStart.current.x);
        const h = Math.abs(localPos.y - selectionStart.current.y);
        setSelectionBox({ x, y, w, h });
      }
      return;
    }

    if (!isDrawing.current || !drawingCanvas.current) return;
    
    const pos = e.target.getRelativePointerPosition();
    if (!pos) return;
    const ctx = drawingCanvas.current.getContext('2d')!;
    
    if (activeTool === 'smart-eraser') {
        if (!smartEraserTarget.current) return;
        const radius = brushSize; 
        const imageData = ctx.getImageData(0, 0, drawingCanvas.current.width, drawingCanvas.current.height);
        
        const changed = eraseColorLocal(
          imageData.data,
          imageData.width,
          imageData.height,
          Math.floor(pos.x),
          Math.floor(pos.y),
          radius,
          smartEraserTarget.current,
          fuzzyThreshold
        );

        if (changed) {
          ctx.putImageData(imageData, 0, 0);
        }
        return;
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = brushSize;
    
    if (activeTool === 'brush') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#ff0000'; // TODO: configurable color
    } else {
      ctx.globalCompositeOperation = 'destination-out';
    }

    // We should ideally track last pos for smooth lines, but for now simple dots
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const stopDrawing = () => {
    if (activeTool === 'box-select') {
      isSelecting.current = false;
      return;
    }

    if (!isDrawing.current || !drawingCanvas.current || !selectedAnimationId || !currentFrame) return;
    isDrawing.current = false;
    
    const newImageData = drawingCanvas.current.toDataURL('image/png');
    updateFrame(selectedAnimationId, currentFrame.id, { imageData: newImageData });
    drawingCanvas.current = null;
  };
  
  const handleMouseMove = (e: any) => {
    // Update cursor position
    const pos = e.target.getRelativePointerPosition();
    if (pos) {
      setCursorPos({ x: pos.x, y: pos.y });
    }
    
    draw(e);
  };
  
  const handleMouseLeave = () => {
    setCursorPos(null);
    stopDrawing();
  };

  // Build onion skin frames
  const onionFrames: { frame: typeof currentFrame; opacity: number }[] = [];
  if (onionSkin.enabled && frames.length > 1) {
    for (let i = 1; i <= onionSkin.prevCount; i++) {
      const idx = currentFrameIndex - i;
      if (idx >= 0 && frames[idx]) {
        onionFrames.push({
          frame: frames[idx],
          opacity: onionSkin.opacity * (1 - (i - 1) / onionSkin.prevCount),
        });
      }
    }
    for (let i = 1; i <= onionSkin.nextCount; i++) {
      const idx = currentFrameIndex + i;
      if (idx < frames.length && frames[idx]) {
        onionFrames.push({
          frame: frames[idx],
          opacity: onionSkin.opacity * (1 - (i - 1) / onionSkin.nextCount),
        });
      }
    }
  }

  return (
    <>
      {/* Onion skin frames */}
      {onionFrames.map(({ frame: oFrame, opacity }, i) => {
        const img = oFrame ? images.get(oFrame.id) : null;
        if (!img || !oFrame) return null;
        return (
          <KonvaImage
            key={`onion-${i}`}
            image={img}
            x={-oFrame.width / 2 + oFrame.offsetX}
            y={-oFrame.height / 2 + oFrame.offsetY}
            opacity={opacity}
            filters={[]} // TODO: Apply tint
            listening={false}
          />
        );
      })}

      {/* Box Select Backdrop - huge transparent area to catch outside clicks */}
      {activeTool === 'box-select' && currentFrame && (
        <Rect
          x={-currentFrame.width * 5}
          y={-currentFrame.height * 5}
          width={currentFrame.width * 10}
          height={currentFrame.height * 10}
          fill="transparent"
          listening={true}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
        />
      )}

      {/* Current frame */}
      {currentFrame && images.get(currentFrame.id) && (
        <KonvaImage
          image={images.get(currentFrame.id)!}
          x={-currentFrame.width / 2 + currentFrame.offsetX}
          y={-currentFrame.height / 2 + currentFrame.offsetY}
          onClick={handleFrameClick}
          onMouseDown={startDrawing}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDrawing}
          onMouseLeave={handleMouseLeave}
          listening={activeTool !== 'select'}
        />
      )}

      {/* Brush Cursor */}
      {cursorPos && (activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'smart-eraser') && currentFrame && (
        <Circle
          x={-currentFrame.width / 2 + currentFrame.offsetX + cursorPos.x}
          y={-currentFrame.height / 2 + currentFrame.offsetY + cursorPos.y}
          radius={brushSize / 2}
          stroke={activeTool === 'eraser' ? 'white' : 'black'} // Contrast
          strokeWidth={1}
          fill="transparent"
          listening={false}
        />
      )}

      {/* Selection Box */}
      {selectionBox && (
        <Rect
          x={-currentFrame.width / 2 + currentFrame.offsetX + selectionBox.x}
          y={-currentFrame.height / 2 + currentFrame.offsetY + selectionBox.y}
          width={selectionBox.w}
          height={selectionBox.h}
          stroke="#00e5ff"
          strokeWidth={1}
          fill="rgba(0, 229, 255, 0.1)"
          listening={false}
        />
      )}
    </>
  );
}
