type FrameCallback = (frameIndex: number) => void;
type TimeCallback = (time: number) => void;

export class PlaybackEngine {
  private animationId: number | null = null;
  private lastTime = 0;
  private accumulator = 0;
  
  // Frame Mode
  private fps = 12;
  private frameCount = 0;
  private currentFrame = 0;
  
  // Time Mode
  private duration = 0;
  private currentTime = 0;

  private loop = true;
  private mode: 'frame' | 'time' = 'frame';
  
  private frameCallback: FrameCallback | null = null;
  private timeCallback: TimeCallback | null = null;
  
  private _isPlaying = false;

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  configure(fps: number, frameCount: number, loop: boolean, startFrame: number = 0) {
    this.mode = 'frame';
    this.fps = Math.max(1, fps);
    this.frameCount = frameCount;
    this.loop = loop;
    this.currentFrame = startFrame;
  }

  configureRig(duration: number, loop: boolean, startTime: number = 0) {
    this.mode = 'time';
    this.duration = Math.max(1, duration);
    this.loop = loop;
    this.currentTime = startTime;
  }

  play(callback: FrameCallback) {
    if (this.frameCount < 1) return; // Allow 1 frame?
    this.mode = 'frame';
    this.frameCallback = callback;
    this.startLoop();
  }

  playRig(callback: TimeCallback) {
    if (this.duration <= 0) return;
    this.mode = 'time';
    this.timeCallback = callback;
    this.startLoop();
  }

  private startLoop() {
    this._isPlaying = true;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.tick();
  }

  stop() {
    this._isPlaying = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.frameCallback = null;
    this.timeCallback = null;
  }

  private tick = () => {
    if (!this._isPlaying) return;

    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;

    if (this.mode === 'frame') {
        this.accumulator += delta;
        const frameInterval = 1000 / this.fps;

        while (this.accumulator >= frameInterval) {
          this.accumulator -= frameInterval;
          this.currentFrame++;

          if (this.currentFrame >= this.frameCount) {
            if (this.loop) {
              this.currentFrame = 0;
            } else {
              this.currentFrame = this.frameCount - 1;
              this.stop();
              return;
            }
          }
          this.frameCallback?.(this.currentFrame);
        }
    } else {
        // Time Mode
        this.currentTime += delta;
        
        if (this.currentTime >= this.duration) {
            if (this.loop) {
                this.currentTime %= this.duration;
            } else {
                this.currentTime = this.duration;
                this.stop();
                // Ensure we send the final time update
                this.timeCallback?.(this.currentTime);
                return;
            }
        }
        this.timeCallback?.(this.currentTime);
    }

    this.animationId = requestAnimationFrame(this.tick);
  };

  destroy() {
    this.stop();
  }
}
