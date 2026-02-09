import type { Animation, Frame } from '../types/animation';
import type { Skeleton } from '../types/skeleton';
import { packSpriteSheetSources, type PackLayout } from './SpriteSheetPacker';
import { downloadBlob, downloadJson } from '../utils/fileUtils';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export type ExportImageFormat = 'png' | 'webp';
export type ExportCanvasMode = 'source' | 'fixed';
export type ExportPivotMode = 'center' | 'bottom-center' | 'custom';
export type ExportSourcePivotMode = 'frame-offset' | 'opaque-bottom-center' | 'opaque-center';
export type ExportSmoothing = 'pixelated' | 'smooth';
export type ExportDestination = 'download' | 'directory';

export interface AnimationExportOptions {
  folderName: string;
  destination: ExportDestination;
  directoryHandle?: FileSystemDirectoryHandle | null;
  layout: PackLayout;
  padding: number;
  includeJson: boolean;
  includeSpriteSheet: boolean;
  includeSequence: boolean;
  format: ExportImageFormat;
  webpQuality: number; // 0..1
  canvasMode: ExportCanvasMode;
  canvasWidth: number;
  canvasHeight: number;
  pivotMode: ExportPivotMode;
  pivotX: number;
  pivotY: number;
  sourcePivotMode: ExportSourcePivotMode;
  fitToCanvas: boolean;
  targetSpriteHeight: number | null;
  smoothing: ExportSmoothing;
}

export interface LegacyExportOptions {
  layout: PackLayout;
  padding: number;
  includeJson: boolean;
}

interface PreparedFrame {
  frameId: string;
  sourceIndex: number;
  exportIndex: number;
  sourceFileName: string;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  pivotX: number;
  pivotY: number;
  drawX: number;
  drawY: number;
  durationMs: number | null;
  canvas: HTMLCanvasElement;
}

interface ExportFile {
  path: string;
  blob: Blob;
}

interface OpaqueBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function sanitizeFolderName(name: string): string {
  let normalized = '';
  for (const ch of name) {
    normalized += ch.charCodeAt(0) < 32 ? '_' : ch;
  }

  const cleaned = normalized
    .trim()
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'animation_export';
}

