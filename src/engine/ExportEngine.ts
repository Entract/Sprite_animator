import type { Animation } from '../types/animation';
import { packSpriteSheet, type PackLayout } from './SpriteSheetPacker';
import { downloadBlob, downloadJson } from '../utils/fileUtils';

export interface ExportOptions {
  layout: PackLayout;
  padding: number;
  includeJson: boolean;
}

export async function exportAnimation(
  animation: Animation,
  images: Map<string, HTMLImageElement>,
  options: ExportOptions
): Promise<void> {
  const result = packSpriteSheet(animation.frames, images, options.layout, options.padding);
  if (!result) return;

  // Export sprite sheet PNG
  const blob = await new Promise<Blob | null>((resolve) =>
    result.canvas.toBlob(resolve, 'image/png')
  );

  if (blob) {
    downloadBlob(blob, `${animation.name}_spritesheet.png`);
  }

  // Export JSON metadata
  if (options.includeJson) {
    const metadata = {
      name: animation.name,
      fps: animation.fps,
      loop: animation.loop,
      frameCount: animation.frames.length,
      sheetWidth: result.sheetWidth,
      sheetHeight: result.sheetHeight,
      frames: result.frames.map((f) => ({
        index: f.sourceIndex,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
      })),
    };
    downloadJson(metadata, `${animation.name}_data.json`);
  }
}
