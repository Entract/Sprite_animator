import { Image as KonvaImage } from 'react-konva';
import { useUIStore } from '../../stores/uiStore';
import { useAnimationStore } from '../../stores/animationStore';

interface FrameRendererProps {
  images: Map<string, HTMLImageElement>;
}

export function FrameRenderer({ images }: FrameRendererProps) {
  const selectedAnimationId = useAnimationStore((s) => s.selectedAnimationId);
  const animations = useAnimationStore((s) => s.animations);
  const animation = animations.find((a) => a.id === selectedAnimationId);
  const frames = animation?.frames ?? [];
  const currentFrameIndex = useUIStore((s) => s.playback.currentFrameIndex);
  const onionSkin = useUIStore((s) => s.onionSkin);

  const currentFrame = frames[currentFrameIndex];

  // Build onion skin frames
  const onionFrames: { frame: typeof currentFrame; opacity: number }[] = [];
  if (onionSkin.enabled && frames.length > 1) {
    for (let i = 1; i <= onionSkin.prevCount; i++) {
      const idx = currentFrameIndex - i;
      if (idx >= 0 && frames[idx]) {
        onionFrames.push({
          frame: frames[idx],
          opacity: onionSkin.opacity * (1 - (i - 1) / onionSkin.prevCount),
        });
      }
    }
    for (let i = 1; i <= onionSkin.nextCount; i++) {
      const idx = currentFrameIndex + i;
      if (idx < frames.length && frames[idx]) {
        onionFrames.push({
          frame: frames[idx],
          opacity: onionSkin.opacity * (1 - (i - 1) / onionSkin.nextCount),
        });
      }
    }
  }

  return (
    <>
      {/* Onion skin frames */}
      {onionFrames.map(({ frame: oFrame, opacity }, i) => {
        const img = oFrame ? images.get(oFrame.id) : null;
        if (!img || !oFrame) return null;
        return (
          <KonvaImage
            key={`onion-${i}`}
            image={img}
            x={-oFrame.width / 2 + oFrame.offsetX}
            y={-oFrame.height / 2 + oFrame.offsetY}
            opacity={opacity}
            filters={[]} // TODO: Apply tint
            listening={false}
          />
        );
      })}

      {/* Current frame */}
      {currentFrame && images.get(currentFrame.id) && (
        <KonvaImage
          image={images.get(currentFrame.id)!}
          x={-currentFrame.width / 2 + currentFrame.offsetX}
          y={-currentFrame.height / 2 + currentFrame.offsetY}
          listening={false}
        />
      )}
    </>
  );
}