function createJsonBlob(data: unknown): Blob {
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

function getMimeAndExtension(format: ExportImageFormat): {
  mimeType: string;
  extension: 'png' | 'webp';
} {
  if (format === 'webp') {
    return { mimeType: 'image/webp', extension: 'webp' };
  }
  return { mimeType: 'image/png', extension: 'png' };
}

function toCanvasBlob(
  canvas: HTMLCanvasElement,
  format: ExportImageFormat,
  webpQuality: number
): Promise<Blob> {
  const { mimeType } = getMimeAndExtension(format);
  const quality =
    format === 'webp' ? Math.max(0, Math.min(1, webpQuality)) : undefined;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode image blob'));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}

function getOpaqueBounds(image: HTMLImageElement): OpaqueBounds | null {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (w <= 0 || h <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function resolvePivot(
  mode: ExportPivotMode,
  canvasWidth: number,
  canvasHeight: number,
  customX: number,
  customY: number
): { x: number; y: number } {
  if (mode === 'center') {
    return {
      x: Math.round(canvasWidth / 2),
      y: Math.round(canvasHeight / 2),
    };
  }
  if (mode === 'bottom-center') {
    return {
      x: Math.round(canvasWidth / 2),
      y: Math.max(0, canvasHeight - 1),
    };
  }
  return {
    x: Math.max(0, Math.min(canvasWidth - 1, Math.round(customX))),
    y: Math.max(0, Math.min(canvasHeight - 1, Math.round(customY))),
  };
}

function prepareFrames(
  animation: Animation,
  images: Map<string, HTMLImageElement>,
  options: AnimationExportOptions
): PreparedFrame[] {
  const validInputs: { frame: Frame; image: HTMLImageElement; sourceIndex: number }[] = [];

  animation.frames.forEach((frame, sourceIndex) => {
    const image = images.get(frame.id);
    if (!image) return;
    validInputs.push({ frame, image, sourceIndex });
  });

  if (validInputs.length === 0) {
    throw new Error('No frames could be loaded for export');
  }

  const opaqueBoundsByFrameId = new Map<string, OpaqueBounds | null>();
  const getBoundsForFrame = (frame: Frame, image: HTMLImageElement): OpaqueBounds | null => {
    const cached = opaqueBoundsByFrameId.get(frame.id);
    if (cached !== undefined) return cached;
    const bounds = getOpaqueBounds(image);
    opaqueBoundsByFrameId.set(frame.id, bounds);
    return bounds;
  };

  const getSourcePivot = (
    frame: Frame,
    image: HTMLImageElement
  ): { x: number; y: number } => {
    if (options.sourcePivotMode === 'frame-offset') {
      return {
        x: frame.width / 2 - frame.offsetX,
        y: frame.height / 2 - frame.offsetY,
      };
    }

    const bounds = getBoundsForFrame(frame, image);
    if (!bounds) {
      return {
        x: frame.width / 2 - frame.offsetX,
        y: frame.height / 2 - frame.offsetY,
      };
    }

    if (options.sourcePivotMode === 'opaque-center') {
      return {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      };
    }

    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height - 1,
    };
  };

  const frameSources = validInputs.map(({ frame, image, sourceIndex }) => ({
    frame,
    image,
    sourceIndex,
    sourcePivot: getSourcePivot(frame, image),
  }));

  let tallestOpaqueHeight = 0;
  frameSources.forEach(({ frame, image }) => {
    const bounds = getBoundsForFrame(frame, image);
    const h = bounds?.height ?? frame.height;
    if (h > tallestOpaqueHeight) tallestOpaqueHeight = h;
  });

  let uniformScale = 1;
  let fixedCanvasWidth = 0;
  let fixedCanvasHeight = 0;
  let fixedPivot = { x: 0, y: 0 };

  if (options.canvasMode === 'fixed') {
    fixedCanvasWidth = Math.max(1, Math.round(options.canvasWidth));
    fixedCanvasHeight = Math.max(1, Math.round(options.canvasHeight));
    fixedPivot = resolvePivot(
      options.pivotMode,
      fixedCanvasWidth,
      fixedCanvasHeight,
      options.pivotX,
      options.pivotY
    );

    // Height normalization mode: tallest frame fills canvas height.
    if (options.fitToCanvas && tallestOpaqueHeight > 0) {
      uniformScale = fixedCanvasHeight / tallestOpaqueHeight;
    }
  }

  if (options.targetSpriteHeight && options.targetSpriteHeight > 0 && tallestOpaqueHeight > 0) {
    uniformScale = options.targetSpriteHeight / tallestOpaqueHeight;
  }

  const totalScale = uniformScale;

  return frameSources.map(({ frame, image, sourceIndex, sourcePivot }, exportIndex) => {
    const scaledWidth = Math.max(1, Math.round(frame.width * totalScale));
    const scaledHeight = Math.max(1, Math.round(frame.height * totalScale));
    const scaledPivotX = sourcePivot.x * totalScale;
    const scaledPivotY = sourcePivot.y * totalScale;

    let outputWidth = scaledWidth;
    let outputHeight = scaledHeight;
    let pivotX = Math.round(scaledPivotX);
    let pivotY = Math.round(scaledPivotY);

    if (options.canvasMode === 'fixed') {
      outputWidth = fixedCanvasWidth;
      outputHeight = fixedCanvasHeight;
      pivotX = fixedPivot.x;
      pivotY = fixedPivot.y;
    }

    const drawX = Math.round(pivotX - scaledPivotX);
    const drawY = Math.round(pivotY - scaledPivotY);

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not create canvas context for export');
    }

    ctx.clearRect(0, 0, outputWidth, outputHeight);
    ctx.imageSmoothingEnabled = options.smoothing === 'smooth';
    if (ctx.imageSmoothingEnabled) {
      ctx.imageSmoothingQuality = 'high';
    }
    ctx.drawImage(image, drawX, drawY, scaledWidth, scaledHeight);

    return {
      frameId: frame.id,
      sourceIndex,
      exportIndex,
      sourceFileName: frame.fileName,
      sourceWidth: frame.width,
      sourceHeight: frame.height,
      outputWidth,
      outputHeight,
      pivotX,
      pivotY,
      drawX,
      drawY,
      durationMs: frame.duration ?? null,
      canvas,
    };
  });
}

async function saveAsZip(folderName: string, files: ExportFile[]): Promise<void> {
  const zip = new JSZip();
  const root = zip.folder(folderName) || zip;
  files.forEach((file) => {
    root.file(file.path, file.blob);
  });
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveAs(zipBlob, `${folderName}.zip`);
}

async function requestWritePermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const permissionAwareHandle = handle as FileSystemDirectoryHandle & {
    queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
  };

  if (!permissionAwareHandle.queryPermission || !permissionAwareHandle.requestPermission) {
    return true;
  }

  const descriptor = { mode: 'readwrite' } as const;
  if ((await permissionAwareHandle.queryPermission(descriptor)) === 'granted') return true;
  return (await permissionAwareHandle.requestPermission(descriptor)) === 'granted';
}

async function writeFilesToDirectory(
  rootHandle: FileSystemDirectoryHandle,
  folderName: string,
  files: ExportFile[]
): Promise<void> {
  const allowed = await requestWritePermission(rootHandle);
  if (!allowed) {
    throw new Error('Write permission to selected folder was denied');
  }

  const exportFolder = await rootHandle.getDirectoryHandle(folderName, { create: true });
  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean);
    if (segments.length === 0) continue;

    let currentDir = exportFolder;
    for (let i = 0; i < segments.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(segments[i], { create: true });
    }

    const fileName = segments[segments.length - 1];
    const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file.blob);
    await writable.close();
  }
}

