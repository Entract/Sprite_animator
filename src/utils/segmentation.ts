import { removeBackgroundAI } from './imageProcessing';

export type SegmentationProvider = 'none' | 'background-removal' | 'local-sam2';

export interface SegmentationOptions {
  provider: SegmentationProvider;
  sam2PointsPerSide: number;
  sam2PredIouThreshold: number;
  sam2StabilityScoreThreshold: number;
  sam2UseM2M: boolean;
  localSam2Endpoint: string;
  localSam2TimeoutMs: number;
}

export interface SegmentationResult {
  segmentedImageData: string;
  usedProvider: SegmentationProvider;
  warnings: string[];
}

function dataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read blob as data URL'));
    reader.readAsDataURL(blob);
  });
}

async function resolveImageSourceToDataUrl(source: string): Promise<string> {
  if (source.startsWith('data:')) return source;
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to download mask image (${response.status})`);
  }
  const blob = await response.blob();
  return dataUrlFromBlob(blob);
}

function readMaskSourceFromOutput(output: unknown): string | null {
  if (!output) return null;
  if (typeof output === 'string') return output;

  if (Array.isArray(output)) {
    for (const item of output) {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const candidate =
          (item as Record<string, unknown>).combined_mask ??
          (item as Record<string, unknown>).mask ??
          (item as Record<string, unknown>).image;
        if (typeof candidate === 'string') return candidate;
      }
    }
    return null;
  }

  if (typeof output === 'object') {
    const record = output as Record<string, unknown>;
    const candidate =
      record.combined_mask ??
      record.mask ??
      record.image ??
      record.output ??
      record.png;
    if (typeof candidate === 'string') return candidate;
    if (Array.isArray(candidate)) return readMaskSourceFromOutput(candidate);
  }

  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to decode image'));
    image.src = dataUrl;
  });
}

async function applyMaskToImage(sourceImageData: string, maskImageData: string): Promise<string> {
  const [sourceImage, maskImage] = await Promise.all([
    loadImageElement(sourceImageData),
    loadImageElement(maskImageData),
  ]);

  const width = sourceImage.naturalWidth;
  const height = sourceImage.naturalHeight;

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) {
    throw new Error('Canvas 2D context unavailable for source image');
  }
  sourceCtx.drawImage(sourceImage, 0, 0);

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d');
  if (!maskCtx) {
    throw new Error('Canvas 2D context unavailable for mask image');
  }
  maskCtx.drawImage(maskImage, 0, 0, width, height);

  const sourceData = sourceCtx.getImageData(0, 0, width, height);
  const maskData = maskCtx.getImageData(0, 0, width, height);

  for (let i = 0; i < sourceData.data.length; i += 4) {
    const maskR = maskData.data[i];
    const maskG = maskData.data[i + 1];
    const maskB = maskData.data[i + 2];
    const maskA = maskData.data[i + 3];
    const maskValue = maskA > 0 ? maskA : Math.max(maskR, maskG, maskB);
    const normalizedMask = clamp(maskValue / 255, 0, 1);
    sourceData.data[i + 3] = Math.round(sourceData.data[i + 3] * normalizedMask);
  }

  sourceCtx.putImageData(sourceData, 0, 0);
  return sourceCanvas.toDataURL('image/png');
}

async function runLocalSam2(
  sourceImageData: string,
  options: SegmentationOptions
): Promise<string> {
  const endpoint = options.localSam2Endpoint.trim();
  if (!endpoint) {
    throw new Error('Local SAM2 endpoint is empty');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(5000, options.localSam2TimeoutMs));

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: sourceImageData,
        points_per_side: clamp(Math.round(options.sam2PointsPerSide), 8, 128),
        pred_iou_thresh: clamp(options.sam2PredIouThreshold, 0, 1),
        stability_score_thresh: clamp(options.sam2StabilityScoreThreshold, 0, 1),
        use_m2m: options.sam2UseM2M,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          `Local SAM2 endpoint returned 404 at ${endpoint}. Check the URL path and that the server exposes this route.`
        );
      }
      throw new Error(`Local SAM2 request failed (${response.status})`);
    }

    const contentType = response.headers.get('content-type') || '';
    let maskDataUrl: string;

    if (contentType.startsWith('image/')) {
      const blob = await response.blob();
      maskDataUrl = await dataUrlFromBlob(blob);
    } else {
      const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!json) {
        throw new Error('Local SAM2 response was not valid JSON');
      }
      const source =
        readMaskSourceFromOutput(json) ||
        readMaskSourceFromOutput(json.output) ||
        readMaskSourceFromOutput(json.data);
      if (!source) {
        throw new Error('Local SAM2 did not return a mask');
      }
      maskDataUrl = await resolveImageSourceToDataUrl(source);
    }

    return applyMaskToImage(sourceImageData, maskDataUrl);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      const timeoutSeconds = Math.max(5, Math.round(options.localSam2TimeoutMs / 1000));
      throw new Error(
        `Local SAM2 request timed out after ${timeoutSeconds}s. The server may still be processing. Try increasing Timeout, lowering Points/side, or disabling M2M.`
      );
    }
    if (error instanceof TypeError) {
      throw new Error(
        `Could not reach local SAM2 endpoint at ${endpoint}. Start the local server and ensure CORS allows this origin.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function segmentCharacterImage(
  sourceImageData: string,
  options: SegmentationOptions
): Promise<SegmentationResult> {
  const warnings: string[] = [];

  if (options.provider === 'none') {
    return {
      segmentedImageData: sourceImageData,
      usedProvider: 'none',
      warnings,
    };
  }

  if (options.provider === 'background-removal') {
    try {
      const segmented = await removeBackgroundAI(sourceImageData);
      return {
        segmentedImageData: segmented,
        usedProvider: 'background-removal',
        warnings,
      };
    } catch {
      warnings.push('Background-removal model failed; using original transparency.');
      return {
        segmentedImageData: sourceImageData,
        usedProvider: 'none',
        warnings,
      };
    }
  }

  const segmented = await runLocalSam2(sourceImageData, options);
  return {
    segmentedImageData: segmented,
    usedProvider: 'local-sam2',
    warnings,
  };
}
