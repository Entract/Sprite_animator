import { useUIStore } from '../../stores/uiStore';
import { AnimationList } from '../panels/AnimationList';
import { BoneHierarchy } from '../panels/BoneHierarchy';
import styles from './LeftPanel.module.css';

export function LeftPanel() {
  const mode = useUIStore((s) => s.mode);

  return (
    <div className={styles.panel}>
      {mode === 'frame' ? (
        <AnimationList />
      ) : (
        <BoneHierarchy />
      )}
    </div>
  );
}