export async function exportAnimationPackage(
  animation: Animation,
  images: Map<string, HTMLImageElement>,
  options: AnimationExportOptions
): Promise<void> {
  if (!options.includeSpriteSheet && !options.includeSequence) {
    throw new Error('Select at least one output: spritesheet or sequence');
  }

  const folderName = sanitizeFolderName(options.folderName || animation.name);
  const prepared = prepareFrames(animation, images, options);
  const { extension } = getMimeAndExtension(options.format);
  const files: ExportFile[] = [];

  let spriteSheetSummary:
    | {
        file: string;
        width: number;
        height: number;
        frameRects: Map<number, { x: number; y: number; width: number; height: number }>;
      }
    | null = null;

  if (options.includeSpriteSheet) {
    const maxSpriteSheetDimension = options.format === 'webp' ? 16383 : 32767;
    const packResult = packSpriteSheetSources(
      prepared.map((frame) => ({
        frameId: frame.frameId,
        width: frame.outputWidth,
        height: frame.outputHeight,
        sourceIndex: frame.sourceIndex,
        image: frame.canvas,
      })),
      options.layout,
      options.padding,
      {
        maxSheetWidth: maxSpriteSheetDimension,
        maxSheetHeight: maxSpriteSheetDimension,
      }
    );

    if (!packResult) {
      throw new Error(
        `Could not pack spritesheet within ${maxSpriteSheetDimension}x${maxSpriteSheetDimension}. Reduce canvas size, padding, or frame count.`
      );
    }

    const sheetFile = `spritesheet.${extension}`;
    const sheetBlob = await toCanvasBlob(packResult.canvas, options.format, options.webpQuality);
    files.push({ path: sheetFile, blob: sheetBlob });

    const rects = new Map<number, { x: number; y: number; width: number; height: number }>();
    packResult.frames.forEach((frame) => {
      rects.set(frame.sourceIndex, {
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
      });
    });

    spriteSheetSummary = {
      file: sheetFile,
      width: packResult.sheetWidth,
      height: packResult.sheetHeight,
      frameRects: rects,
    };
  }

  const sequenceFilesBySourceIndex = new Map<number, string>();
  if (options.includeSequence) {
    for (const frame of prepared) {
      const fileName = `frame_${frame.exportIndex.toString().padStart(3, '0')}.${extension}`;
      const filePath = `frames/${fileName}`;
      const frameBlob = await toCanvasBlob(frame.canvas, options.format, options.webpQuality);
      files.push({ path: filePath, blob: frameBlob });
      sequenceFilesBySourceIndex.set(frame.sourceIndex, filePath);
    }
  }

  if (options.includeJson) {
    const metadata = {
      version: 2,
      name: animation.name,
      folderName,
      fps: animation.fps,
      loop: animation.loop,
      format: options.format,
      canvas:
        options.canvasMode === 'fixed'
          ? {
              mode: 'fixed',
              width: Math.max(1, Math.round(options.canvasWidth)),
              height: Math.max(1, Math.round(options.canvasHeight)),
              pivotMode: options.pivotMode,
              sourcePivotMode: options.sourcePivotMode,
              fitToCanvas: options.fitToCanvas,
              pivotX:
                options.pivotMode === 'custom'
                  ? Math.round(options.pivotX)
                  : undefined,
              pivotY:
                options.pivotMode === 'custom'
                  ? Math.round(options.pivotY)
                  : undefined,
            }
          : { mode: 'source' },
      targetSpriteHeight: options.targetSpriteHeight,
      outputs: {
        spritesheet: spriteSheetSummary
          ? {
              file: spriteSheetSummary.file,
              width: spriteSheetSummary.width,
              height: spriteSheetSummary.height,
              layout: options.layout,
              padding: options.padding,
            }
          : null,
        sequence:
          sequenceFilesBySourceIndex.size > 0
            ? {
                folder: 'frames',
                frameCount: sequenceFilesBySourceIndex.size,
              }
            : null,
      },
      frames: prepared.map((frame) => {
        const sheetRect = spriteSheetSummary?.frameRects.get(frame.sourceIndex) ?? null;
        return {
          index: frame.exportIndex,
          sourceIndex: frame.sourceIndex,
          sourceFileName: frame.sourceFileName,
          sourceWidth: frame.sourceWidth,
          sourceHeight: frame.sourceHeight,
          width: frame.outputWidth,
          height: frame.outputHeight,
          pivotX: frame.pivotX,
          pivotY: frame.pivotY,
          drawX: frame.drawX,
          drawY: frame.drawY,
          durationMs: frame.durationMs,
          sequenceFile: sequenceFilesBySourceIndex.get(frame.sourceIndex) ?? null,
          sheet: sheetRect,
        };
      }),
    };

    files.push({ path: 'animation.json', blob: createJsonBlob(metadata) });
  }

  if (options.destination === 'directory') {
    if (!options.directoryHandle) {
      throw new Error('No destination folder selected');
    }
    await writeFilesToDirectory(options.directoryHandle, folderName, files);
    return;
  }

  await saveAsZip(folderName, files);
}

