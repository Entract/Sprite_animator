import { useRigStore } from '../../stores/rigStore';
import styles from './BoneProperties.module.css';

export function IKConstraintPanel() {
  const selectedSkeleton = useRigStore((s) => s.getSelectedSkeleton());
  const selectedBoneId = useRigStore((s) => s.selectedBoneId);
  const selectedIKConstraintId = useRigStore((s) => s.selectedIKConstraintId);
  const addIKConstraint = useRigStore((s) => s.addIKConstraint);
  const updateIKConstraint = useRigStore((s) => s.updateIKConstraint);
  const removeIKConstraint = useRigStore((s) => s.removeIKConstraint);
  const selectIKConstraint = useRigStore((s) => s.selectIKConstraint);

  if (!selectedSkeleton) return null;

  const constraints = selectedSkeleton.ikConstraints;
  const selectedConstraint = constraints.find(c => c.id === selectedIKConstraintId);

  // Find bones that can have IK (must have a parent - need at least 2 bones in chain)
  const eligibleBones = selectedSkeleton.bones.filter(b => b.parentId !== null);

  const handleAddConstraint = () => {
    if (selectedBoneId && selectedSkeleton.bones.find(b => b.id === selectedBoneId)?.parentId) {
      addIKConstraint(selectedSkeleton.id, selectedBoneId);
    } else if (eligibleBones.length > 0) {
      addIKConstraint(selectedSkeleton.id, eligibleBones[0].id);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          IK Constraints
          <button
            className={styles.addBtn}
            onClick={handleAddConstraint}
            disabled={eligibleBones.length === 0}
            title={eligibleBones.length === 0 ? "Need bones with parents for IK" : "Add IK constraint"}
          >
            + Add IK
          </button>
        </div>

        {constraints.length === 0 ? (
          <div className={styles.empty}>No IK constraints. Select a bone with a parent and click "Add IK".</div>
        ) : (
          <div className={styles.constraintList}>
            {constraints.map(c => {
              const targetBone = selectedSkeleton.bones.find(b => b.id === c.targetBoneId);
              return (
                <div
                  key={c.id}
                  className={`${styles.constraintItem} ${c.id === selectedIKConstraintId ? styles.selected : ''}`}
                  onClick={() => selectIKConstraint(c.id)}
                >
                  <span className={styles.constraintName}>{c.name}</span>
                  <span className={styles.constraintTarget}>{targetBone?.name || 'Unknown'}</span>
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeIKConstraint(selectedSkeleton.id, c.id);
                    }}
                    title="Remove constraint"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedConstraint && (
        <>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>Constraint Settings</div>
            <div className={styles.row}>
              <label>Name</label>
              <input
                type="text"
                value={selectedConstraint.name}
                onChange={(e) => updateIKConstraint(selectedSkeleton.id, selectedConstraint.id, { name: e.target.value })}
              />
            </div>
            <div className={styles.row}>
              <label>Target Bone</label>
              <select
                value={selectedConstraint.targetBoneId}
                onChange={(e) => updateIKConstraint(selectedSkeleton.id, selectedConstraint.id, { targetBoneId: e.target.value })}
              >
                {eligibleBones.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.row}>
              <label>Enabled</label>
              <input
                type="checkbox"
                checked={selectedConstraint.enabled}
                onChange={(e) => updateIKConstraint(selectedSkeleton.id, selectedConstraint.id, { enabled: e.target.checked })}
              />
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>Target Position</div>
            <div className={styles.row}>
              <label>Target X</label>
              <input
                type="number"
                value={Math.round(selectedConstraint.targetX)}
                onChange={(e) => updateIKConstraint(selectedSkeleton.id, selectedConstraint.id, { targetX: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className={styles.row}>
              <label>Target Y</label>
              <input
                type="number"
                value={Math.round(selectedConstraint.targetY)}
                onChange={(e) => updateIKConstraint(selectedSkeleton.id, selectedConstraint.id, { targetY: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>IK Options</div>
            <div className={styles.row}>
              <label>Mix</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selectedConstraint.mix}
                onChange={(e) => updateIKConstraint(selectedSkeleton.id, selectedConstraint.id, { mix: parseFloat(e.target.value) })}
              />
              <span className={styles.value}>{Math.round(selectedConstraint.mix * 100)}%</span>
            </div>
            <div className={styles.row}>
              <label>Bend Direction</label>
              <select
                value={selectedConstraint.bendPositive ? 'positive' : 'negative'}
                onChange={(e) => updateIKConstraint(selectedSkeleton.id, selectedConstraint.id, { bendPositive: e.target.value === 'positive' })}
              >
                <option value="positive">Positive (CCW)</option>
                <option value="negative">Negative (CW)</option>
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
