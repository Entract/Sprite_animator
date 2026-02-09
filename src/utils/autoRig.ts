import type { Bone } from '../types/skeleton';
import {
  segmentCharacterImage,
  type SegmentationProvider,
} from './segmentation';

interface Point {
  x: number;
  y: number;
}

interface BodyRow {
  t: number;
  meanS: number;
  minS: number;
  maxS: number;
  width: number;
  count: number;
  ratio: number;
}

interface BoneSegment {
  key: string;
  name: string;
  parentKey: string | null;
  start: Point;
  end: Point;
}

interface AutoRigLayout {
  width: number;
  height: number;
  bodyHeight: number;
  shoulderWidth: number;
  hipWidth: number;
  joints: {
    pelvis: Point;
    chest: Point;
    neck: Point;
    headTop: Point;
    leftShoulder: Point;
    rightShoulder: Point;
    leftElbow: Point;
    rightElbow: Point;
    leftHand: Point;
    rightHand: Point;
    leftHip: Point;
    rightHip: Point;
    leftKnee: Point;
    rightKnee: Point;
    leftFoot: Point;
    rightFoot: Point;
  };
  segments: BoneSegment[];
}

export interface AutoRigOptions {
  skeletonName?: string;
  segmentationProvider: SegmentationProvider;
  sam2PointsPerSide: number;
  sam2PredIouThreshold: number;
  sam2StabilityScoreThreshold: number;
  sam2UseM2M: boolean;
  localSam2Endpoint: string;
  localSam2TimeoutMs: number;
  generateAttachments: boolean;
  alphaThreshold: number;
}

export interface AutoRigBone extends Pick<Bone, 'name' | 'x' | 'y' | 'rotation' | 'length' | 'scaleX' | 'scaleY' | 'pivotX' | 'pivotY'> {
  key: string;
  parentKey: string | null;
}

export interface AutoRigAttachment {
  boneKey: string;
  fileName: string;
  imageData: string;
  width: number;
  height: number;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface AutoRigResult {
  skeletonName: string;
  sourceWidth: number;
  sourceHeight: number;
  segmentedImageData: string;
  usedSegmentationProvider: SegmentationProvider;
  bones: AutoRigBone[];
  attachments: AutoRigAttachment[];
  warnings: string[];
}

const DEFAULT_OPTIONS: AutoRigOptions = {
  segmentationProvider: 'local-sam2',
  sam2PointsPerSide: 32,
  sam2PredIouThreshold: 0.8,
  sam2StabilityScoreThreshold: 0.95,
  sam2UseM2M: true,
  localSam2Endpoint: 'http://127.0.0.1:8765/sam2/segment',
  localSam2TimeoutMs: 240000,
  generateAttachments: true,
  alphaThreshold: 24,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function dist(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

function normalize(v: Point, fallback: Point): Point {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-6) {
    const fallbackLen = Math.hypot(fallback.x, fallback.y);
    if (fallbackLen < 1e-6) return { x: 1, y: 0 };
    return { x: fallback.x / fallbackLen, y: fallback.y / fallbackLen };
  }
  return { x: v.x / len, y: v.y / len };
}

function rotate(p: Point, radians: number): Point {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return {
    x: p.x * c - p.y * s,
    y: p.x * s + p.y * c,
  };
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function normalizeDeg(angle: number): number {
  let result = angle;
  while (result > 180) result -= 360;
  while (result <= -180) result += 360;
  return result;
}

function ensureMinLength(start: Point, end: Point, minLength: number, fallbackDir: Point): Point {
  const current = dist(start, end);
  if (current >= minLength) return end;
  const dir = normalize({ x: end.x - start.x, y: end.y - start.y }, fallbackDir);
  return {
    x: start.x + dir.x * minLength,
    y: start.y + dir.y * minLength,
  };
}

function fileBaseName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}

function sanitizeName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
  return cleaned || 'auto_rig';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to decode image data'));
    image.src = dataUrl;
  });
}

function createCanvasFromImage(image: HTMLImageElement): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable');
  }
  ctx.drawImage(image, 0, 0);
  return { canvas, ctx };
}

