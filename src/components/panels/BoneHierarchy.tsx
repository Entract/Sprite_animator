import { useState, useRef } from 'react';
import { useRigStore } from '../../stores/rigStore';
import type { Bone } from '../../types/skeleton';
import styles from './BoneHierarchy.module.css';

export function BoneHierarchy() {
  const skeletons = useRigStore((s) => s.skeletons);
  const selectedSkeletonId = useRigStore((s) => s.selectedSkeletonId);
  const selectSkeleton = useRigStore((s) => s.selectSkeleton);
  const createSkeleton = useRigStore((s) => s.createSkeleton);
  const addBone = useRigStore((s) => s.addBone);
  
  const activeSkeleton = skeletons.find((s) => s.id === selectedSkeletonId);

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
