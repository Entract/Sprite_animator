import { useEffect, useMemo, useState } from 'react';
import { useAnimationStore } from '../../stores/animationStore';
import {
  exportAnimationPackage,
  type AnimationExportOptions,
  type ExportDestination,
  type ExportImageFormat,
  type ExportPivotMode,
  type ExportSourcePivotMode,
  type ExportSmoothing,
} from '../../engine/ExportEngine';
import { getCachedImage } from '../../utils/imageLoader';
import type { PackLayout } from '../../engine/SpriteSheetPacker';
import styles from './ExportDialog.module.css';

interface ExportDialogProps {
  onClose: () => void;
}

type CanvasPreset = 'source' | '128' | '192' | '256' | '384' | '512' | 'custom';

let lastDirectoryHandle: FileSystemDirectoryHandle | null = null;
let lastDirectoryLabel = '';

function toSafeFolderName(name: string): string {
  let normalized = '';
  for (const ch of name) {
    normalized += ch.charCodeAt(0) < 32 ? '_' : ch;
  }

  const cleaned = normalized
    .trim()
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'animation_export';
}

export function ExportDialog({ onClose }: ExportDialogProps) {
  const selectedAnimationId = useAnimationStore((s) => s.selectedAnimationId);
  const animations = useAnimationStore((s) => s.animations);
  const updateFrame = useAnimationStore((s) => s.updateFrame);
  const animation = animations.find((a) => a.id === selectedAnimationId);

  const [folderName, setFolderName] = useState(animation ? toSafeFolderName(animation.name) : 'animation_export');
  const [destination, setDestination] = useState<ExportDestination>('download');
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(lastDirectoryHandle);
  const [directoryLabel, setDirectoryLabel] = useState(lastDirectoryLabel);
  const [includeSpriteSheet, setIncludeSpriteSheet] = useState(true);
  const [includeSequence, setIncludeSequence] = useState(false);
  const [format, setFormat] = useState<ExportImageFormat>('png');
  const [webpQuality, setWebpQuality] = useState(92);
  const [layout, setLayout] = useState<PackLayout>('row');
  const [padding, setPadding] = useState(1);
  const [includeJson, setIncludeJson] = useState(true);
  const [canvasPreset, setCanvasPreset] = useState<CanvasPreset>('source');
  const [canvasWidth, setCanvasWidth] = useState(256);
  const [canvasHeight, setCanvasHeight] = useState(256);
  const [pivotMode, setPivotMode] = useState<ExportPivotMode>('bottom-center');
  const [pivotX, setPivotX] = useState(128);
  const [pivotY, setPivotY] = useState(255);
  const [sourcePivotMode, setSourcePivotMode] =
    useState<ExportSourcePivotMode>('opaque-bottom-center');
  const [fitToCanvas, setFitToCanvas] = useState(true);
  const [targetSpriteHeight, setTargetSpriteHeight] = useState<number | ''>('');
  const [smoothing, setSmoothing] = useState<ExportSmoothing>('pixelated');
  const [exporting, setExporting] = useState(false);
  const [scalePercent, setScalePercent] = useState(100);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    if (!animation) return;
    setFolderName(toSafeFolderName(animation.name));
  }, [animation]);

  const directoryPickerSupported =
    typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  const resolvedCanvasWidth = useMemo(() => {
    if (canvasPreset === 'custom') return Math.max(1, canvasWidth);
    if (canvasPreset === 'source') return 0;
    return parseInt(canvasPreset, 10);
  }, [canvasPreset, canvasWidth]);

  const resolvedCanvasHeight = useMemo(() => {
    if (canvasPreset === 'custom') return Math.max(1, canvasHeight);
    if (canvasPreset === 'source') return 0;
    return parseInt(canvasPreset, 10);
  }, [canvasPreset, canvasHeight]);

  const canExport =
    !exporting &&
    !!animation &&
    animation.frames.length > 0 &&
    (includeSpriteSheet || includeSequence) &&
    (destination !== 'directory' || directoryHandle !== null);

  const preflight = useMemo(() => {
    const largestWidth = animation
      ? Math.max(...animation.frames.map((f) => f.width), 0)
      : 0;
    const largestHeight = animation
      ? Math.max(...animation.frames.map((f) => f.height), 0)
      : 0;

    if (!animation || canvasPreset === 'source') {
      return {
        largestWidth,
        largestHeight,
        clippingRisk: false,
      };
    }

    const targetW = resolvedCanvasWidth || 1;
    const targetH = resolvedCanvasHeight || 1;
    const effectiveScale =
      targetSpriteHeight !== ''
        ? Math.max(1, Number(targetSpriteHeight)) / Math.max(1, largestHeight)
        : fitToCanvas
          ? targetH / Math.max(1, largestHeight)
          : 1;
    const projectedWidth = largestWidth * effectiveScale;

    const clippingRisk =
      projectedWidth > targetW ||
      (!fitToCanvas && targetSpriteHeight === '' && largestHeight > targetH);

    return {
      largestWidth,
      largestHeight,
      clippingRisk,
      projectedWidth: Math.round(projectedWidth),
      targetW,
      targetH,
    };
  }, [
    animation,
    canvasPreset,
    resolvedCanvasWidth,
    resolvedCanvasHeight,
    fitToCanvas,
    targetSpriteHeight,
  ]);

  if (!animation) return null;

  const handleExport = async () => {
    if (!includeSpriteSheet && !includeSequence) {
      alert('Select at least one output type: Sprite Sheet and/or Frame Sequence.');
      return;
    }
    if (destination === 'directory' && !directoryHandle) {
      alert('Choose an export folder first.');
      return;
    }

    setExporting(true);
    try {
      const images = await loadImages();
      const exportOptions: AnimationExportOptions = {
        folderName: toSafeFolderName(folderName || animation.name),
        destination,
        directoryHandle,
        layout,
        padding,
        includeJson,
        includeSpriteSheet,
        includeSequence,
        format,
        webpQuality: Math.max(0, Math.min(100, webpQuality)) / 100,
        canvasMode: canvasPreset === 'source' ? 'source' : 'fixed',
        canvasWidth: resolvedCanvasWidth || 256,
        canvasHeight: resolvedCanvasHeight || 256,
        pivotMode,
        pivotX,
        pivotY,
        sourcePivotMode,
        fitToCanvas,
        targetSpriteHeight:
          targetSpriteHeight === '' ? null : Math.max(1, Number(targetSpriteHeight)),
        smoothing,
      };
      await exportAnimationPackage(animation, images, exportOptions);

      if (destination === 'directory') {
        alert(`Export complete. Files were written to "${directoryLabel}/${toSafeFolderName(folderName || animation.name)}".`);
      }
    } finally {
      setExporting(false);
    }
  };

  const handleChooseFolder = async () => {
    if (!directoryPickerSupported) {
      alert('Directory export is not supported in this environment. Use Download ZIP instead.');
      return;
    }

    try {
      const picker = window as Window & {
        showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
      };
      const handle = await picker.showDirectoryPicker?.();
      if (!handle) return;
      lastDirectoryHandle = handle;
      lastDirectoryLabel = handle.name || 'Selected Folder';
      setDirectoryHandle(handle);
      setDirectoryLabel(lastDirectoryLabel);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error(err);
      alert('Could not select folder.');
    }
  };

  const loadImages = async () => {
    const images = new Map<string, HTMLImageElement>();
    const loaded = await Promise.all(
      animation.frames.map(async (frame) => {
        try {
          const img = await getCachedImage(frame.imageData);
          return { frameId: frame.id, img };
        } catch {
          return null;
        }
      })
    );
    loaded.forEach((entry) => {
      if (entry) images.set(entry.frameId, entry.img);
    });
    return images;
  };

  const handleRescale = async () => {
    if (scalePercent === 100) return;
    setResizing(true);
    try {
      const scale = scalePercent / 100;
      const images = await loadImages();
      
      for (const frame of animation.frames) {
        const img = images.get(frame.id);
        if (img) {
          const newWidth = Math.round(frame.width * scale);
          const newHeight = Math.round(frame.height * scale);
          
          const canvas = document.createElement('canvas');
          canvas.width = newWidth;
          canvas.height = newHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
             // High quality scaling
             ctx.imageSmoothingEnabled = true;
             ctx.imageSmoothingQuality = 'high';
             ctx.drawImage(img, 0, 0, newWidth, newHeight);
             
             updateFrame(animation.id, frame.id, {
               imageData: canvas.toDataURL('image/png'),
               width: newWidth,
               height: newHeight
             });
          }
        }
      }
      setScalePercent(100); // Reset after apply
    } finally {
      setResizing(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>Export & Tools</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            X
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.info}>
            Editing: <strong>{animation.name}</strong> ({animation.frames.length}{' '}
            frames)
          </div>
          
          <div className={styles.section}>
            <h4>Rescale Animation</h4>
            <div className={styles.field}>
              <label>Scale (%)</label>
              <div className={styles.row}>
                <input
                  type="number"
                  value={scalePercent}
                  onChange={(e) => setScalePercent(Math.max(1, parseInt(e.target.value) || 100))}
                  min={1}
                  max={500}
                />
                <button 
                  onClick={handleRescale} 
                  disabled={resizing || scalePercent === 100}
                  className={styles.actionBtn}
                >
                  {resizing ? 'Resizing...' : 'Apply Scale'}
                </button>
              </div>
              <p className={styles.hint}>This will resize all frames in the animation.</p>
            </div>
          </div>

          <div className={styles.separator} />

          <div className={styles.section}>
            <h4>Package</h4>
            <div className={styles.field}>
              <label>Folder Name</label>
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label>Image Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as ExportImageFormat)}
              >
                <option value="png">PNG (Lossless)</option>
                <option value="webp">WebP (Smaller)</option>
              </select>
            </div>
            {format === 'webp' && (
              <>
                <div className={styles.field}>
                  <label>WebP Quality</label>
                  <div className={styles.row}>
                    <input
                      type="number"
                      value={webpQuality}
                      onChange={(e) => setWebpQuality(Math.max(1, Math.min(100, parseInt(e.target.value) || 92)))}
                      min={1}
                      max={100}
                    />
                    <span className={styles.value}>{webpQuality}%</span>
                  </div>
                </div>
                <p className={styles.hint}>
                  WebP sheets are limited to 16383px per side. Large row/column sheets auto-wrap.
                </p>
              </>
            )}
            <div className={styles.field}>
              <label>Export Sprite Sheet</label>
              <input
                type="checkbox"
                checked={includeSpriteSheet}
                onChange={(e) => setIncludeSpriteSheet(e.target.checked)}
              />
            </div>
            <div className={styles.field}>
              <label>Export Frame Sequence</label>
              <input
                type="checkbox"
                checked={includeSequence}
                onChange={(e) => setIncludeSequence(e.target.checked)}
              />
            </div>
            <div className={styles.field}>
              <label>Include JSON metadata</label>
              <input
                type="checkbox"
                checked={includeJson}
                onChange={(e) => setIncludeJson(e.target.checked)}
              />
            </div>
          </div>

          <div className={styles.separator} />

          <div className={styles.section}>
            <h4>Canvas & Pivot</h4>
            <div className={styles.field}>
              <label>Canvas Size</label>
              <select
                value={canvasPreset}
                onChange={(e) => setCanvasPreset(e.target.value as CanvasPreset)}
              >
                <option value="source">Source Size (Per-Frame)</option>
                <option value="128">128 x 128</option>
                <option value="192">192 x 192</option>
                <option value="256">256 x 256</option>
                <option value="384">384 x 384</option>
                <option value="512">512 x 512</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            {canvasPreset === 'custom' && (
              <div className={styles.field}>
                <label>Custom Size</label>
                <div className={styles.row}>
                  <input
                    type="number"
                    value={canvasWidth}
                    onChange={(e) => setCanvasWidth(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                  />
                  <span>x</span>
                  <input
                    type="number"
                    value={canvasHeight}
                    onChange={(e) => setCanvasHeight(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                  />
                </div>
              </div>
            )}

            {canvasPreset !== 'source' && (
              <>
                <div className={styles.field}>
                  <label>Source Pivot</label>
                  <select
                    value={sourcePivotMode}
                    onChange={(e) => setSourcePivotMode(e.target.value as ExportSourcePivotMode)}
                  >
                    <option value="opaque-bottom-center">Opaque Bottom-Center (Recommended)</option>
                    <option value="opaque-center">Opaque Center</option>
                    <option value="frame-offset">Frame Offset (Manual)</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Pivot</label>
                  <select
                    value={pivotMode}
                    onChange={(e) => setPivotMode(e.target.value as ExportPivotMode)}
                  >
                    <option value="bottom-center">Bottom-Center (Game Friendly)</option>
                    <option value="center">Center</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                {pivotMode === 'custom' && (
                  <div className={styles.field}>
                    <label>Custom Pivot</label>
                    <div className={styles.row}>
                      <input
                        type="number"
                        value={pivotX}
                        onChange={(e) => setPivotX(parseInt(e.target.value) || 0)}
                      />
                      <span>,</span>
                      <input
                        type="number"
                        value={pivotY}
                        onChange={(e) => setPivotY(parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                )}
              <div className={styles.field}>
                  <label>Fit Tallest to Height</label>
                  <input
                    type="checkbox"
                    checked={fitToCanvas}
                    onChange={(e) => setFitToCanvas(e.target.checked)}
                  />
                </div>
              </>
            )}

            <div className={styles.field}>
              <label>Target Sprite Height</label>
              <input
                type="number"
                value={targetSpriteHeight}
                placeholder="auto"
                onChange={(e) =>
                  setTargetSpriteHeight(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))
                }
                min={1}
              />
            </div>
            <p className={styles.hint}>Optional. Scales all frames uniformly so the tallest opaque sprite reaches this height.</p>

            <div className={styles.field}>
              <label>Scaling Filter</label>
              <select
                value={smoothing}
                onChange={(e) => setSmoothing(e.target.value as ExportSmoothing)}
              >
                <option value="pixelated">Pixelated (Nearest)</option>
                <option value="smooth">Smooth</option>
              </select>
            </div>

            {canvasPreset !== 'source' && (
              <div className={styles.preflight}>
                <strong>Preflight:</strong> Largest source frame {preflight.largestWidth} x {preflight.largestHeight}
                {` | Projected width at scale: ${preflight.projectedWidth}/${preflight.targetW}`}
                {preflight.clippingRisk ? ' | Clipping risk detected (increase canvas width or reduce target height).' : ' | No obvious clipping risk.'}
              </div>
            )}
          </div>

          {includeSpriteSheet && (
            <>
              <div className={styles.separator} />

              <div className={styles.section}>
                <h4>Sprite Sheet</h4>
                <div className={styles.field}>
                  <label>Layout</label>
                  <select
                    value={layout}
                    onChange={(e) => setLayout(e.target.value as PackLayout)}
                  >
                    <option value="row">Horizontal Row</option>
                    <option value="column">Vertical Column</option>
                    <option value="grid">Grid</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <label>Padding (px)</label>
                  <input
                    type="number"
                    value={padding}
                    onChange={(e) => setPadding(Math.max(0, parseInt(e.target.value) || 0))}
                    min={0}
                    max={32}
                  />
                </div>
              </div>
            </>
          )}

          <div className={styles.separator} />

          <div className={styles.section}>
            <h4>Destination</h4>
            <div className={styles.field}>
              <label>Save To</label>
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value as ExportDestination)}
              >
                <option value="download">Download ZIP (Downloads folder)</option>
                <option value="directory">Write to Folder (Unzipped)</option>
              </select>
            </div>

            {destination === 'directory' && (
              <>
                <div className={styles.row}>
                  <button
                    className={styles.actionBtn}
                    onClick={handleChooseFolder}
                    type="button"
                    disabled={!directoryPickerSupported}
                  >
                    {directoryPickerSupported ? 'Choose Export Folder' : 'Folder Export Not Supported'}
                  </button>
                  {directoryLabel && <span className={styles.value}>{directoryLabel}</span>}
                </div>
                <p className={styles.hint}>
                  Export writes to: <strong>{directoryLabel || '(not selected)'}/{toSafeFolderName(folderName || animation.name)}</strong>
                </p>
              </>
            )}

            {destination === 'download' && (
              <p className={styles.hint}>
                Export downloads one ZIP package to your browser Downloads location.
              </p>
            )}

            <button
              className={styles.exportBtn}
              onClick={handleExport}
              disabled={!canExport}
            >
              {exporting ? 'Exporting Package...' : 'Export Package'}
            </button>
          </div>
        </div>

        <div className={styles.footer}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