function selectRowByWidth(rows: BodyRow[], minRatio: number, maxRatio: number): BodyRow | null {
  const inRange = rows.filter((row) => row.ratio >= minRatio && row.ratio <= maxRatio);
  if (inRange.length === 0) return null;
  return inRange.reduce((best, row) => (row.width > best.width ? row : best), inRange[0]);
}

function selectRowNearest(rows: BodyRow[], targetRatio: number): BodyRow {
  return rows.reduce((best, row) =>
    Math.abs(row.ratio - targetRatio) < Math.abs(best.ratio - targetRatio) ? row : best
  );
}

function sidePointsByScreenX<T extends Point>(a: T, b: T): { left: T; right: T } {
  return a.x <= b.x ? { left: a, right: b } : { left: b, right: a };
}

async function buildLayoutFromMask(dataUrl: string, alphaThreshold: number): Promise<AutoRigLayout> {
  const image = await loadImageElement(dataUrl);
  const { canvas, ctx } = createCanvasFromImage(image);
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height).data;

  let count = 0;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = imageData[(y * width + x) * 4 + 3];
      if (alpha <= alphaThreshold) continue;
      count += 1;
      sumX += x;
      sumY += y;
      sumXX += x * x;
      sumYY += y * y;
      sumXY += x * y;
    }
  }

  if (count < 100) {
    throw new Error('Not enough opaque pixels. Try turning off AI segmentation or use a cleaner PNG.');
  }

  const cx = sumX / count;
  const cy = sumY / count;
  const varXX = sumXX / count - cx * cx;
  const varYY = sumYY / count - cy * cy;
  const covXY = sumXY / count - cx * cy;

  const theta = 0.5 * Math.atan2(2 * covXY, varXX - varYY);
  let axisT = { x: Math.cos(theta), y: Math.sin(theta) };

  let minT = Infinity;
  let maxT = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = imageData[(y * width + x) * 4 + 3];
      if (alpha <= alphaThreshold) continue;
      const t = (x - cx) * axisT.x + (y - cy) * axisT.y;
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    }
  }

  const tSpan = Math.max(1, maxT - minT);
  const sampleBand = Math.max(2, tSpan * 0.1);

  let headYSum = 0;
  let footYSum = 0;
  let headCount = 0;
  let footCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = imageData[(y * width + x) * 4 + 3];
      if (alpha <= alphaThreshold) continue;
      const t = (x - cx) * axisT.x + (y - cy) * axisT.y;
      if (t <= minT + sampleBand) {
        headYSum += y;
        headCount += 1;
      }
      if (t >= maxT - sampleBand) {
        footYSum += y;
        footCount += 1;
      }
    }
  }

  if (headCount > 0 && footCount > 0) {
    const meanHeadY = headYSum / headCount;
    const meanFootY = footYSum / footCount;
    if (meanFootY < meanHeadY) {
      axisT = { x: -axisT.x, y: -axisT.y };
      const newMin = -maxT;
      const newMax = -minT;
      minT = newMin;
      maxT = newMax;
    }
  }

  const axisS = { x: -axisT.y, y: axisT.x };
  const bodyHeight = Math.max(12, maxT - minT);
  const binCount = clamp(Math.round(bodyHeight), 64, 2048);
  const binSize = bodyHeight / binCount;

  const bins: Array<{
    count: number;
    minS: number;
    maxS: number;
    sumS: number;
    sumT: number;
  } | null> = Array.from({ length: binCount }, () => null);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = imageData[(y * width + x) * 4 + 3];
      if (alpha <= alphaThreshold) continue;
      const dx = x - cx;
      const dy = y - cy;
      const t = dx * axisT.x + dy * axisT.y;
      const s = dx * axisS.x + dy * axisS.y;
      const rawIdx = Math.floor((t - minT) / binSize);
      const idx = clamp(rawIdx, 0, binCount - 1);

      const entry = bins[idx];
      if (!entry) {
        bins[idx] = {
          count: 1,
          minS: s,
          maxS: s,
          sumS: s,
          sumT: t,
        };
      } else {
        entry.count += 1;
        entry.minS = Math.min(entry.minS, s);
        entry.maxS = Math.max(entry.maxS, s);
        entry.sumS += s;
        entry.sumT += t;
      }
    }
  }

  const rows: BodyRow[] = [];
  for (const entry of bins) {
    if (!entry || entry.count <= 0) continue;
    const t = entry.sumT / entry.count;
    rows.push({
      t,
      meanS: entry.sumS / entry.count,
      minS: entry.minS,
      maxS: entry.maxS,
      width: Math.max(1, entry.maxS - entry.minS),
      count: entry.count,
      ratio: clamp((t - minT) / bodyHeight, 0, 1),
    });
  }

  if (rows.length < 10) {
    throw new Error('Mask analysis failed. Try a larger source image.');
  }

  rows.sort((a, b) => a.t - b.t);

  const shoulderRow = selectRowByWidth(rows, 0.18, 0.4) ?? selectRowNearest(rows, 0.28);
  const hipRow = selectRowByWidth(rows, 0.48, 0.74) ?? selectRowNearest(rows, 0.6);

  const footRows = rows.filter((row) => row.ratio >= 0.88);
  const handRows = rows.filter((row) => row.ratio >= shoulderRow.ratio - 0.03 && row.ratio <= 0.82);

  const weightedAverage = (values: Array<{ value: number; weight: number }>, fallback: number): number => {
    const weight = values.reduce((sum, item) => sum + item.weight, 0);
    if (weight <= 0) return fallback;
    const weightedSum = values.reduce((sum, item) => sum + item.value * item.weight, 0);
    return weightedSum / weight;
  };

  const footT = weightedAverage(
    footRows.map((row) => ({ value: row.t, weight: row.count })),
    maxT
  );
  const footMinS = weightedAverage(
    footRows.map((row) => ({ value: row.minS, weight: row.count })),
    hipRow.meanS - hipRow.width * 0.3
  );
  const footMaxS = weightedAverage(
    footRows.map((row) => ({ value: row.maxS, weight: row.count })),
    hipRow.meanS + hipRow.width * 0.3
  );

  let handMin = { s: shoulderRow.minS, t: shoulderRow.t };
  let handMax = { s: shoulderRow.maxS, t: shoulderRow.t };
  for (const row of handRows) {
    if (row.minS < handMin.s) handMin = { s: row.minS, t: row.t };
    if (row.maxS > handMax.s) handMax = { s: row.maxS, t: row.t };
  }

  const shoulderWidth = Math.max(shoulderRow.width, bodyHeight * 0.2);
  const hipWidth = Math.max(hipRow.width, bodyHeight * 0.16);
  const shoulderHalf = shoulderWidth * 0.26;
  const hipHalf = hipWidth * 0.22;
  const minArmReach = bodyHeight * 0.12;

  const shoulderCenterS = shoulderRow.meanS;
  const hipCenterS = hipRow.meanS;

  const tShoulder = shoulderRow.t;
  const tHip = Math.max(hipRow.t, tShoulder + bodyHeight * 0.14);
  const tNeck = clamp(tShoulder - bodyHeight * 0.1, minT + bodyHeight * 0.02, tShoulder - bodyHeight * 0.02);
  const tHeadTop = Math.max(minT, tNeck - bodyHeight * 0.16);
  const tFoot = Math.max(footT, tHip + bodyHeight * 0.25);

  const sideMinShoulder = { s: shoulderCenterS - shoulderHalf, t: tShoulder };
  const sideMaxShoulder = { s: shoulderCenterS + shoulderHalf, t: tShoulder };
  const sideMinHip = { s: hipCenterS - hipHalf, t: tHip };
  const sideMaxHip = { s: hipCenterS + hipHalf, t: tHip };

  const handMinS = Math.min(handMin.s, sideMinShoulder.s - minArmReach);
  const handMaxS = Math.max(handMax.s, sideMaxShoulder.s + minArmReach);
  const handMinT = clamp(handMin.t, tShoulder + bodyHeight * 0.03, tHip + bodyHeight * 0.22);
  const handMaxT = clamp(handMax.t, tShoulder + bodyHeight * 0.03, tHip + bodyHeight * 0.22);

  const sideMinHand = { s: handMinS, t: handMinT };
  const sideMaxHand = { s: handMaxS, t: handMaxT };
  const sideMinFoot = { s: footMinS, t: tFoot };
  const sideMaxFoot = { s: footMaxS, t: tFoot };

  const sideMinElbow = {
    s: lerp(sideMinShoulder.s, sideMinHand.s, 0.52) - bodyHeight * 0.04,
    t: lerp(sideMinShoulder.t, sideMinHand.t, 0.5) + bodyHeight * 0.035,
  };
  const sideMaxElbow = {
    s: lerp(sideMaxShoulder.s, sideMaxHand.s, 0.52) + bodyHeight * 0.04,
    t: lerp(sideMaxShoulder.t, sideMaxHand.t, 0.5) + bodyHeight * 0.035,
  };
  const sideMinKnee = {
    s: lerp(sideMinHip.s, sideMinFoot.s, 0.48) - bodyHeight * 0.03,
    t: lerp(sideMinHip.t, sideMinFoot.t, 0.5) - bodyHeight * 0.015,
  };
  const sideMaxKnee = {
    s: lerp(sideMaxHip.s, sideMaxFoot.s, 0.48) + bodyHeight * 0.03,
    t: lerp(sideMaxHip.t, sideMaxFoot.t, 0.5) - bodyHeight * 0.015,
  };

  const toWorld = (s: number, t: number): Point => ({
    x: cx + axisS.x * s + axisT.x * t,
    y: cy + axisS.y * s + axisT.y * t,
  });

  const sideMinWorld = {
    shoulder: toWorld(sideMinShoulder.s, sideMinShoulder.t),
    elbow: toWorld(sideMinElbow.s, sideMinElbow.t),
    hand: toWorld(sideMinHand.s, sideMinHand.t),
    hip: toWorld(sideMinHip.s, sideMinHip.t),
    knee: toWorld(sideMinKnee.s, sideMinKnee.t),
    foot: toWorld(sideMinFoot.s, sideMinFoot.t),
  };
  const sideMaxWorld = {
    shoulder: toWorld(sideMaxShoulder.s, sideMaxShoulder.t),
    elbow: toWorld(sideMaxElbow.s, sideMaxElbow.t),
    hand: toWorld(sideMaxHand.s, sideMaxHand.t),
    hip: toWorld(sideMaxHip.s, sideMaxHip.t),
    knee: toWorld(sideMaxKnee.s, sideMaxKnee.t),
    foot: toWorld(sideMaxFoot.s, sideMaxFoot.t),
  };

  const pelvis = toWorld(hipCenterS, tHip);
  const chest = toWorld(shoulderCenterS, tShoulder);
  const neck = toWorld(shoulderCenterS, tNeck);
  const headTop = toWorld(shoulderCenterS, tHeadTop);

  const shoulders = sidePointsByScreenX(sideMinWorld.shoulder, sideMaxWorld.shoulder);
  const elbows = sidePointsByScreenX(sideMinWorld.elbow, sideMaxWorld.elbow);
  const hands = sidePointsByScreenX(sideMinWorld.hand, sideMaxWorld.hand);
  const hips = sidePointsByScreenX(sideMinWorld.hip, sideMaxWorld.hip);
  const knees = sidePointsByScreenX(sideMinWorld.knee, sideMaxWorld.knee);
  const feet = sidePointsByScreenX(sideMinWorld.foot, sideMaxWorld.foot);

  const minBoneLength = Math.max(8, bodyHeight * 0.035);
  const torsoDir = normalize({ x: chest.x - pelvis.x, y: chest.y - pelvis.y }, axisT);
  const downDir = { x: -torsoDir.x, y: -torsoDir.y };
  const leftDir = normalize({ x: shoulders.left.x - chest.x, y: shoulders.left.y - chest.y }, { x: -axisS.x, y: -axisS.y });
  const rightDir = normalize({ x: shoulders.right.x - chest.x, y: shoulders.right.y - chest.y }, axisS);

  const fixedChest = ensureMinLength(pelvis, chest, minBoneLength, torsoDir);
  const fixedNeck = ensureMinLength(fixedChest, neck, minBoneLength * 0.6, torsoDir);
  const fixedHead = ensureMinLength(fixedNeck, headTop, minBoneLength * 0.8, torsoDir);

  const fixedLeftElbow = ensureMinLength(shoulders.left, elbows.left, minBoneLength, leftDir);
  const fixedLeftHand = ensureMinLength(fixedLeftElbow, hands.left, minBoneLength, leftDir);
  const fixedRightElbow = ensureMinLength(shoulders.right, elbows.right, minBoneLength, rightDir);
  const fixedRightHand = ensureMinLength(fixedRightElbow, hands.right, minBoneLength, rightDir);

  const fixedLeftKnee = ensureMinLength(hips.left, knees.left, minBoneLength, downDir);
  const fixedLeftFoot = ensureMinLength(fixedLeftKnee, feet.left, minBoneLength, downDir);
  const fixedRightKnee = ensureMinLength(hips.right, knees.right, minBoneLength, downDir);
  const fixedRightFoot = ensureMinLength(fixedRightKnee, feet.right, minBoneLength, downDir);

  const joints = {
    pelvis,
    chest: fixedChest,
    neck: fixedNeck,
    headTop: fixedHead,
    leftShoulder: shoulders.left,
    rightShoulder: shoulders.right,
    leftElbow: fixedLeftElbow,
    rightElbow: fixedRightElbow,
    leftHand: fixedLeftHand,
    rightHand: fixedRightHand,
    leftHip: hips.left,
    rightHip: hips.right,
    leftKnee: fixedLeftKnee,
    rightKnee: fixedRightKnee,
    leftFoot: fixedLeftFoot,
    rightFoot: fixedRightFoot,
  };

  const segments: BoneSegment[] = [
    { key: 'root', name: 'Root', parentKey: null, start: joints.pelvis, end: joints.chest },
    { key: 'spine', name: 'Spine', parentKey: 'root', start: joints.chest, end: joints.neck },
    { key: 'head', name: 'Head', parentKey: 'spine', start: joints.neck, end: joints.headTop },
    { key: 'upper_arm_l', name: 'UpperArm_L', parentKey: 'spine', start: joints.leftShoulder, end: joints.leftElbow },
    { key: 'lower_arm_l', name: 'LowerArm_L', parentKey: 'upper_arm_l', start: joints.leftElbow, end: joints.leftHand },
    { key: 'upper_arm_r', name: 'UpperArm_R', parentKey: 'spine', start: joints.rightShoulder, end: joints.rightElbow },
    { key: 'lower_arm_r', name: 'LowerArm_R', parentKey: 'upper_arm_r', start: joints.rightElbow, end: joints.rightHand },
    { key: 'upper_leg_l', name: 'UpperLeg_L', parentKey: 'root', start: joints.leftHip, end: joints.leftKnee },
    { key: 'lower_leg_l', name: 'LowerLeg_L', parentKey: 'upper_leg_l', start: joints.leftKnee, end: joints.leftFoot },
    { key: 'upper_leg_r', name: 'UpperLeg_R', parentKey: 'root', start: joints.rightHip, end: joints.rightKnee },
    { key: 'lower_leg_r', name: 'LowerLeg_R', parentKey: 'upper_leg_r', start: joints.rightKnee, end: joints.rightFoot },
  ];

  return {
    width,
    height,
    bodyHeight,
    shoulderWidth,
    hipWidth,
    joints,
    segments,
  };
}