export async function exportPngSequence(
  animation: Animation,
  images: Map<string, HTMLImageElement>
): Promise<void> {
  await exportAnimationPackage(animation, images, {
    folderName: animation.name,
    destination: 'download',
    layout: 'row',
    padding: 1,
    includeJson: true,
    includeSpriteSheet: false,
    includeSequence: true,
    format: 'png',
    webpQuality: 0.92,
    canvasMode: 'source',
    canvasWidth: 256,
    canvasHeight: 256,
    pivotMode: 'bottom-center',
    pivotX: 128,
    pivotY: 255,
    sourcePivotMode: 'opaque-bottom-center',
    fitToCanvas: true,
    targetSpriteHeight: null,
    smoothing: 'pixelated',
  });
}

export async function exportAnimation(
  animation: Animation,
  images: Map<string, HTMLImageElement>,
  options: LegacyExportOptions
): Promise<void> {
  await exportAnimationPackage(animation, images, {
    folderName: animation.name,
    destination: 'download',
    layout: options.layout,
    padding: options.padding,
    includeJson: options.includeJson,
    includeSpriteSheet: true,
    includeSequence: false,
    format: 'png',
    webpQuality: 0.92,
    canvasMode: 'source',
    canvasWidth: 256,
    canvasHeight: 256,
    pivotMode: 'bottom-center',
    pivotX: 128,
    pivotY: 255,
    sourcePivotMode: 'opaque-bottom-center',
    fitToCanvas: true,
    targetSpriteHeight: null,
    smoothing: 'pixelated',
  });
}

