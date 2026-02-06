import { useState, useRef } from 'react';
import { useAnimationStore } from '../../stores/animationStore';
import styles from './AnimationList.module.css';

export function AnimationList() {
  const animations = useAnimationStore((s) => s.animations);
  const selectedId = useAnimationStore((s) => s.selectedAnimationId);
  const createAnimation = useAnimationStore((s) => s.createAnimation);
  const deleteAnimation = useAnimationStore((s) => s.deleteAnimation);
  const renameAnimation = useAnimationStore((s) => s.renameAnimation);
  const duplicateAnimation = useAnimationStore((s) => s.duplicateAnimation);
  const selectAnimation = useAnimationStore((s) => s.selectAnimation);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleFinishRename = () => {
    if (editingId && editName.trim()) {
      renameAnimation(editingId, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>Animations</span>
        <button
          className={styles.addBtn}
          onClick={() => createAnimation()}
          title="New Animation"
        >
          +
        </button>
      </div>
      <div className={styles.list}>
        {animations.length === 0 && (
          <div className={styles.empty}>
            No animations yet.
            <br />
            Click + to create one.
          </div>
        )}
        {animations.map((anim) => (
          <div
            key={anim.id}
            className={`${styles.item} ${anim.id === selectedId ? styles.selected : ''}`}
            onClick={() => selectAnimation(anim.id)}
            onDoubleClick={() => handleStartRename(anim.id, anim.name)}
          >
            {editingId === anim.id ? (
              <input
                ref={inputRef}
                className={styles.nameInput}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleFinishRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFinishRename();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className={styles.name}>{anim.name}</span>
            )}
            <span className={styles.frameCount}>{anim.frames.length}f</span>
            <div className={styles.actions}>
              <button
                className={styles.smallBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateAnimation(anim.id);
                }}
                title="Duplicate"
              >
                D
              </button>
              <button
                className={styles.smallBtn + ' ' + styles.deleteBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteAnimation(anim.id);
                }}
                title="Delete"
              >
                X
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
