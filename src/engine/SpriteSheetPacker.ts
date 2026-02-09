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

export interface PackSourceFrame {
  frameId: string;
  width: number;
  height: number;
  sourceIndex: number;
  image: CanvasImageSource;
}

export interface PackConstraints {
  maxSheetWidth?: number;
  maxSheetHeight?: number;
}

function normalizeLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit) || limit <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.floor(limit);
}

export function packSpriteSheet(
  frames: Frame[],
  images: Map<string, HTMLImageElement>,
  layout: PackLayout = 'row',
  padding: number = 1,
  constraints?: PackConstraints
): PackResult | null {
  const sources: PackSourceFrame[] = [];

  frames.forEach((frame, index) => {
    const image = images.get(frame.id);
    if (!image) return;
    sources.push({
      frameId: frame.id,
      width: frame.width,
      height: frame.height,
      sourceIndex: index,
      image,
    });
  });

  return packSpriteSheetSources(sources, layout, padding, constraints);
}

export function packSpriteSheetSources(
  sources: PackSourceFrame[],
  layout: PackLayout = 'row',
  padding: number = 1,
  constraints?: PackConstraints
): PackResult | null {
  if (sources.length === 0) return null;

  const maxSheetWidth = normalizeLimit(constraints?.maxSheetWidth);
  const maxSheetHeight = normalizeLimit(constraints?.maxSheetHeight);

  let sheetWidth: number;
  let sheetHeight: number;
  const packed: PackedFrame[] = [];

  if (layout === 'row') {
    if (maxSheetWidth === Number.POSITIVE_INFINITY) {
      sheetWidth = sources.reduce((sum, f) => sum + f.width + padding, -padding);
      sheetHeight = Math.max(...sources.map((f) => f.height));

      let x = 0;
      sources.forEach((frame) => {
        packed.push({
          frameId: frame.frameId,
          x,
          y: 0,
          width: frame.width,
          height: frame.height,
          sourceIndex: frame.sourceIndex,
        });
        x += frame.width + padding;
      });
    } else {
      let x = 0;
      let y = 0;
      let rowHeight = 0;
      let maxUsedWidth = 0;

      for (const frame of sources) {
        if (frame.width > maxSheetWidth || frame.height > maxSheetHeight) {
          return null;
        }

        if (x > 0 && x + frame.width > maxSheetWidth) {
          x = 0;
          y += rowHeight + padding;
          rowHeight = 0;
        }

        if (y + frame.height > maxSheetHeight) {
          return null;
        }

        packed.push({
          frameId: frame.frameId,
          x,
          y,
          width: frame.width,
          height: frame.height,
          sourceIndex: frame.sourceIndex,
        });

        x += frame.width + padding;
        rowHeight = Math.max(rowHeight, frame.height);
        maxUsedWidth = Math.max(maxUsedWidth, x - padding);
      }

      sheetWidth = maxUsedWidth;
      sheetHeight = y + rowHeight;
    }
  } else if (layout === 'column') {
    if (maxSheetHeight === Number.POSITIVE_INFINITY) {
      sheetWidth = Math.max(...sources.map((f) => f.width));
      sheetHeight = sources.reduce((sum, f) => sum + f.height + padding, -padding);

      let y = 0;
      sources.forEach((frame) => {
        packed.push({
          frameId: frame.frameId,
          x: 0,
          y,
          width: frame.width,
          height: frame.height,
          sourceIndex: frame.sourceIndex,
        });
        y += frame.height + padding;
      });
    } else {
      let x = 0;
      let y = 0;
      let columnWidth = 0;
      let maxUsedHeight = 0;

      for (const frame of sources) {
        if (frame.width > maxSheetWidth || frame.height > maxSheetHeight) {
          return null;
        }

        if (y > 0 && y + frame.height > maxSheetHeight) {
          y = 0;
          x += columnWidth + padding;
          columnWidth = 0;
        }

        if (x + frame.width > maxSheetWidth) {
          return null;
        }

        packed.push({
          frameId: frame.frameId,
          x,
          y,
          width: frame.width,
          height: frame.height,
          sourceIndex: frame.sourceIndex,
        });

        y += frame.height + padding;
        columnWidth = Math.max(columnWidth, frame.width);
        maxUsedHeight = Math.max(maxUsedHeight, y - padding);
      }

      sheetWidth = x + columnWidth;
      sheetHeight = maxUsedHeight;
    }
  } else {
    // Grid layout
    const maxW = Math.max(...sources.map((f) => f.width));
    const maxH = Math.max(...sources.map((f) => f.height));
    if (maxW > maxSheetWidth || maxH > maxSheetHeight) {
      return null;
    }

    let cols = Math.ceil(Math.sqrt(sources.length));
    if (
      maxSheetWidth !== Number.POSITIVE_INFINITY ||
      maxSheetHeight !== Number.POSITIVE_INFINITY
    ) {
      const maxCols = Math.max(
        1,
        Math.floor((maxSheetWidth + padding) / (maxW + padding))
      );
      const maxRows = Math.max(
        1,
        Math.floor((maxSheetHeight + padding) / (maxH + padding))
      );

      if (maxCols < 1 || maxRows < 1) {
        return null;
      }

      const minColsForHeight = Math.ceil(sources.length / maxRows);
      cols = Math.max(minColsForHeight, 1);
      if (cols > maxCols) {
        return null;
      }
    }

    const rows = Math.ceil(sources.length / cols);

    sheetWidth = cols * (maxW + padding) - padding;
    sheetHeight = rows * (maxH + padding) - padding;

    sources.forEach((frame, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      packed.push({
        frameId: frame.frameId,
        x: col * (maxW + padding),
        y: row * (maxH + padding),
        width: frame.width,
        height: frame.height,
        sourceIndex: frame.sourceIndex,
      });
    });
  }

  if (
    sheetWidth > maxSheetWidth ||
    sheetHeight > maxSheetHeight ||
    sheetWidth <= 0 ||
    sheetHeight <= 0
  ) {
    return null;
  }

  // Render to canvas
  const canvas = document.createElement('canvas');
  canvas.width = sheetWidth;
  canvas.height = sheetHeight;
  const ctx = canvas.getContext('2d')!;

  // Transparent background
  ctx.clearRect(0, 0, sheetWidth, sheetHeight);
  const sourceById = new Map(sources.map((s) => [s.frameId, s]));

  packed.forEach((p) => {
    const frame = sourceById.get(p.frameId);
    if (!frame) return;
    ctx.drawImage(frame.image, p.x, p.y, p.width, p.height);
  });

  return { canvas, frames: packed, sheetWidth, sheetHeight };
}