// Spine-inspired skeleton export format
export interface SkeletonExportData {
  skeleton: {
    name: string;
    width: number;
    height: number;
  };
  bones: {
    name: string;
    parent?: string;
    length: number;
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
  }[];
  ik?: {
    name: string;
    bones: string[];
    target: string;
    bendPositive: boolean;
    mix: number;
  }[];
  slots: {
    name: string;
    bone: string;
    attachment?: string;
  }[];
  skins: {
    name: string;
    attachments: {
      [slotName: string]: {
        [attachmentName: string]: {
          type: string;
          width: number;
          height: number;
          x: number;
          y: number;
          rotation: number;
          scaleX: number;
          scaleY: number;
        };
      };
    };
  }[];
  animations: {
    [animName: string]: {
      bones: {
        [boneName: string]: {
          rotate?: { time: number; angle: number; curve?: string | number[] }[];
          translate?: { time: number; x: number; y: number; curve?: string | number[] }[];
          scale?: { time: number; x: number; y: number; curve?: string | number[] }[];
        };
      };
      ik?: {
        [constraintName: string]: {
          time: number;
          mix?: number;
          bendPositive?: boolean;
        }[];
      };
    };
  };
}

export function exportSkeleton(skeleton: Skeleton): void {
  const boneNameMap = new Map<string, string>();
  skeleton.bones.forEach(b => boneNameMap.set(b.id, b.name));

  const slotNameMap = new Map<string, string>();
  skeleton.slots.forEach(s => slotNameMap.set(s.id, s.name));

  // Build export data
  const exportData: SkeletonExportData = {
    skeleton: {
      name: skeleton.name,
      width: 512,  // Could be computed from bounds
      height: 512,
    },
    bones: skeleton.bones.map(b => {
      const bone: SkeletonExportData['bones'][0] = {
        name: b.name,
        length: b.length,
        x: b.x,
        y: b.y,
        rotation: b.rotation,
        scaleX: b.scaleX,
        scaleY: b.scaleY,
      };
      if (b.parentId) {
        bone.parent = boneNameMap.get(b.parentId);
      }
      return bone;
    }),
    ik: skeleton.ikConstraints.map(ik => {
      // Find the bones in the chain
      const targetBone = skeleton.bones.find(b => b.id === ik.targetBoneId);
      const parentBone = targetBone?.parentId ? skeleton.bones.find(b => b.id === targetBone.parentId) : null;
      const bones: string[] = [];
      if (parentBone) bones.push(parentBone.name);
      if (targetBone) bones.push(targetBone.name);

      return {
        name: ik.name,
        bones,
        target: targetBone?.name || '',
        bendPositive: ik.bendPositive,
        mix: ik.mix,
      };
    }),
    slots: skeleton.slots.map(s => ({
      name: s.name,
      bone: boneNameMap.get(s.boneId) || 'root',
      attachment: s.attachment || undefined,
    })),
    skins: skeleton.skins.map(skin => {
      const attachments: SkeletonExportData['skins'][0]['attachments'] = {};

      for (const [slotId, attachment] of Object.entries(skin.attachments)) {
        const slotName = slotNameMap.get(slotId) || slotId;
        if (!attachments[slotName]) attachments[slotName] = {};

        attachments[slotName]['default'] = {
          type: attachment.type,
          width: attachment.width,
          height: attachment.height,
          x: attachment.x,
          y: attachment.y,
          rotation: attachment.rotation,
          scaleX: attachment.scaleX,
          scaleY: attachment.scaleY,
        };
      }

      return { name: skin.name, attachments };
    }),
    animations: {},
  };

  // Export animations
  for (const anim of skeleton.rigAnimations) {
    const animData: SkeletonExportData['animations'][string] = { bones: {} };

    for (const track of anim.tracks) {
      const boneName = boneNameMap.get(track.boneId);
      if (!boneName) continue;

      const boneAnim: {
        rotate?: { time: number; angle: number; curve?: string | number[] }[];
        translate?: { time: number; x: number; y: number; curve?: string | number[] }[];
        scale?: { time: number; x: number; y: number; curve?: string | number[] }[];
      } = {};

      // Group keyframes by property type
      const rotateKeys: typeof boneAnim.rotate = [];
      const translateKeys: typeof boneAnim.translate = [];
      const scaleKeys: typeof boneAnim.scale = [];

      for (const kf of track.keyframes) {
        const timeSec = kf.time / 1000; // Convert ms to seconds
        const curve = Array.isArray(kf.easing) ? kf.easing : kf.easing;

        if (kf.rotation !== undefined) {
          rotateKeys.push({ time: timeSec, angle: kf.rotation, curve });
        }
        if (kf.x !== undefined || kf.y !== undefined) {
          translateKeys.push({
            time: timeSec,
            x: kf.x ?? 0,
            y: kf.y ?? 0,
            curve
          });
        }
        if (kf.scaleX !== undefined || kf.scaleY !== undefined) {
          scaleKeys.push({
            time: timeSec,
            x: kf.scaleX ?? 1,
            y: kf.scaleY ?? 1,
            curve
          });
        }
      }

      if (rotateKeys.length > 0) boneAnim.rotate = rotateKeys;
      if (translateKeys.length > 0) boneAnim.translate = translateKeys;
      if (scaleKeys.length > 0) boneAnim.scale = scaleKeys;

      if (Object.keys(boneAnim).length > 0) {
        animData.bones[boneName] = boneAnim;
      }
    }

    exportData.animations[anim.name] = animData;
  }

  downloadJson(exportData, `${skeleton.name}_skeleton.json`);
}

