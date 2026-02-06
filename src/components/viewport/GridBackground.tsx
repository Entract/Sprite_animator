import { Shape } from 'react-konva';

interface GridBackgroundProps {
  width: number;
  height: number;
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;
}

const CHECKER_SIZE = 16;
const GRID_SIZE = 64;

export function GridBackground({ width, height, zoom, panX, panY, showGrid }: GridBackgroundProps) {
  return (
    <>
      {/* Checkerboard transparency pattern */}
      <Shape
        sceneFunc={(context, shape) => {
          const ctx = context._context;
          const step = CHECKER_SIZE;
          const cols = Math.ceil(width / step) + 1;
          const rows = Math.ceil(height / step) + 1;

          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              ctx.fillStyle = (row + col) % 2 === 0 ? '#2a2a3e' : '#222236';
              ctx.fillRect(col * step, row * step, step, step);
            }
          }

          context.fillStrokeShape(shape);
        }}
        listening={false}
      />

      {/* Grid overlay */}
      {showGrid && (
        <Shape
          sceneFunc={(context, shape) => {
            const ctx = context._context;
            const step = GRID_SIZE * zoom;

            if (step < 8) return;

            ctx.strokeStyle = 'rgba(100, 100, 140, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();

            const offsetX = (panX * zoom) % step;
            const offsetY = (panY * zoom) % step;

            for (let x = offsetX; x < width; x += step) {
              ctx.moveTo(Math.round(x) + 0.5, 0);
              ctx.lineTo(Math.round(x) + 0.5, height);
            }
            for (let y = offsetY; y < height; y += step) {
              ctx.moveTo(0, Math.round(y) + 0.5);
              ctx.lineTo(width, Math.round(y) + 0.5);
            }
            ctx.stroke();

            // Origin crosshair
            const ox = panX * zoom + width / 2;
            const oy = panY * zoom + height / 2;
            ctx.strokeStyle = 'rgba(100, 181, 246, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ox, 0);
            ctx.lineTo(ox, height);
            ctx.moveTo(0, oy);
            ctx.lineTo(width, oy);
            ctx.stroke();

            context.fillStrokeShape(shape);
          }}
          listening={false}
        />
      )}
    </>
  );
}
