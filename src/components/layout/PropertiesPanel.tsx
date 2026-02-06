import { useUIStore } from '../../stores/uiStore';
import { FrameProperties } from '../panels/FrameProperties';
import { BoneProperties } from '../panels/BoneProperties';
import styles from './PropertiesPanel.module.css';

export function PropertiesPanel() {
  const mode = useUIStore((s) => s.mode);

  return (
    <div className={styles.panel}>
      {mode === 'frame' ? (
        <FrameProperties />
      ) : (
        <BoneProperties />
      )}
    </div>
  );
}
