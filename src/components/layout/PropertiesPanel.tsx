import { useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { FrameProperties } from '../panels/FrameProperties';
import { BoneProperties } from '../panels/BoneProperties';
import { IKConstraintPanel } from '../panels/IKConstraintPanel';
import styles from './PropertiesPanel.module.css';

export function PropertiesPanel() {
  const mode = useUIStore((s) => s.mode);
  const [activeTab, setActiveTab] = useState<'bone' | 'ik'>('bone');

  return (
    <div className={styles.panel}>
      {mode === 'frame' ? (
        <FrameProperties />
      ) : (
        <>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'bone' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('bone')}
            >
              Bone
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'ik' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('ik')}
            >
              IK
            </button>
          </div>
          <div className={styles.tabContent}>
            {activeTab === 'bone' ? <BoneProperties /> : <IKConstraintPanel />}
          </div>
        </>
      )}
    </div>
  );
}