function convertSegmentsToBones(segments: BoneSegment[]): AutoRigBone[] {
  const resolved = new Map<string, { segment: BoneSegment; angle: number; length: number }>();

  for (const segment of segments) {
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const angle = Math.atan2(dy, dx);
    const length = Math.max(1, Math.hypot(dx, dy));
    resolved.set(segment.key, { segment, angle, length });
  }

  const result: AutoRigBone[] = [];
  for (const segment of segments) {
    const own = resolved.get(segment.key);
    if (!own) continue;

    if (!segment.parentKey) {
      result.push({
        key: segment.key,
        parentKey: null,
        name: segment.name,
        x: Math.round(segment.start.x),
        y: Math.round(segment.start.y),
        rotation: Math.round(toDeg(own.angle) * 100) / 100,
        length: Math.round(own.length * 100) / 100,
        scaleX: 1,
        scaleY: 1,
        pivotX: 0,
        pivotY: 0.5,
      });
      continue;
    }

    const parent = resolved.get(segment.parentKey);
    if (!parent) continue;

    const relative = rotate(
      {
        x: segment.start.x - parent.segment.start.x,
        y: segment.start.y - parent.segment.start.y,
      },
      -parent.angle
    );

    result.push({
      key: segment.key,
      parentKey: segment.parentKey,
      name: segment.name,
      x: Math.round(relative.x * 100) / 100,
      y: Math.round(relative.y * 100) / 100,
      rotation: Math.round(normalizeDeg(toDeg(own.angle - parent.angle)) * 100) / 100,
      length: Math.round(own.length * 100) / 100,
      scaleX: 1,
      scaleY: 1,
      pivotX: 0,
      pivotY: 0.5,
    });
  }

  return result;
}