// Export skeleton sprites as atlas
export async function exportSkeletonAtlas(
  skeleton: Skeleton,
  images: Map<string, HTMLImageElement>
): Promise<void> {
  // Collect all attachment images
  const attachments: { name: string; image: HTMLImageElement; attachment: typeof skeleton.skins[0]['attachments'][string] }[] = [];

  for (const skin of skeleton.skins) {
    for (const [slotId, attachment] of Object.entries(skin.attachments)) {
      const img = images.get(attachment.imageData);
      if (img) {
        attachments.push({ name: slotId, image: img, attachment });
      }
    }
  }

  if (attachments.length === 0) return;

  // Simple row packing
  const padding = 2;
  let totalWidth = 0;
  let maxHeight = 0;

  for (const att of attachments) {
    totalWidth += att.attachment.width + padding;
    maxHeight = Math.max(maxHeight, att.attachment.height);
  }

  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = maxHeight;
  const ctx = canvas.getContext('2d')!;

  let x = 0;
  const regions: { name: string; x: number; y: number; width: number; height: number }[] = [];

  for (const att of attachments) {
    ctx.drawImage(att.image, x, 0, att.attachment.width, att.attachment.height);
    regions.push({
      name: att.name,
      x,
      y: 0,
      width: att.attachment.width,
      height: att.attachment.height,
    });
    x += att.attachment.width + padding;
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png')
  );

  if (blob) {
    downloadBlob(blob, `${skeleton.name}_atlas.png`);
    downloadJson({ regions }, `${skeleton.name}_atlas.json`);
  }
}
