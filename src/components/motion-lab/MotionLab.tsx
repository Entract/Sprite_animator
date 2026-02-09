import { useEffect, useMemo, useState } from 'react';
import styles from './MotionLab.module.css';
import { DropZone } from '../shared/DropZone';
import { useAnimationStore } from '../../stores/animationStore';
import { useUIStore } from '../../stores/uiStore';
import { extractFramesFromVideo } from '../../utils/videoUtils';

type MotionModelId =
  | 'google/veo-3.1-fast'
  | 'bytedance/seedance-1-pro'
  | 'bytedance/seedance-1-lite';

type SeedanceResolution = '480p' | '720p' | '1080p';
type SeedanceAspectRatio = '1:1' | '16:9' | '9:16';

interface MotionModelDefinition {
  id: MotionModelId;
  label: string;
  endpoint: string;
  docsUrl: string;
  description: string;
  durationOptions: number[];
  resolutionOptions?: SeedanceResolution[];
  aspectRatioOptions?: SeedanceAspectRatio[];
  supportsCameraFixed: boolean;
}

const MOTION_MODELS: MotionModelDefinition[] = [
  {
    id: 'google/veo-3.1-fast',
    label: 'Google Veo 3.1 Fast',
    endpoint: '/api/replicate/models/google/veo-3.1-fast/predictions',
    docsUrl: 'https://replicate.com/google/veo-3.1-fast',
    description: 'Current default model. Reliable baseline for your existing workflow.',
    durationOptions: [4, 6, 8],
    supportsCameraFixed: false,
  },
  {
    id: 'bytedance/seedance-1-pro',
    label: 'ByteDance Seedance 1 Pro',
    endpoint: '/api/replicate/models/bytedance/seedance-1-pro/predictions',
    docsUrl: 'https://replicate.com/bytedance/seedance-1-pro',
    description: 'Higher-end Seedance variant. Good quality for stylized 2D motion tests.',
    durationOptions: [5, 10],
    resolutionOptions: ['480p', '1080p'],
    aspectRatioOptions: ['1:1', '16:9', '9:16'],
    supportsCameraFixed: true,
  },
  {
    id: 'bytedance/seedance-1-lite',
    label: 'ByteDance Seedance 1 Lite',
    endpoint: '/api/replicate/models/bytedance/seedance-1-lite/predictions',
    docsUrl: 'https://replicate.com/bytedance/seedance-1-lite',
    description: 'Cheaper/faster Seedance option with 2-12s durations.',
    durationOptions: [2, 3, 4, 5, 6, 8, 10, 12],
    resolutionOptions: ['480p', '720p'],
    aspectRatioOptions: ['1:1', '16:9', '9:16'],
    supportsCameraFixed: true,
  },
];

