import { useRigStore } from '../../stores/rigStore';
import { DropZone } from '../shared/DropZone';
import { loadImageFromFile } from '../../utils/imageLoader';
import styles from './BoneProperties.module.css';

export function BoneProperties() {
  const selectedSkeleton = useRigStore((s) => s.getSelectedSkeleton());
  const selectedBoneId = useRigStore((s) => s.selectedBoneId);
  const updateBone = useRigStore((s) => s.updateBone);
  const reparentBone = useRigStore((s) => s.reparentBone);
  const attachSpriteToBone = useRigStore((s) => s.attachSpriteToBone);

  if (!selectedSkeleton || !selectedBoneId) {
    return (
        <div className={styles.container}>
            <div className={styles.empty}>Select a bone to edit properties</div>
        </div>
    );
  }

  const bone = selectedSkeleton.bones.find((b) => b.id === selectedBoneId);
  if (!bone) return null;

  const handleSpriteDrop = async (files: File[]) => {
     if (files.length === 0) return;
     const file = files[0];
     try {
         const { objectUrl, width, height } = await loadImageFromFile(file);
         
         attachSpriteToBone(selectedSkeleton.id, bone.id, {
             imageData: objectUrl,
             fileName: file.name,
             width,
             height,
             x: 0,
             y: 0,
             rotation: 0,
             scaleX: 1,
             scaleY: 1
         });
     } catch (err) {
         console.error(err);
     }
  };

  const parentOptions = selectedSkeleton.bones
    .filter(b => b.id !== bone.id)
    .map(b => ({ id: b.id, name: b.name }));

  const currentSlot = selectedSkeleton.slots.find(s => s.boneId === bone.id);

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>Bone Properties</div>
        <div className={styles.row}>
            <label>Name</label>
            <input 
                type="text" 
                value={bone.name} 
                onChange={(e) => updateBone(selectedSkeleton.id, bone.id, { name: e.target.value })}
            />
        </div>
        <div className={styles.row}>
            <label>Parent</label>
            <select 
                value={bone.parentId || ''} 
                onChange={(e) => reparentBone(selectedSkeleton.id, bone.id, e.target.value || null)}
            >
                <option value="">(Root)</option>
                {parentOptions.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </select>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>Transform</div>
        <div className={styles.row}>
            <label>Length</label>
            <input 
                type="number" 
                value={Math.round(bone.length)} 
                onChange={(e) => updateBone(selectedSkeleton.id, bone.id, { length: parseFloat(e.target.value) })}
            />
        </div>
        <div className={styles.row}>
            <label>X</label>
            <input 
                type="number" 
                value={Math.round(bone.x)} 
                onChange={(e) => updateBone(selectedSkeleton.id, bone.id, { x: parseFloat(e.target.value) })}
            />
        </div>
        <div className={styles.row}>
            <label>Y</label>
            <input 
                type="number" 
                value={Math.round(bone.y)} 
                onChange={(e) => updateBone(selectedSkeleton.id, bone.id, { y: parseFloat(e.target.value) })}
            />
        </div>
        <div className={styles.row}>
            <label>Rotation</label>
            <input 
                type="number" 
                value={Math.round(bone.rotation)} 
                onChange={(e) => updateBone(selectedSkeleton.id, bone.id, { rotation: parseFloat(e.target.value) })}
            />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>Attachment</div>
        <DropZone onFilesDropped={handleSpriteDrop} className={styles.dropArea}>
            <p>Drop Sprite PNG here</p>
        </DropZone>
        {currentSlot?.attachment && (
            <div className={styles.row}>
                <label>Active</label>
                <span className={styles.value} title={currentSlot.attachment}>
                    {currentSlot.attachment}
                </span>
            </div>
        )}
      </div>
    </div>
  );
}
