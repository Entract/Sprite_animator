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

export interface IKConstraint {
  id: string;
  name: string;
  targetBoneId: string;    // The bone at the end of the chain (e.g., hand)
  chainLength: number;      // Number of bones in chain (typically 2)
  targetX: number;          // World target position
  targetY: number;
  bendPositive: boolean;    // Which way the joint bends (elbow direction)
  mix: number;              // 0-1, how much IK affects the bones
  enabled: boolean;
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

export interface IKKeyframe {
  time: number;
  targetX: number;
  targetY: number;
  easing: EasingType;
}

export interface IKAnimationTrack {
  constraintId: string;
  keyframes: IKKeyframe[];
}

export interface RigAnimation {
  id: string;
  name: string;
  duration: number;
  fps: number;
  loop: boolean;
  tracks: AnimationTrack[];
  ikTracks?: IKAnimationTrack[];
}

export interface Skeleton {
  id: string;
  name: string;
  bones: Bone[];
  slots: Slot[];
  skins: Skin[];
  ikConstraints: IKConstraint[];
  rigAnimations: RigAnimation[];
}