function getModelById(id: MotionModelId): MotionModelDefinition {
  return MOTION_MODELS.find((m) => m.id === id) ?? MOTION_MODELS[0];
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

export function MotionLab() {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('A 2D game sprite character performing a walk cycle animation. The character from the image walks forward steadily. The art style is consistent with the input pixel sprite, with no color swirling or distortion. Solid background.');
  const [modelId, setModelId] = useState<MotionModelId>('google/veo-3.1-fast');
  const [duration, setDuration] = useState<number>(4);
  const [seedanceResolution, setSeedanceResolution] = useState<SeedanceResolution>('720p');
  const [seedanceAspectRatio, setSeedanceAspectRatio] = useState<SeedanceAspectRatio>('1:1');
  const [cameraFixed, setCameraFixed] = useState(true);
  const [seed, setSeed] = useState<number | ''>('');
  const [extractionFps, setExtractionFps] = useState(12);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(localStorage.getItem('replicate_api_key') || '');
  const [showSettings, setShowSettings] = useState(false);

  const addFrames = useAnimationStore((s) => s.addFrames);
  const selectedAnimationId = useAnimationStore((s) => s.selectedAnimationId);
  const createAnimation = useAnimationStore((s) => s.createAnimation);
  const setMode = useUIStore((s) => s.setMode);

  const selectedModel = useMemo(() => getModelById(modelId), [modelId]);

  const setGeneratedVideoManaged = (url: string | null) => {
    setGeneratedVideo((prev) => {
      if (prev?.startsWith('blob:')) {
        URL.revokeObjectURL(prev);
      }
      return url;
    });
  };

  useEffect(() => {
    if (!selectedModel.durationOptions.includes(duration)) {
      setDuration(selectedModel.durationOptions[0]);
    }

    if (selectedModel.resolutionOptions && !selectedModel.resolutionOptions.includes(seedanceResolution)) {
      setSeedanceResolution(selectedModel.resolutionOptions[0]);
    }

    if (selectedModel.aspectRatioOptions && !selectedModel.aspectRatioOptions.includes(seedanceAspectRatio)) {
      setSeedanceAspectRatio(selectedModel.aspectRatioOptions[0]);
    }

    if (!selectedModel.supportsCameraFixed) {
      setCameraFixed(true);
    }
  }, [selectedModel, duration, seedanceResolution, seedanceAspectRatio]);

  useEffect(() => {
    return () => {
      if (generatedVideo?.startsWith('blob:')) {
        URL.revokeObjectURL(generatedVideo);
      }
    };
  }, [generatedVideo]);

  const handleImageDrop = async (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        setSourceImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddToWorkbench = async () => {
    if (!generatedVideo) return;
    
    setIsExtracting(true);
    try {
      // 1. Fetch the video blob
      const response = await fetch(generatedVideo);
      if (!response.ok) throw new Error(`Failed to download video file: ${response.statusText}`);
      
      const blob = await response.blob();
      console.log('Video Blob Size:', blob.size, 'Type:', blob.type);

      if (blob.size < 1000) throw new Error('Downloaded file is too small (likely error text)');
      if (!blob.type.includes('video')) throw new Error(`Downloaded file is not a video (${blob.type})`);

      const file = new File([blob], "generated_motion.mp4", { type: "video/mp4" });

      // 2. Extract frames (using user-defined FPS)
      const frames = await extractFramesFromVideo(file, extractionFps);
      
      if (frames.length === 0) throw new Error('No frames extracted from video');

      // 3. Add to store
      let animId = selectedAnimationId;
      if (!animId) {
        animId = createAnimation("AI Generation");
      }

      addFrames(animId, frames.map((f, i) => ({
        imageData: f.imageData,
        fileName: `ai_gen_${i}.png`,
        width: f.width,
        height: f.height
      })));

      // 4. Switch mode
      setMode('frame');
    } catch (err: unknown) {
      console.error(err);
      alert(`Error adding to workbench: ${getErrorMessage(err)}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('replicate_api_key', key);
  };

  const handleGenerate = async () => {
    if (!apiKey) {
      setShowSettings(true);
      return;
    }
    if (!sourceImage) {
      alert('Please drop a source sprite first!');
      return;
    }

    setGeneratedVideoManaged(null);
    setIsGenerating(true);
    try {
      const input: Record<string, string | number | boolean> = {
        image: sourceImage,
        prompt,
        duration,
      };

      if (seed !== '') {
        input.seed = seed;
      }

      if (selectedModel.id.startsWith('bytedance/seedance-1')) {
        input.resolution = seedanceResolution;
        input.aspect_ratio = seedanceAspectRatio;
        input.fps = 24;
        input.camera_fixed = cameraFixed;
      } else {
        input.generate_audio = false;
      }

      const response = await fetch(selectedModel.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null) as
          | { detail?: string; error?: string }
          | null;
        throw new Error(error?.detail || error?.error || 'Failed to start generation');
      }

      let prediction = await response.json() as {
        id: string;
        status: string;
        output?: string[] | string;
        error?: string;
      };
      const predictionId = prediction.id;

      // 2. Poll for results
      const poll = async () => {
        try {
          const pollResponse = await fetch(`/api/replicate/predictions/${predictionId}`, {
            headers: {
              'Authorization': `Token ${apiKey}`,
            },
          });
          if (!pollResponse.ok) {
            throw new Error(`Polling failed (${pollResponse.status})`);
          }

          prediction = await pollResponse.json() as typeof prediction;

          if (prediction.status === 'succeeded') {
            const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
            if (!outputUrl) {
              throw new Error('No output URL returned by model');
            }
            
            // CRITICAL FIX: Download the video data immediately into a local blob
            // This fixes the "0:00" issue and CORS blocks for extraction.
            try {
              const videoResponse = await fetch(outputUrl);
              const videoBlob = await videoResponse.blob();
              const localUrl = URL.createObjectURL(videoBlob);
              setGeneratedVideoManaged(localUrl);
            } catch (fetchErr: unknown) {
              console.error('Failed to proxy video:', fetchErr);
              setGeneratedVideoManaged(outputUrl); // Fallback
            }
            
            setIsGenerating(false);
          } else if (prediction.status === 'failed') {
            throw new Error(prediction.error || 'Generation failed on server');
          } else {
            // Poll again in 2 seconds
            setTimeout(poll, 2000);
          }
        } catch (pollErr: unknown) {
          console.error(pollErr);
          setIsGenerating(false);
          alert('Generation error: ' + getErrorMessage(pollErr));
        }
      };

      poll();

    } catch (err: unknown) {
      console.error(err);
      alert('Generation error: ' + getErrorMessage(err));
      setIsGenerating(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Left: Input */}
      <div className={styles.leftPanel}>
        <div className={styles.section}>
          <h3>Source Sprite</h3>
          <DropZone onFilesDropped={handleImageDrop} className={styles.dropTarget}>
            {sourceImage ? (
              <img src={sourceImage} alt="Source" />
            ) : (
              <p>Drag & Drop Sprite Here</p>
            )}
          </DropZone>
        </div>

        <div className={styles.section}>
          <h3>History</h3>
          <div className={styles.historyGrid}>
            {/* Placeholders */}
            <div className={styles.historyItem} />
            <div className={styles.historyItem} />
            <div className={styles.historyItem} />
          </div>
        </div>
      </div>

      {/* Center: Preview */}
      <div className={styles.center}>
        <div className={styles.previewArea}>
          {isGenerating ? (
            <div className={styles.loading}>
              Generating Motion...
            </div>
          ) : generatedVideo ? (
            <div className={styles.videoContainer}>
              <video 
                src={generatedVideo} 
                controls 
                loop 
                autoPlay 
                muted 
                playsInline
                className={styles.videoPreview} 
              />
              <div className={styles.videoActions}>
                <button 
                  className={styles.actionBtn} 
                  onClick={handleAddToWorkbench}
                  disabled={isExtracting}
                >
                  {isExtracting ? 'Extracting Frames...' : 'Add to Workbench'}
                </button>
                <a 
                  href={generatedVideo} 
                  target="_blank" 
                  download="motion.mp4" 
                  className={styles.downloadLink}
                >
                  Download MP4
                </a>
              </div>
            </div>
          ) : (
            <p style={{ color: '#666' }}>Preview Area</p>
          )}
        </div>
      </div>

      {/* Right: Controls */}
      <div className={styles.rightPanel}>
        <div className={styles.section}>
          <h3>Generation Controls</h3>

          <div className={styles.field}>
            <label>Model</label>
            <select
              className={styles.select}
              value={modelId}
              onChange={(e) => setModelId(e.target.value as MotionModelId)}
            >
              {MOTION_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
            <span style={{ fontSize: '11px', color: '#999' }}>
              {selectedModel.description}{' '}
              <a href={selectedModel.docsUrl} target="_blank" rel="noreferrer" style={{ color: '#7db8ff' }}>
                Model page
              </a>
            </span>
          </div>
          
          <div className={styles.field}>
            <label>Prompt</label>
            <textarea 
              className={styles.textarea} 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label>Duration (Seconds)</label>
            <select 
              className={styles.select}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value, 10))}
            >
              {selectedModel.durationOptions.map((value) => (
                <option key={value} value={value}>
                  {value} Seconds
                </option>
              ))}
            </select>
          </div>

          {selectedModel.resolutionOptions && (
            <div className={styles.field}>
              <label>Resolution</label>
              <select
                className={styles.select}
                value={seedanceResolution}
                onChange={(e) => setSeedanceResolution(e.target.value as SeedanceResolution)}
              >
                {selectedModel.resolutionOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedModel.aspectRatioOptions && (
            <div className={styles.field}>
              <label>Aspect Ratio</label>
              <select
                className={styles.select}
                value={seedanceAspectRatio}
                onChange={(e) => setSeedanceAspectRatio(e.target.value as SeedanceAspectRatio)}
              >
                {selectedModel.aspectRatioOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedModel.supportsCameraFixed && (
            <div className={styles.field}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={cameraFixed}
                  onChange={(e) => setCameraFixed(e.target.checked)}
                />
                Lock Camera (recommended for sprite cycles)
              </label>
            </div>
          )}

          <div className={styles.field}>
            <label>Seed (Optional)</label>
            <input 
              type="number" 
              className={styles.input} 
              placeholder="Random"
              value={seed}
              onChange={(e) => setSeed(e.target.value ? parseInt(e.target.value) : '')}
            />
          </div>

          <div className={styles.field}>
            <label>Extraction FPS: {extractionFps}</label>
            <input 
              type="range" 
              min="4" 
              max="24" 
              step="4"
              value={extractionFps}
              onChange={(e) => setExtractionFps(parseInt(e.target.value))}
            />
            <span style={{ fontSize: '10px', color: '#888' }}>
              Lower FPS = Fewer frames in workbench
            </span>
          </div>

          <button 
            className={styles.generateBtn}
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? 'Weaving Motion...' : 'Generate Video'}
          </button>

          <div className={styles.settingsLink} onClick={() => setShowSettings(true)}>
            {apiKey ? 'API Key Configured' : 'Configure API Key'}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
        }} onClick={() => setShowSettings(false)}>
          <div style={{
            background: '#242424', padding: '20px', borderRadius: '8px', 
            width: '400px', border: '1px solid #333'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Motion Lab Settings</h3>
            <p style={{ fontSize: '13px', color: '#aaa' }}>
              To generate videos, you need a <strong>Replicate API Token</strong>.
              <br/>
              Sign up at <a href="https://replicate.com" target="_blank" style={{color: '#0078d4'}}>replicate.com</a>.
            </p>
            <div className={styles.field}>
              <label>Replicate API Token</label>
              <input 
                type="password" 
                className={styles.input} 
                value={apiKey}
                onChange={(e) => saveApiKey(e.target.value)}
                placeholder="r8_..."
              />
            </div>
            <button 
              className={styles.generateBtn} 
              onClick={() => setShowSettings(false)}
            >
              Save & Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
