import type { Skeleton } from '../types/skeleton';
import { degToRad } from '../utils/math';

export interface Transform {
  x: number;
  y: number;
  rotation: number; // degrees
  scaleX: number;
  scaleY: number;
}

export function resolveSkeleton(skeleton: Skeleton): Map<string, Transform> {
  const transforms = new Map<string, Transform>();
  
  const resolveBone = (boneId: string): Transform => {
    if (transforms.has(boneId)) return transforms.get(boneId)!;
    
    const bone = skeleton.bones.find(b => b.id === boneId);
    if (!bone) return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    
    const local: Transform = {
      x: bone.x,
      y: bone.y,
      rotation: bone.rotation,
      scaleX: bone.scaleX,
      scaleY: bone.scaleY
    };

    if (!bone.parentId) {
      transforms.set(boneId, local);
      return local;
    }
    
    const parentWorld = resolveBone(bone.parentId);
    const world = applyTransform(parentWorld, local);
    
    transforms.set(boneId, world);
    return world;
  };
  
  skeleton.bones.forEach(b => resolveBone(b.id));
  
  return transforms;
}

function applyTransform(parent: Transform, local: Transform): Transform {
   const rad = degToRad(parent.rotation);
   const cos = Math.cos(rad);
   const sin = Math.sin(rad);
   
   // Local position is relative to parent's origin, scaled and rotated
   const lx = local.x * parent.scaleX;
   const ly = local.y * parent.scaleY;
   
   const wx = parent.x + lx * cos - ly * sin;
   const wy = parent.y + lx * sin + ly * cos;
   
   const wRotation = parent.rotation + local.rotation;
   const wScaleX = parent.scaleX * local.scaleX;
   const wScaleY = parent.scaleY * local.scaleY;
   
   return {
     x: wx,
     y: wy,
     rotation: wRotation,
     scaleX: wScaleX,
     scaleY: wScaleY
   };
}