function drawCapsule(ctx: CanvasRenderingContext2D, start: Point, end: Point, radius: number): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);

  if (length < 1e-4) {
    ctx.beginPath();
    ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const angle = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(start.x, start.y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.lineTo(length, -radius);
  ctx.arc(length, 0, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(0, radius);
  ctx.arc(0, 0, radius, Math.PI / 2, -Math.PI / 2, true);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function extractMaskedPart(
  sourceCanvas: HTMLCanvasElement,
  drawMask: (ctx: CanvasRenderingContext2D) => void
): { imageData: string; width: number; height: number; center: Point } | null {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const maskedCanvas = document.createElement('canvas');
  maskedCanvas.width = width;
  maskedCanvas.height = height;
  const maskedCtx = maskedCanvas.getContext('2d');
  if (!maskedCtx) return null;

  maskedCtx.drawImage(sourceCanvas, 0, 0);
  maskedCtx.globalCompositeOperation = 'destination-in';
  maskedCtx.fillStyle = '#fff';
  drawMask(maskedCtx);
  maskedCtx.globalCompositeOperation = 'source-over';

  const data = maskedCtx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) return null;

  cropCtx.drawImage(maskedCanvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  return {
    imageData: cropCanvas.toDataURL('image/png'),
    width: cropWidth,
    height: cropHeight,
    center: {
      x: minX + cropWidth / 2,
      y: minY + cropHeight / 2,
    },
  };
}

async function generateAttachments(
  segmentedImageData: string,
  layout: AutoRigLayout,
  skeletonName: string
): Promise<AutoRigAttachment[]> {
  const image = await loadImageElement(segmentedImageData);
  const { canvas } = createCanvasFromImage(image);
  const segmentMap = new Map(layout.segments.map((segment) => [segment.key, segment]));
  const { joints, bodyHeight } = layout;

  const shoulderSpan = dist(joints.leftShoulder, joints.rightShoulder);
  const hipSpan = dist(joints.leftHip, joints.rightHip);
  const torsoRadius = Math.max(10, Math.min(shoulderSpan, hipSpan) * 0.32);
  const armRadius = Math.max(6, bodyHeight * 0.042);
  const legRadius = Math.max(7, bodyHeight * 0.052);
  const headRadius = Math.max(10, dist(joints.neck, joints.headTop) * 0.9);

  const specs: Array<{
    key: string;
    boneKey: string;
    draw: (ctx: CanvasRenderingContext2D) => void;
  }> = [
    {
      key: 'torso',
      boneKey: 'root',
      draw: (ctx) => {
        drawCapsule(ctx, joints.pelvis, joints.chest, torsoRadius);
        drawCapsule(ctx, joints.chest, joints.neck, torsoRadius * 0.75);
        ctx.beginPath();
        ctx.arc(joints.leftShoulder.x, joints.leftShoulder.y, torsoRadius * 0.55, 0, Math.PI * 2);
        ctx.arc(joints.rightShoulder.x, joints.rightShoulder.y, torsoRadius * 0.55, 0, Math.PI * 2);
        ctx.arc(joints.leftHip.x, joints.leftHip.y, torsoRadius * 0.5, 0, Math.PI * 2);
        ctx.arc(joints.rightHip.x, joints.rightHip.y, torsoRadius * 0.5, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    {
      key: 'head',
      boneKey: 'head',
      draw: (ctx) => {
        const center = {
          x: (joints.neck.x + joints.headTop.x) / 2,
          y: (joints.neck.y + joints.headTop.y) / 2,
        };
        ctx.beginPath();
        ctx.arc(center.x, center.y, headRadius, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    {
      key: 'upper_arm_l',
      boneKey: 'upper_arm_l',
      draw: (ctx) => drawCapsule(ctx, joints.leftShoulder, joints.leftElbow, armRadius),
    },
    {
      key: 'lower_arm_l',
      boneKey: 'lower_arm_l',
      draw: (ctx) => drawCapsule(ctx, joints.leftElbow, joints.leftHand, armRadius * 0.86),
    },
    {
      key: 'upper_arm_r',
      boneKey: 'upper_arm_r',
      draw: (ctx) => drawCapsule(ctx, joints.rightShoulder, joints.rightElbow, armRadius),
    },
    {
      key: 'lower_arm_r',
      boneKey: 'lower_arm_r',
      draw: (ctx) => drawCapsule(ctx, joints.rightElbow, joints.rightHand, armRadius * 0.86),
    },
    {
      key: 'upper_leg_l',
      boneKey: 'upper_leg_l',
      draw: (ctx) => drawCapsule(ctx, joints.leftHip, joints.leftKnee, legRadius),
    },
    {
      key: 'lower_leg_l',
      boneKey: 'lower_leg_l',
      draw: (ctx) => drawCapsule(ctx, joints.leftKnee, joints.leftFoot, legRadius * 0.84),
    },
    {
      key: 'upper_leg_r',
      boneKey: 'upper_leg_r',
      draw: (ctx) => drawCapsule(ctx, joints.rightHip, joints.rightKnee, legRadius),
    },
    {
      key: 'lower_leg_r',
      boneKey: 'lower_leg_r',
      draw: (ctx) => drawCapsule(ctx, joints.rightKnee, joints.rightFoot, legRadius * 0.84),
    },
  ];

  const attachments: AutoRigAttachment[] = [];

  for (const spec of specs) {
    const piece = extractMaskedPart(canvas, (ctx) => {
      spec.draw(ctx);
    });
    if (!piece) continue;

    const segment = segmentMap.get(spec.boneKey);
    if (!segment) continue;

    const angle = Math.atan2(segment.end.y - segment.start.y, segment.end.x - segment.start.x);
    const delta = {
      x: piece.center.x - segment.start.x,
      y: piece.center.y - segment.start.y,
    };
    const local = rotate(delta, -angle);

    attachments.push({
      boneKey: spec.boneKey,
      fileName: `${skeletonName}_${spec.key}.png`,
      imageData: piece.imageData,
      width: piece.width,
      height: piece.height,
      x: Math.round(local.x * 100) / 100,
      y: Math.round(local.y * 100) / 100,
      rotation: Math.round(-toDeg(angle) * 100) / 100,
      scaleX: 1,
      scaleY: 1,
    });
  }

  return attachments;
}

export async function buildAutoRigFromFile(
  file: File,
  partialOptions: Partial<AutoRigOptions> = {}
): Promise<AutoRigResult> {
  const options: AutoRigOptions = {
    ...DEFAULT_OPTIONS,
    ...partialOptions,
  };
  const warnings: string[] = [];

  const originalImageData = await readFileAsDataUrl(file);
  const skeletonName = sanitizeName(options.skeletonName || fileBaseName(file.name));

  const segmentation = await segmentCharacterImage(originalImageData, {
    provider: options.segmentationProvider,
    sam2PointsPerSide: options.sam2PointsPerSide,
    sam2PredIouThreshold: options.sam2PredIouThreshold,
    sam2StabilityScoreThreshold: options.sam2StabilityScoreThreshold,
    sam2UseM2M: options.sam2UseM2M,
    localSam2Endpoint: options.localSam2Endpoint,
    localSam2TimeoutMs: options.localSam2TimeoutMs,
  });
  warnings.push(...segmentation.warnings);
  const segmentedImageData = segmentation.segmentedImageData;

  const layout = await buildLayoutFromMask(segmentedImageData, options.alphaThreshold);
  const bones = convertSegmentsToBones(layout.segments);
  const attachments = options.generateAttachments
    ? await generateAttachments(segmentedImageData, layout, skeletonName)
    : [];

  if (options.generateAttachments && attachments.length === 0) {
    warnings.push('No attachment slices were generated; bones were still created.');
  }

  return {
    skeletonName,
    sourceWidth: layout.width,
    sourceHeight: layout.height,
    segmentedImageData,
    usedSegmentationProvider: segmentation.usedProvider,
    bones,
    attachments,
    warnings,
  };
}
