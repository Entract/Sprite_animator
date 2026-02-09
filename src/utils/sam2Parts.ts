export interface Sam2PartInfo {
  label: string;
  area: number;
  area_ratio: number;
  bbox: [number, number, number, number];
  centroid: [number, number];
  color: string;
}

export interface Sam2RegionInfo {
  id: string;
  suggested_label: string;
  area: number;
  area_ratio: number;
  bbox: [number, number, number, number];
  centroid: [number, number];
  color: string;
}

export interface Sam2PartsResult {
  ok: boolean;
  image_width: number;
  image_height: number;
  total_parts: number;
  preview: string;
  regions_preview: string;
  parts: Sam2PartInfo[];
  regions: Sam2RegionInfo[];
}

export interface Sam2PartsOptions {
  endpoint: string;
  pointsPerSide: number;
  predIouThreshold: number;
  stabilityScoreThreshold: number;
  useM2M: boolean;
  timeoutMs: number;
  maxRegions?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toBBox(value: unknown): [number, number, number, number] {
  if (!Array.isArray(value) || value.length < 4) {
    return [0, 0, 0, 0];
  }
  return [
    toFiniteNumber(value[0], 0),
    toFiniteNumber(value[1], 0),
    toFiniteNumber(value[2], 0),
    toFiniteNumber(value[3], 0),
  ];
}

function toCentroid(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length < 2) {
    return [0, 0];
  }
  return [toFiniteNumber(value[0], 0), toFiniteNumber(value[1], 0)];
}

function normalizePartInfo(value: unknown, index: number): Sam2PartInfo | null {
  if (!isRecord(value)) return null;
  const label = toStringValue(value.label, `part_${index + 1}`);
  return {
    label,
    area: Math.max(0, toFiniteNumber(value.area, 0)),
    area_ratio: clamp(toFiniteNumber(value.area_ratio, 0), 0, 1),
    bbox: toBBox(value.bbox),
    centroid: toCentroid(value.centroid),
    color: toStringValue(value.color, 'rgb(180,180,180)'),
  };
}

function normalizeRegionInfo(value: unknown, index: number): Sam2RegionInfo | null {
  if (!isRecord(value)) return null;
  return {
    id: toStringValue(value.id, `region_${String(index + 1).padStart(2, '0')}`),
    suggested_label: toStringValue(value.suggested_label, 'other'),
    area: Math.max(0, toFiniteNumber(value.area, 0)),
    area_ratio: clamp(toFiniteNumber(value.area_ratio, 0), 0, 1),
    bbox: toBBox(value.bbox),
    centroid: toCentroid(value.centroid),
    color: toStringValue(value.color, 'rgb(180,180,180)'),
  };
}

function normalizeSam2PartsResult(data: unknown): Sam2PartsResult | null {
  if (!isRecord(data)) return null;

  const preview = toStringValue(data.preview, '');
  if (!preview) return null;

  const partsRaw = Array.isArray(data.parts) ? data.parts : [];
  const regionsRaw = Array.isArray(data.regions) ? data.regions : [];
  const parts = partsRaw
    .map((item, index) => normalizePartInfo(item, index))
    .filter((item): item is Sam2PartInfo => item !== null);
  const regions = regionsRaw
    .map((item, index) => normalizeRegionInfo(item, index))
    .filter((item): item is Sam2RegionInfo => item !== null);

  return {
    ok: typeof data.ok === 'boolean' ? data.ok : true,
    image_width: Math.max(
      0,
      Math.round(toFiniteNumber((data.image_width ?? data.imageWidth) as unknown, 0))
    ),
    image_height: Math.max(
      0,
      Math.round(toFiniteNumber((data.image_height ?? data.imageHeight) as unknown, 0))
    ),
    total_parts: Math.max(
      0,
      Math.round(toFiniteNumber((data.total_parts ?? data.totalParts) as unknown, parts.length))
    ),
    preview,
    regions_preview:
      toStringValue((data.regions_preview ?? data.regionsPreview) as unknown, '') || preview,
    parts,
    regions,
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function analyzeSam2PartsFromFile(
  file: File,
  options: Sam2PartsOptions
): Promise<Sam2PartsResult> {
  const dataUrl = await fileToDataUrl(file);

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(5000, Math.round(options.timeoutMs))
  );

  try {
    const response = await fetch(options.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        image: dataUrl,
        points_per_side: clamp(Math.round(options.pointsPerSide), 8, 128),
        pred_iou_thresh: clamp(options.predIouThreshold, 0, 1),
        stability_score_thresh: clamp(options.stabilityScoreThreshold, 0, 1),
        use_m2m: options.useM2M,
        max_regions: clamp(Math.round(options.maxRegions ?? 16), 4, 40),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `SAM2 parts request failed (${response.status}). ${errorText || 'No error details.'}`
      );
    }

    const rawPayload = (await response.json()) as unknown;
    const normalized = normalizeSam2PartsResult(rawPayload);
    if (!normalized) {
      const payloadKeys = isRecord(rawPayload) ? Object.keys(rawPayload).join(', ') : 'non-object';
      throw new Error(`SAM2 parts response format was invalid (keys: ${payloadKeys}).`);
    }
    return normalized;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      const sec = Math.max(5, Math.round(options.timeoutMs / 1000));
      throw new Error(
        `SAM2 parts preview timed out after ${sec}s. Try raising timeout or lowering points/side.`
      );
    }
    if (error instanceof TypeError) {
      throw new Error(
        `Could not reach local SAM2 endpoint at ${options.endpoint}. Ensure server is running and reachable.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
