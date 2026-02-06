export type EasingType =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'step'
  | [number, number, number, number];

export interface Bone {
  id: string;
  name: string;
  parentId: string | null;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  length: number;
  pivotX: number;
  pivotY: number;
}

export interface Slot {
  id: string;
  boneId: string;
  name: string;
  zIndex: number;
  attachment: string | null;
}

export interface Attachment {
  type: 'sprite';
  imageData: string;
  fileName: string;
  width: number;
  height: number;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface Skin {
  name: string;
  attachments: Record<string, Attachment>;
}

export interface Keyframe {
  time: number;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  easing: EasingType;
}

export interface AnimationTrack {
  boneId: string;
  keyframes: Keyframe[];
}

export interface RigAnimation {
  id: string;
  name: string;
  duration: number;
  fps: number;
  loop: boolean;
  tracks: AnimationTrack[];
}

export interface Skeleton {
  id: string;
  name: string;
  bones: Bone[];
  slots: Slot[];
  skins: Skin[];
  rigAnimations: RigAnimation[];
}
