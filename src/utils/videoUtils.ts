
export interface ExtractedFrame {
  imageData: string;
  width: number;
  height: number;
}

export async function extractFramesFromVideo(
  file: File,
  targetFps: number = 24
): Promise<ExtractedFrame[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const videoUrl = URL.createObjectURL(file);
    
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    // video.crossOrigin = 'anonymous'; // Removed for local blob URL compatibility

    video.onloadedmetadata = async () => {
      const frames: ExtractedFrame[] = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not create canvas context'));
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const duration = video.duration;
      const totalFrames = Math.floor(duration * targetFps);
      const interval = 1 / targetFps;

      for (let i = 0; i < totalFrames; i++) {
        const currentTime = i * interval;
        video.currentTime = currentTime;
        
        await new Promise<void>((r) => {
          video.onseeked = () => r();
        });

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push({
          imageData: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height,
        });
      }

      URL.revokeObjectURL(videoUrl);
      resolve(frames);
    };

    video.onerror = () => {
      URL.revokeObjectURL(videoUrl);
      reject(new Error('Failed to load video'));
    };
  });
}
