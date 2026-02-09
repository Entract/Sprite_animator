import { removeBackground } from '@imgly/background-removal';

export interface Pixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function getPixel(data: Uint8ClampedArray, x: number, y: number, width: number): Pixel {
  const i = (y * width + x) * 4;
  return {
    r: data[i],
    g: data[i + 1],
    b: data[i + 2],
    a: data[i + 3],
  };
}

export function setPixel(data: Uint8ClampedArray, x: number, y: number, width: number, pixel: Pixel) {
  const i = (y * width + x) * 4;
  data[i] = pixel.r;
  data[i + 1] = pixel.g;
  data[i + 2] = pixel.b;
  data[i + 3] = pixel.a;
}

export function colorDistance(p1: Pixel, p2: Pixel): number {
  return Math.sqrt(
    Math.pow(p1.r - p2.r, 2) +
    Math.pow(p1.g - p2.g, 2) +
    Math.pow(p1.b - p2.b, 2)
  );
}

export function fuzzySelect(
  imageData: ImageData,
  startX: number,
  startY: number,
  threshold: number
): Uint8ClampedArray {
  const { width, height, data } = imageData;
  const newData = new Uint8ClampedArray(data);
  const targetColor = getPixel(data, startX, startY, width);
  
  const visited = new Uint8Array(width * height);
  const queue: [number, number][] = [[startX, startY]];
  visited[startY * width + startX] = 1;

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    
    // Set to transparent
    setPixel(newData, x, y, width, { r: 0, g: 0, b: 0, a: 0 });

    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const idx = ny * width + nx;
        if (!visited[idx]) {
          const currentColor = getPixel(data, nx, ny, width);
          if (colorDistance(targetColor, currentColor) <= threshold) {
            visited[idx] = 1;
            queue.push([nx, ny]);
          }
        }
      }
    }
  }

  return newData;
}

export async function processImage(
  dataUrl: string,
  processor: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      
      processor(ctx, canvas);
      
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}

export function applyFuzzySelect(
  dataUrl: string,
  startX: number,
  startY: number,
  threshold: number
): Promise<string> {
  return processImage(dataUrl, (ctx, canvas) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const newData = fuzzySelect(imageData, startX, startY, threshold);
    ctx.putImageData(new ImageData(newData, canvas.width, canvas.height), 0, 0);
  });
}

export async function removeColorFromImage(
  dataUrl: string,
  targetColor: Pixel,
  threshold: number
): Promise<string> {
  return processImage(dataUrl, (ctx, canvas) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = imageData;
    const newData = new Uint8ClampedArray(data);

    for (let i = 0; i < data.length; i += 4) {
      const currentColor = { r: data[i], g: data[i+1], b: data[i+2], a: data[i+3] };
      if (colorDistance(targetColor, currentColor) <= threshold) {
        newData[i+3] = 0; // Set alpha to 0
      }
    }
    
    ctx.putImageData(new ImageData(newData, width, height), 0, 0);
  });
}

export function eraseColorLocal(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  targetColor: Pixel,
  tolerance: number
): boolean {
  let hasChanges = false;
  const radiusSq = radius * radius;
  
  // Calculate bounding box for the circle to avoid checking every pixel
  const startX = Math.max(0, Math.floor(centerX - radius));
  const endX = Math.min(width, Math.ceil(centerX + radius));
  const startY = Math.max(0, Math.floor(centerY - radius));
  const endY = Math.min(height, Math.ceil(centerY + radius));

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy <= radiusSq) {
        const i = (y * width + x) * 4;
        // Skip already transparent pixels
        if (data[i + 3] === 0) continue;

        const currentColor = { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
        if (colorDistance(targetColor, currentColor) <= tolerance) {
          data[i + 3] = 0; // Set alpha to 0
          hasChanges = true;
        }
      }
    }
  }
  return hasChanges;
}

export function clearArea(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  w: number,
  h: number
): boolean {
  let hasChanges = false;
  const endX = Math.min(width, startX + w);
  const endY = Math.min(height, startY + h);
  const sX = Math.max(0, startX);
  const sY = Math.max(0, startY);

  for (let y = sY; y < endY; y++) {
    for (let x = sX; x < endX; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] !== 0) {
        data[i + 3] = 0;
        hasChanges = true;
      }
    }
  }
  return hasChanges;
}

export function keepConnected(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number
): boolean {
  let hasChanges = false;
  const visited = new Uint8Array(width * height);
  const queue: [number, number][] = [[startX, startY]];
  
  // 1. Identify the island
  const startIdx = (startY * width + startX) * 4;
  if (data[startIdx + 3] === 0) return false; // Clicked on empty space

  visited[startY * width + startX] = 1;

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const idx = ny * width + nx;
        if (!visited[idx]) {
          const pixelIdx = idx * 4;
          // Check if pixel is not transparent (alpha > 10 for noise tolerance)
          if (data[pixelIdx + 3] > 10) {
            visited[idx] = 1;
            queue.push([nx, ny]);
          }
        }
      }
    }
  }

  // 2. Clear everything else
  for (let i = 0; i < width * height; i++) {
    if (!visited[i]) {
      const pixelIdx = i * 4;
      if (data[pixelIdx + 3] !== 0) {
        data[pixelIdx + 3] = 0;
        hasChanges = true;
      }
    }
  }

  return hasChanges;
}

export async function removeBackgroundAI(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const resultBlob = await removeBackground(blob);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(resultBlob);
  });
}

/**
 * Calculates the bounding box of non-transparent pixels in an image.
 */
export async function getBoundingBox(dataUrl: string): Promise<{ x: number, y: number, width: number, height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = imageData;
      
      let minX = width, minY = height, maxX = -1, maxY = -1;
      let found = false;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const alpha = data[(y * width + x) * 4 + 3];
          if (alpha > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            found = true;
          }
        }
      }

      if (!found) {
        resolve(null);
      } else {
        resolve({
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1
        });
      }
    };
    img.src = dataUrl;
  });
}

/**
 * Crops an image to a specific bounding box.
 */
export async function cropImage(dataUrl: string, rect: { x: number, y: number, width: number, height: number }): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext('2d')!;
      
      ctx.drawImage(
        img, 
        rect.x, rect.y, rect.width, rect.height, // Source
        0, 0, rect.width, rect.height          // Destination
      );
      
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}