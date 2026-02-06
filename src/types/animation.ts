export interface Frame {
  id: string;
  imageData: string;
  fileName: string;
  width: number;
  height: number;
  duration?: number;
  offsetX: number;
  offsetY: number;
}

export interface Animation {
  id: string;
  name: string;
  fps: number;
  frames: Frame[];
  loop: boolean;
}
