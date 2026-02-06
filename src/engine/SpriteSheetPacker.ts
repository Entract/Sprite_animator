import type { Frame } from '../types/animation';

export interface PackedFrame {
  frameId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sourceIndex: number;
}

export interface PackResult {
  canvas: HTMLCanvasElement;
  frames: PackedFrame[];
  sheetWidth: number;
  sheetHeight: number;
}

export type PackLayout = 'row' | 'column' | 'grid';

export function packSpriteSheet(
  frames: Frame[],
  images: Map<string, HTMLImageElement>,
  layout: PackLayout = 'row',
  padding: number = 1
): PackResult | null {
  if (frames.length === 0) return null;

  const validFrames = frames.filter((f) => images.has(f.id));
  if (validFrames.length === 0) return null;

  let sheetWidth: number;
  let sheetHeight: number;
  const packed: PackedFrame[] = [];

  if (layout === 'row') {
    sheetWidth = validFrames.reduce((sum, f) => sum + f.width + padding, -padding);
    sheetHeight = Math.max(...validFrames.map((f) => f.height));

    let x = 0;
    validFrames.forEach((frame, i) => {
      packed.push({
        frameId: frame.id,
        x,
        y: 0,
        width: frame.width,
        height: frame.height,
        sourceIndex: i,
      });
      x += frame.width + padding;
    });
  } else if (layout === 'column') {
    sheetWidth = Math.max(...validFrames.map((f) => f.width));
    sheetHeight = validFrames.reduce((sum, f) => sum + f.height + padding, -padding);

    let y = 0;
    validFrames.forEach((frame, i) => {
      packed.push({
        frameId: frame.id,
        x: 0,
        y,
        width: frame.width,
        height: frame.height,
        sourceIndex: i,
      });
      y += frame.height + padding;
    });
  } else {
    // Grid layout
    const cols = Math.ceil(Math.sqrt(validFrames.length));
    const maxW = Math.max(...validFrames.map((f) => f.width));
    const maxH = Math.max(...validFrames.map((f) => f.height));
    const rows = Math.ceil(validFrames.length / cols);

    sheetWidth = cols * (maxW + padding) - padding;
    sheetHeight = rows * (maxH + padding) - padding;

    validFrames.forEach((frame, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      packed.push({
        frameId: frame.id,
        x: col * (maxW + padding),
        y: row * (maxH + padding),
        width: frame.width,
        height: frame.height,
        sourceIndex: i,
      });
    });
  }

  // Render to canvas
  const canvas = document.createElement('canvas');
  canvas.width = sheetWidth;
  canvas.height = sheetHeight;
  const ctx = canvas.getContext('2d')!;

  // Transparent background
  ctx.clearRect(0, 0, sheetWidth, sheetHeight);

  packed.forEach((p) => {
    const frame = validFrames.find((f) => f.id === p.frameId);
    if (!frame) return;
    const img = images.get(frame.id);
    if (!img) return;
    ctx.drawImage(img, p.x, p.y, p.width, p.height);
  });

  return { canvas, frames: packed, sheetWidth, sheetHeight };
}
