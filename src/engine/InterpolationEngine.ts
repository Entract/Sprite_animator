import BezierEasing from 'bezier-easing';
import type { Keyframe, EasingType } from '../types/skeleton';
import { lerp, lerpAngle } from '../utils/math';

// Cache for bezier functions to avoid recreation
const bezierCache = new Map<string, (x: number) => number>();

function getBezierEasing(easing: EasingType): (x: number) => number {
  if (easing === 'linear') return (x) => x;
  if (easing === 'step') return (x) => (x < 1 ? 0 : 1);
  
  // Predefined css-like keywords
  if (easing === 'ease-in') return getBezierEasing([0.42, 0, 1, 1]);
  if (easing === 'ease-out') return getBezierEasing([0, 0, 0.58, 1]);
  if (easing === 'ease-in-out') return getBezierEasing([0.42, 0, 0.58, 1]);

  if (Array.isArray(easing)) {
    const key = easing.join(',');
    if (!bezierCache.has(key)) {
      bezierCache.set(key, BezierEasing(easing[0], easing[1], easing[2], easing[3]));
    }
    return bezierCache.get(key)!;
  }

  return (x) => x;
}

export function interpolateKeyframes(k1: Keyframe, k2: Keyframe, time: number): Partial<Keyframe> {
  const duration = k2.time - k1.time;
  if (duration <= 0) return k1;

  const t = (time - k1.time) / duration;
  const ease = getBezierEasing(k1.easing || 'linear');
  const progress = ease(t);

  const result: Partial<Keyframe> = {};

  // Interpolate properties if they exist in both keyframes (or k1)
  // We assume if a property is missing in k1, we can't interpolate from it effectively 
  // without a default, but usually tracks are populated.
  
  if (k1.x !== undefined && k2.x !== undefined) result.x = lerp(k1.x, k2.x, progress);
  if (k1.y !== undefined && k2.y !== undefined) result.y = lerp(k1.y, k2.y, progress);
  
  if (k1.rotation !== undefined && k2.rotation !== undefined) {
    result.rotation = lerpAngle(k1.rotation, k2.rotation, progress);
  }
  
  if (k1.scaleX !== undefined && k2.scaleX !== undefined) result.scaleX = lerp(k1.scaleX, k2.scaleX, progress);
  if (k1.scaleY !== undefined && k2.scaleY !== undefined) result.scaleY = lerp(k1.scaleY, k2.scaleY, progress);

  return result;
}

export function evaluateTrackAtTime(keyframes: Keyframe[], time: number): Partial<Keyframe> | null {
  if (keyframes.length === 0) return null;

  // Sort just in case
  keyframes.sort((a, b) => a.time - b.time);

  // Before first frame
  if (time <= keyframes[0].time) return keyframes[0];

  // After last frame
  if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1];

  // Find surrounding frames
  for (let i = 0; i < keyframes.length - 1; i++) {
    const k1 = keyframes[i];
    const k2 = keyframes[i + 1];
    if (time >= k1.time && time < k2.time) {
      return interpolateKeyframes(k1, k2, time);
    }
  }

  return keyframes[keyframes.length - 1];
}
