import type { Animation } from '../types/animation';
import type { Skeleton } from '../types/skeleton';
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

  const blob = await new Promise<Blob | null>((resolve) =>
    result.canvas.toBlob(resolve, 'image/png')
  );

  if (blob) {
    downloadBlob(blob, `${animation.name}_spritesheet.png`);
  }

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
