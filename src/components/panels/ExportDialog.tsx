import { useState } from 'react';
import { useAnimationStore } from '../../stores/animationStore';
import { exportAnimation } from '../../engine/ExportEngine';
import { getCachedImage } from '../../utils/imageLoader';
import type { PackLayout } from '../../engine/SpriteSheetPacker';
import styles from './ExportDialog.module.css';

interface ExportDialogProps {
  onClose: () => void;
}

export function ExportDialog({ onClose }: ExportDialogProps) {
  const selectedAnimationId = useAnimationStore((s) => s.selectedAnimationId);
  const animations = useAnimationStore((s) => s.animations);
  const animation = animations.find((a) => a.id === selectedAnimationId);

  const [layout, setLayout] = useState<PackLayout>('row');
  const [padding, setPadding] = useState(1);
  const [includeJson, setIncludeJson] = useState(true);
  const [exporting, setExporting] = useState(false);

  if (!animation) return null;

  const handleExport = async () => {
    setExporting(true);
    try {
      const images = new Map<string, HTMLImageElement>();
      for (const frame of animation.frames) {
        try {
          const img = await getCachedImage(frame.imageData);
          images.set(frame.id, img);
        } catch {
          // skip
        }
      }

      await exportAnimation(animation, images, { layout, padding, includeJson });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>Export Sprite Sheet</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            X
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.info}>
            Exporting: <strong>{animation.name}</strong> ({animation.frames.length}{' '}
            frames)
          </div>

          <div className={styles.field}>
            <label>Layout</label>
            <select value={layout} onChange={(e) => setLayout(e.target.value as PackLayout)}>
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
              max={16}
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

        <div className={styles.footer}>
          <button onClick={onClose}>Cancel</button>
          <button
            className={styles.exportBtn}
            onClick={handleExport}
            disabled={exporting || animation.frames.length === 0}
          >
            {exporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
