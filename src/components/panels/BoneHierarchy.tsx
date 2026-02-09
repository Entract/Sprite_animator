import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRigStore } from '../../stores/rigStore';
import type { Bone } from '../../types/skeleton';
import { buildAutoRigFromFile } from '../../utils/autoRig';
import {
  analyzeSam2PartsFromFile,
  type Sam2PartInfo,
  type Sam2RegionInfo,
} from '../../utils/sam2Parts';
import type { SegmentationProvider } from '../../utils/segmentation';
import styles from './BoneHierarchy.module.css';

const SEGMENTATION_PROVIDER_LABELS: Record<SegmentationProvider, string> = {
  none: 'Use Existing Alpha',
  'background-removal': 'Built-In Background Removal',
  'local-sam2': 'SAM2 (Local Endpoint)',
};

function formatLabel(label: string): string {
  return label.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatBBox(bbox: [number, number, number, number]): string {
  const [x, y, w, h] = bbox;
  return `x:${x} y:${y} w:${w} h:${h}`;
}

function formatPoint(point: [number, number]): string {
  return `x:${point[0].toFixed(1)} y:${point[1].toFixed(1)}`;
}

export function BoneHierarchy() {
  const skeletons = useRigStore((s) => s.skeletons);
  const selectedSkeletonId = useRigStore((s) => s.selectedSkeletonId);
  const selectSkeleton = useRigStore((s) => s.selectSkeleton);
  const createSkeleton = useRigStore((s) => s.createSkeleton);
  const addBone = useRigStore((s) => s.addBone);
  const selectBone = useRigStore((s) => s.selectBone);
  const attachSpriteToBone = useRigStore((s) => s.attachSpriteToBone);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [autoRigName, setAutoRigName] = useState('');
  const [segmentationProvider, setSegmentationProvider] = useState<SegmentationProvider>('local-sam2');
  const [sam2PointsPerSide, setSam2PointsPerSide] = useState(32);
  const [sam2PredIouThreshold, setSam2PredIouThreshold] = useState(0.8);
  const [sam2StabilityScoreThreshold, setSam2StabilityScoreThreshold] = useState(0.95);
  const [sam2UseM2M, setSam2UseM2M] = useState(true);
  const [localSam2Endpoint, setLocalSam2Endpoint] = useState('http://127.0.0.1:8765/sam2/segment');
  const [localSam2TimeoutSec, setLocalSam2TimeoutSec] = useState(240);
  const [generateAttachments, setGenerateAttachments] = useState(true);
  const [isAutoRigging, setIsAutoRigging] = useState(false);
  const [autoRigStatus, setAutoRigStatus] = useState<string | null>(null);
  const [autoRigError, setAutoRigError] = useState<string | null>(null);

  const partPreviewInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzingParts, setIsAnalyzingParts] = useState(false);
  const [partsPreviewUrl, setPartsPreviewUrl] = useState<string | null>(null);
  const [partsRegionsPreviewUrl, setPartsRegionsPreviewUrl] = useState<string | null>(null);
  const [partsDetected, setPartsDetected] = useState<Sam2PartInfo[]>([]);
  const [partsRegionsDetected, setPartsRegionsDetected] = useState<Sam2RegionInfo[]>([]);
  const [partsImageSize, setPartsImageSize] = useState<{ width: number; height: number } | null>(null);
  const [partsStatus, setPartsStatus] = useState<string | null>(null);
  const [partsError, setPartsError] = useState<string | null>(null);
  const [partsInspectorOpen, setPartsInspectorOpen] = useState(false);
  const [partsInspectorTab, setPartsInspectorTab] = useState<'parts' | 'regions'>('parts');
  
  const activeSkeleton = skeletons.find((s) => s.id === selectedSkeletonId);

  useEffect(() => {
    if (!partsInspectorOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPartsInspectorOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [partsInspectorOpen]);

  const handleStartAutoRig = () => {
    if (isAutoRigging) return;
    if (segmentationProvider === 'local-sam2' && !localSam2Endpoint.trim()) {
      setAutoRigError('Enter a local SAM2 endpoint URL.');
      setAutoRigStatus(null);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleAutoRigFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsAutoRigging(true);
    setAutoRigError(null);
    setAutoRigStatus('Analyzing PNG and building rig layout...');

    try {
      const result = await buildAutoRigFromFile(file, {
        skeletonName: autoRigName.trim() || undefined,
        segmentationProvider,
        sam2PointsPerSide,
        sam2PredIouThreshold,
        sam2StabilityScoreThreshold,
        sam2UseM2M,
        localSam2Endpoint,
        localSam2TimeoutMs: Math.max(5, Math.round(localSam2TimeoutSec)) * 1000,
        generateAttachments,
      });

      setAutoRigStatus('Creating rig and attachments...');

      const skeletonId = createSkeleton(result.skeletonName);
      const boneIdByKey = new Map<string, string>();

      for (const bone of result.bones) {
        const parentId = bone.parentKey ? boneIdByKey.get(bone.parentKey) ?? null : null;
        const boneId = addBone(skeletonId, parentId, {
          name: bone.name,
          x: bone.x,
          y: bone.y,
          rotation: bone.rotation,
          length: bone.length,
          scaleX: bone.scaleX,
          scaleY: bone.scaleY,
          pivotX: bone.pivotX,
          pivotY: bone.pivotY,
        });
        boneIdByKey.set(bone.key, boneId);
      }

      if (generateAttachments) {
        for (const attachment of result.attachments) {
          const boneId = boneIdByKey.get(attachment.boneKey);
          if (!boneId) continue;
          attachSpriteToBone(skeletonId, boneId, {
            imageData: attachment.imageData,
            fileName: attachment.fileName,
            width: attachment.width,
            height: attachment.height,
            x: attachment.x,
            y: attachment.y,
            rotation: attachment.rotation,
            scaleX: attachment.scaleX,
            scaleY: attachment.scaleY,
          });
        }
      }

      const rootId = boneIdByKey.get('root') ?? boneIdByKey.values().next().value ?? null;
      selectSkeleton(skeletonId);
      selectBone(rootId ?? null);

      const warningText = result.warnings.length > 0 ? ` ${result.warnings.join(' ')}` : '';
      const segmentationLabel = SEGMENTATION_PROVIDER_LABELS[result.usedSegmentationProvider];
      setAutoRigStatus(
        `Created "${result.skeletonName}" with ${result.bones.length} bones and ${result.attachments.length} attachments using ${segmentationLabel}.${warningText}`
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Auto-rig failed.';
      setAutoRigError(message);
      setAutoRigStatus(null);
    } finally {
      setIsAutoRigging(false);
    }
  };

  const handleStartPartsAnalysis = () => {
    if (isAnalyzingParts) return;
    if (!localSam2Endpoint.trim()) {
      setPartsError('Enter a local SAM2 endpoint URL first.');
      setPartsStatus(null);
      return;
    }
    partPreviewInputRef.current?.click();
  };

  const handlePartsFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsAnalyzingParts(true);
    setPartsError(null);
    setPartsStatus('Running SAM2 part analysis...');
    setPartsPreviewUrl(null);
    setPartsRegionsPreviewUrl(null);
    setPartsDetected([]);
    setPartsRegionsDetected([]);
    setPartsImageSize(null);

    try {
      const endpointBase = localSam2Endpoint.trim();
      const partsEndpoint = /\/segment\/?$/i.test(endpointBase)
        ? endpointBase.replace(/\/segment\/?$/i, '/parts')
        : `${endpointBase.replace(/\/+$/g, '')}/parts`;

      const result = await analyzeSam2PartsFromFile(file, {
        endpoint: partsEndpoint,
        pointsPerSide: sam2PointsPerSide,
        predIouThreshold: sam2PredIouThreshold,
        stabilityScoreThreshold: sam2StabilityScoreThreshold,
        useM2M: sam2UseM2M,
        timeoutMs: Math.max(5, Math.round(localSam2TimeoutSec)) * 1000,
      });

      setPartsPreviewUrl(result.preview);
      setPartsRegionsPreviewUrl(result.regions_preview);
      setPartsDetected(result.parts);
      setPartsRegionsDetected(result.regions);
      setPartsImageSize({ width: result.image_width, height: result.image_height });
      setPartsStatus(
        `Detected ${result.total_parts} merged parts from ${result.regions.length} SAM2 regions.`
      );
      setPartsInspectorTab('parts');
      setPartsInspectorOpen(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'SAM2 parts analysis failed.';
      setPartsError(message);
      setPartsStatus(null);
      setPartsPreviewUrl(null);
      setPartsRegionsPreviewUrl(null);
      setPartsDetected([]);
      setPartsRegionsDetected([]);
      setPartsImageSize(null);
      setPartsInspectorOpen(false);
    } finally {
      setIsAnalyzingParts(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
         <select 
            className={styles.select}
            value={selectedSkeletonId || ''}
            onChange={(e) => selectSkeleton(e.target.value || null)}
         >
            {skeletons.length === 0 && <option value="">No Rigs</option>}
            {skeletons.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
            ))}
         </select>
         <button className={styles.addBtn} onClick={() => createSkeleton()} title="New Rig">+</button>
      </div>

      <div className={styles.autoRigSection}>
        <div className={styles.autoRigTitle}>Auto-Rig From PNG (Beta)</div>
        <input
          type="text"
          className={styles.select}
          value={autoRigName}
          onChange={(e) => setAutoRigName(e.target.value)}
          placeholder="Rig name (optional)"
          disabled={isAutoRigging}
        />
        <label className={styles.fieldLabel}>Segmentation provider</label>
        <select
          className={styles.select}
          value={segmentationProvider}
          onChange={(e) => setSegmentationProvider(e.target.value as SegmentationProvider)}
          disabled={isAutoRigging}
        >
          <option value="local-sam2">SAM2 (Local Endpoint)</option>
          <option value="background-removal">Built-In Background Removal</option>
          <option value="none">Use Existing Alpha</option>
        </select>
        {segmentationProvider === 'local-sam2' && (
          <>
            <label className={styles.fieldLabel}>Local SAM2 endpoint</label>
            <input
              type="text"
              className={styles.select}
              value={localSam2Endpoint}
              onChange={(e) => setLocalSam2Endpoint(e.target.value)}
              placeholder="http://127.0.0.1:8765/sam2/segment"
              disabled={isAutoRigging}
            />
          </>
        )}
        {segmentationProvider === 'local-sam2' && (
          <>
            <div className={styles.inlineRow}>
              <label className={styles.fieldLabel}>Points/side</label>
              <input
                type="number"
                className={styles.select}
                value={sam2PointsPerSide}
                min={8}
                max={128}
                step={1}
                onChange={(e) => setSam2PointsPerSide(Number(e.target.value) || 32)}
                disabled={isAutoRigging}
              />
            </div>
            <div className={styles.inlineRow}>
              <label className={styles.fieldLabel}>Pred IoU</label>
              <input
                type="number"
                className={styles.select}
                value={sam2PredIouThreshold}
                min={0}
                max={1}
                step={0.01}
                onChange={(e) => setSam2PredIouThreshold(Number(e.target.value) || 0.8)}
                disabled={isAutoRigging}
              />
            </div>
            <div className={styles.inlineRow}>
              <label className={styles.fieldLabel}>Stability</label>
              <input
                type="number"
                className={styles.select}
                value={sam2StabilityScoreThreshold}
                min={0}
                max={1}
                step={0.01}
                onChange={(e) => setSam2StabilityScoreThreshold(Number(e.target.value) || 0.95)}
                disabled={isAutoRigging}
              />
            </div>
            <div className={styles.inlineRow}>
              <label className={styles.fieldLabel}>Timeout (s)</label>
              <input
                type="number"
                className={styles.select}
                value={localSam2TimeoutSec}
                min={5}
                max={1800}
                step={5}
                onChange={(e) => setLocalSam2TimeoutSec(Number(e.target.value) || 240)}
                disabled={isAutoRigging}
              />
            </div>
            <label className={styles.autoRigOption}>
              <input
                type="checkbox"
                checked={sam2UseM2M}
                onChange={(e) => setSam2UseM2M(e.target.checked)}
                disabled={isAutoRigging}
              />
              Enable M2M refinement
            </label>
          </>
        )}
        <label className={styles.autoRigOption}>
          <input
            type="checkbox"
            checked={generateAttachments}
            onChange={(e) => setGenerateAttachments(e.target.checked)}
            disabled={isAutoRigging}
          />
          Generate segmented attachments
        </label>
        <div className={styles.helpText}>
          Local SAM2 is preferred for quality/control. If cuts still look odd, disable segmented attachments and attach pieces manually.
        </div>
        <button
          className={styles.autoRigBtn}
          onClick={handleStartAutoRig}
          disabled={isAutoRigging}
        >
          {isAutoRigging ? 'Auto-rigging...' : 'Select PNG + Auto-rig'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,image/png,image/webp,image/*"
          onChange={handleAutoRigFileChange}
          className={styles.hiddenInput}
        />
        {autoRigStatus && <div className={styles.statusText}>{autoRigStatus}</div>}
        {autoRigError && <div className={styles.errorText}>{autoRigError}</div>}
      </div>

      <div className={styles.autoRigSection}>
        <div className={styles.autoRigTitle}>SAM2 Part Preview (Beta)</div>
        <button
          className={styles.autoRigBtn}
          onClick={handleStartPartsAnalysis}
          disabled={isAnalyzingParts}
        >
          {isAnalyzingParts ? 'Analyzing Parts...' : 'Select PNG + Analyze Parts'}
        </button>
        <input
          ref={partPreviewInputRef}
          type="file"
          accept=".png,image/png,image/webp,image/*"
          onChange={handlePartsFileChange}
          className={styles.hiddenInput}
        />
        {partsStatus && <div className={styles.statusText}>{partsStatus}</div>}
        {partsError && <div className={styles.errorText}>{partsError}</div>}
        {(partsPreviewUrl || partsRegionsPreviewUrl) && (
          <div className={styles.partsActionRow}>
            <button
              className={styles.autoRigBtn}
              onClick={() => setPartsInspectorOpen(true)}
              disabled={isAnalyzingParts}
            >
              Open Part Inspector
            </button>
          </div>
        )}
        {(partsDetected.length > 0 || partsRegionsDetected.length > 0) && (
          <div className={styles.partsSummary}>
            Parts: {partsDetected.length} | Regions: {partsRegionsDetected.length}
            {partsImageSize ? ` | Source: ${partsImageSize.width}x${partsImageSize.height}` : ''}
          </div>
        )}
      </div>

      {activeSkeleton && (
          <div className={styles.header} style={{ borderBottom: '1px solid var(--border-color)', paddingTop: 4, paddingBottom: 4 }}>
             <button 
                className={styles.smallBtn} 
                style={{ width: '100%', height: '24px', fontSize: '12px' }}
                onClick={() => addBone(activeSkeleton.id, null, { name: 'Root' })}
             >
                + Add Root Bone
             </button>
          </div>
      )}

      <div className={styles.list}>
         {activeSkeleton ? (
             <BoneTree skeletonId={activeSkeleton.id} bones={activeSkeleton.bones} />
         ) : (
             <div className={styles.empty}>Create or select a rig</div>
         )}
      </div>

      {partsInspectorOpen && (partsPreviewUrl || partsRegionsPreviewUrl) && (
        <div
          className={styles.partsInspectorOverlay}
          onClick={() => setPartsInspectorOpen(false)}
        >
          <div
            className={styles.partsInspectorDialog}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.partsInspectorHeader}>
              <div className={styles.partsInspectorTitle}>SAM2 Part Inspector</div>
              <button
                className={styles.partsInspectorCloseBtn}
                onClick={() => setPartsInspectorOpen(false)}
                title="Close"
              >
                X
              </button>
            </div>
            <div className={styles.partsInspectorToolbar}>
              <button
                className={`${styles.partsTabBtn} ${
                  partsInspectorTab === 'parts' ? styles.partsTabBtnActive : ''
                }`}
                onClick={() => setPartsInspectorTab('parts')}
              >
                Merged Parts
              </button>
              <button
                className={`${styles.partsTabBtn} ${
                  partsInspectorTab === 'regions' ? styles.partsTabBtnActive : ''
                }`}
                onClick={() => setPartsInspectorTab('regions')}
              >
                Raw Regions
              </button>
              {partsImageSize && (
                <div className={styles.partsInspectorMeta}>
                  Source PNG: {partsImageSize.width}x{partsImageSize.height}
                </div>
              )}
            </div>
            <div className={styles.partsInspectorBody}>
              <div className={styles.partsInspectorPreviewPane}>
                {partsInspectorTab === 'parts' && partsPreviewUrl && (
                  <img
                    src={partsPreviewUrl}
                    alt="Merged SAM2 parts preview"
                    className={styles.partsInspectorImage}
                  />
                )}
                {partsInspectorTab === 'regions' && (partsRegionsPreviewUrl || partsPreviewUrl) && (
                  <img
                    src={partsRegionsPreviewUrl ?? partsPreviewUrl ?? ''}
                    alt="Raw SAM2 regions preview"
                    className={styles.partsInspectorImage}
                  />
                )}
              </div>
              <div className={styles.partsInspectorListPane}>
                {partsInspectorTab === 'parts' && partsDetected.length === 0 && (
                  <div className={styles.empty}>No merged parts returned.</div>
                )}
                {partsInspectorTab === 'regions' && partsRegionsDetected.length === 0 && (
                  <div className={styles.empty}>No raw regions returned.</div>
                )}
                {partsInspectorTab === 'parts' &&
                  partsDetected.map((part, idx) => (
                    <div key={`${part.label}_${idx}`} className={styles.partDetailCard}>
                      <div className={styles.partDetailHead}>
                        <span className={styles.partSwatch} style={{ background: part.color }} />
                        <span className={styles.partLabel}>{formatLabel(part.label)}</span>
                      </div>
                      <div className={styles.partDetailMeta}>
                        <span>{(part.area_ratio * 100).toFixed(1)}% area</span>
                        <span>{formatBBox(part.bbox)}</span>
                        <span>{formatPoint(part.centroid)}</span>
                      </div>
                    </div>
                  ))}
                {partsInspectorTab === 'regions' &&
                  partsRegionsDetected.map((region) => (
                    <div key={region.id} className={styles.partDetailCard}>
                      <div className={styles.partDetailHead}>
                        <span className={styles.partSwatch} style={{ background: region.color }} />
                        <span className={styles.partLabel}>{region.id}</span>
                      </div>
                      <div className={styles.partDetailMeta}>
                        <span>suggested: {formatLabel(region.suggested_label)}</span>
                        <span>{(region.area_ratio * 100).toFixed(1)}% area</span>
                        <span>{formatBBox(region.bbox)}</span>
                        <span>{formatPoint(region.centroid)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BoneTree({ skeletonId, bones }: { skeletonId: string; bones: Bone[] }) {
    const roots = bones.filter((b) => !b.parentId);
    
    return (
        <div>
            {roots.map((bone) => (
                <BoneNode key={bone.id} bone={bone} allBones={bones} skeletonId={skeletonId} depth={0} />
            ))}
        </div>
    );
}

interface BoneNodeProps {
    bone: Bone;
    allBones: Bone[];
    skeletonId: string;
    depth: number;
}

function BoneNode({ bone, allBones, skeletonId, depth }: BoneNodeProps) {
    const selectedBoneId = useRigStore((s) => s.selectedBoneId);
    const selectBone = useRigStore((s) => s.selectBone);
    const addBone = useRigStore((s) => s.addBone);
    const removeBone = useRigStore((s) => s.removeBone);
    const updateBone = useRigStore((s) => s.updateBone);

    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState(bone.name);
    const inputRef = useRef<HTMLInputElement>(null);

    const children = allBones.filter((b) => b.parentId === bone.id);
    const isSelected = bone.id === selectedBoneId;

    const handleStartRename = () => {
        setEditing(true);
        setEditName(bone.name);
        setTimeout(() => inputRef.current?.select(), 0);
    };

    const handleFinishRename = () => {
        if (editName.trim()) {
            updateBone(skeletonId, bone.id, { name: editName.trim() });
        }
        setEditing(false);
    };

    return (
        <div>
            <div 
                className={`${styles.item} ${isSelected ? styles.selected : ''}`}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={() => selectBone(bone.id)}
                onDoubleClick={handleStartRename}
            >
                {editing ? (
                     <input
                        ref={inputRef}
                        className={styles.select} // reusing style
                        style={{ width: '100%', height: '20px' }}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleFinishRename}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleFinishRename();
                            if (e.key === 'Escape') setEditing(false);
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span className={styles.boneName}>{bone.name}</span>
                )}
                
                <div className={styles.actions}>
                    <button 
                        className={styles.smallBtn}
                        onClick={(e) => {
                            e.stopPropagation();
                            addBone(skeletonId, bone.id, { name: 'Bone' });
                        }}
                        title="Add Child"
                    >
                        +
                    </button>
                    <button 
                        className={`${styles.smallBtn} ${styles.deleteBtn}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            removeBone(skeletonId, bone.id);
                        }}
                        title="Delete"
                    >
                        X
                    </button>
                </div>
            </div>
            {children.map((child) => (
                <BoneNode key={child.id} bone={child} allBones={allBones} skeletonId={skeletonId} depth={depth + 1} />
            ))}
        </div>
    );
}
