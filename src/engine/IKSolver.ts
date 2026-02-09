import type { Bone, IKConstraint } from '../types/skeleton';

/**
 * 2-Bone IK Solver using the Law of Cosines
 *
 * Given a target position, calculates the rotations for a 2-bone chain
 * (e.g., upper arm -> lower arm -> hand) to reach the target.
 */

interface IKResult {
  parentRotation: number;  // Rotation for the parent bone (e.g., upper arm)
  childRotation: number;   // Rotation for the child bone (e.g., lower arm)
  reachable: boolean;      // Whether target is within reach
}

interface WorldBone {
  bone: Bone;
  worldX: number;
  worldY: number;
  worldRotation: number;
}

/**
 * Computes world transforms for the bone chain leading to targetBoneId
 */
export function computeBoneChainWorld(
  bones: Bone[],
  targetBoneId: string
): WorldBone[] {
  const chain: WorldBone[] = [];
  const boneMap = new Map(bones.map(b => [b.id, b]));

  // Build chain from target to root
  let current = boneMap.get(targetBoneId);
  const boneIds: string[] = [];

  while (current) {
    boneIds.unshift(current.id);
    current = current.parentId ? boneMap.get(current.parentId) : undefined;
  }

  // Compute world transforms
  let worldX = 0;
  let worldY = 0;
  let worldRotation = 0;

  for (const id of boneIds) {
    const bone = boneMap.get(id)!;

    // Apply parent transform
    const rad = worldRotation * Math.PI / 180;
    const localX = bone.x * bone.scaleX;
    const localY = bone.y * bone.scaleY;

    worldX += Math.cos(rad) * localX - Math.sin(rad) * localY;
    worldY += Math.sin(rad) * localX + Math.cos(rad) * localY;
    worldRotation += bone.rotation;

    chain.push({
      bone,
      worldX,
      worldY,
      worldRotation
    });
  }

  return chain;
}

/**
 * Solves 2-bone IK using the law of cosines
 *
 * @param parentLength - Length of the parent bone (e.g., upper arm)
 * @param childLength - Length of the child bone (e.g., lower arm)
 * @param targetX - Target X position in world space
 * @param targetY - Target Y position in world space
 * @param originX - Origin X position (start of parent bone)
 * @param originY - Origin Y position (start of parent bone)
 * @param bendPositive - Which direction the joint should bend
 * @returns Rotations in degrees
 */
export function solve2BoneIK(
  parentLength: number,
  childLength: number,
  targetX: number,
  targetY: number,
  originX: number,
  originY: number,
  bendPositive: boolean
): IKResult {
  // Vector from origin to target
  const dx = targetX - originX;
  const dy = targetY - originY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Angle from origin to target
  const angleToTarget = Math.atan2(dy, dx);

  // Check if target is reachable
  const maxReach = parentLength + childLength;
  const minReach = Math.abs(parentLength - childLength);

  let reachable = true;
  let clampedDistance = distance;

  if (distance > maxReach) {
    // Target too far - fully extend
    clampedDistance = maxReach - 0.001;
    reachable = false;
  } else if (distance < minReach) {
    // Target too close - fold as much as possible
    clampedDistance = minReach + 0.001;
    reachable = false;
  }

  // Law of cosines to find the angle at the parent joint
  // c² = a² + b² - 2ab*cos(C)
  // where a = parentLength, b = childLength, c = distance
  const a = parentLength;
  const b = childLength;
  const c = clampedDistance;

  // Angle at parent joint (between parent bone and line to target)
  const cosAngleA = (a * a + c * c - b * b) / (2 * a * c);
  const angleA = Math.acos(Math.max(-1, Math.min(1, cosAngleA)));

  // Angle at child joint (between parent and child bones)
  const cosAngleB = (a * a + b * b - c * c) / (2 * a * b);
  const angleB = Math.acos(Math.max(-1, Math.min(1, cosAngleB)));

  // Calculate final rotations
  let parentRotation: number;
  let childRotation: number;

  if (bendPositive) {
    parentRotation = angleToTarget + angleA;
    childRotation = -(Math.PI - angleB);
  } else {
    parentRotation = angleToTarget - angleA;
    childRotation = Math.PI - angleB;
  }

  // Convert to degrees
  return {
    parentRotation: parentRotation * 180 / Math.PI,
    childRotation: childRotation * 180 / Math.PI,
    reachable
  };
}

/**
 * Applies an IK constraint to the skeleton bones
 * Modifies bones in place based on the constraint settings
 */
export function applyIKConstraint(
  bones: Bone[],
  constraint: IKConstraint
): Bone[] {
  if (!constraint.enabled || constraint.mix === 0) {
    return bones;
  }

  const boneMap = new Map(bones.map(b => [b.id, b]));

  // Get the end effector bone (e.g., hand)
  const endBone = boneMap.get(constraint.targetBoneId);
  if (!endBone) return bones;

  // For 2-bone IK, we need the end bone and its parent
  if (constraint.chainLength !== 2) {
    console.warn('Only 2-bone IK chains are supported');
    return bones;
  }

  const childBone = endBone;
  const parentBone = childBone.parentId ? boneMap.get(childBone.parentId) : undefined;

  if (!parentBone) {
    console.warn('IK constraint requires a parent bone');
    return bones;
  }

  // Compute the world position of the parent bone's origin
  const chain = computeBoneChainWorld(bones, parentBone.id);
  const parentWorld = chain[chain.length - 1];

  // The parent bone's origin is at the end of its parent (if any)
  let originX = 0;
  let originY = 0;

  if (chain.length >= 2) {
    // Origin is at the tip of the grandparent bone
    const grandparent = chain[chain.length - 2];
    const rad = grandparent.worldRotation * Math.PI / 180;
    originX = grandparent.worldX + Math.cos(rad) * grandparent.bone.length;
    originY = grandparent.worldY + Math.sin(rad) * grandparent.bone.length;
  } else if (parentBone.parentId) {
    // Parent has a parent but we couldn't compute chain properly
    originX = parentWorld.worldX;
    originY = parentWorld.worldY;
  }

  // Actually, simpler approach: the origin is where the parent bone starts
  // which is the parent's (x, y) transformed by ancestors
  originX = parentWorld.worldX;
  originY = parentWorld.worldY;

  // Solve IK
  const result = solve2BoneIK(
    parentBone.length,
    childBone.length,
    constraint.targetX,
    constraint.targetY,
    originX,
    originY,
    constraint.bendPositive
  );

  // Apply results with mix factor
  const mix = constraint.mix;

  // Calculate the rotation we need to set (accounting for parent chain)
  // The parent's world rotation comes from its ancestors
  const parentAncestorRotation = parentWorld.worldRotation - parentBone.rotation;
  const targetParentRotation = result.parentRotation - parentAncestorRotation;

  return bones.map(b => {
    if (b.id === parentBone.id) {
      const newRotation = b.rotation + (targetParentRotation - b.rotation) * mix;
      return { ...b, rotation: newRotation };
    }
    if (b.id === childBone.id) {
      const newRotation = b.rotation + (result.childRotation - b.rotation) * mix;
      return { ...b, rotation: newRotation };
    }
    return b;
  });
}

/**
 * Applies all IK constraints to a skeleton
 */
export function applyAllIKConstraints(
  bones: Bone[],
  constraints: IKConstraint[]
): Bone[] {
  let result = bones;

  for (const constraint of constraints) {
    result = applyIKConstraint(result, constraint);
  }

  return result;
}
