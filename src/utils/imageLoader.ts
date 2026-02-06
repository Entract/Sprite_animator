export interface LoadedImage {
  objectUrl: string;
  fileName: string;
  width: number;
  height: number;
  htmlImage: HTMLImageElement;
}

export function loadImageFromFile(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      resolve({
        objectUrl,
        fileName: file.name,
        width: img.naturalWidth,
        height: img.naturalHeight,
        htmlImage: img,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load image: ${file.name}`));
    };

    img.src = objectUrl;
  });
}

export async function loadImagesFromFiles(files: File[]): Promise<LoadedImage[]> {
  const pngFiles = files.filter(
    (f) => f.type === 'image/png' || f.name.toLowerCase().endsWith('.png')
  );

  const results = await Promise.allSettled(pngFiles.map(loadImageFromFile));

  return results
    .filter((r): r is PromiseFulfilledResult<LoadedImage> => r.status === 'fulfilled')
    .map((r) => r.value);
}

const imageCache = new Map<string, HTMLImageElement>();

export function getCachedImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}
