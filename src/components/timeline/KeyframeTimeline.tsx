import { useRef } from 'react';
import { useRigStore } from '../../stores/rigStore';
import { useUIStore } from '../../stores/uiStore';
import styles from './KeyframeTimeline.module.css';

const PX_PER_MS = 0.1; // 100px = 1 sec

export function KeyframeTimeline() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedSkeleton = useRigStore(s => s.getSelectedSkeleton());
  const selectedAnimation = useRigStore(s => s.getSelectedRigAnimation());
  const currentTime = useRigStore(s => s.currentTime);
  const setRigTime = useRigStore(s => s.setRigTime);
  const setKeyframe = useRigStore(s => s.setKeyframe);
  const deleteKeyframe = useRigStore(s => s.deleteKeyframe);
  
  const createAnimation = useRigStore(s => s.createRigAnimation);
  const selectRigAnimation = useRigStore(s => s.selectRigAnimation);

  const isPlaying = useUIStore(s => s.playback.isPlaying);
  const setPlaying = useUIStore(s => s.setPlaying);

  // If no animation, show create button
  if (!selectedSkeleton) return <div className={styles.empty}>Select a Rig first</div>;

  if (!selectedAnimation) {
      return (
          <div className={styles.container} style={{ alignItems: 'center', justifyContent: 'center' }}>
             <button onClick={() => createAnimation(selectedSkeleton.id)}>Create Animation</button>
             {selectedSkeleton.rigAnimations.length > 0 && (
                 <select onChange={(e) => selectRigAnimation(e.target.value)}>
                     <option value="">Select Animation...</option>
                     {selectedSkeleton.rigAnimations.map(a => (
                         <option key={a.id} value={a.id}>{a.name}</option>
                     ))}
                 </select>
             )}
          </div>
      );
  }

  // Bones list
  const bones = selectedSkeleton.bones;

  const handleRulerClick = (e: React.MouseEvent) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft || 0);
      const time = Math.max(0, x / PX_PER_MS);
      setRigTime(time);
  };

  const handleTrackClick = (e: React.MouseEvent, boneId: string) => {
      // If double click, add keyframe?
      if (e.detail === 2) {
          setKeyframe(selectedSkeleton.id, selectedAnimation.id, boneId, currentTime);
      }
  };
  
  const handleKeyframeClick = (e: React.MouseEvent, boneId: string, time: number) => {
      e.stopPropagation();
      if (e.altKey) {
          deleteKeyframe(selectedSkeleton.id, selectedAnimation.id, boneId, time);
      } else {
          setRigTime(time);
      }
  };

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
          <button onClick={() => setPlaying(!isPlaying)}>
              {isPlaying ? 'Pause' : 'Play'}
          </button>
          <select value={selectedAnimation.id} onChange={(e) => selectRigAnimation(e.target.value)}>
              {selectedSkeleton.rigAnimations.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
              ))}
          </select>
          <button onClick={() => createAnimation(selectedSkeleton.id)}>New</button>
          <span>{Math.round(currentTime)}ms</span>
      </div>

      <div className={styles.timelineArea}>
        <div className={styles.trackLabels}>
           <div className={styles.trackLabelHeader}>Bones</div>
           {bones.map(b => (
               <div key={b.id} className={styles.trackLabelRow} title={b.name}>{b.name}</div>
           ))}
        </div>

        <div className={styles.trackContent} ref={scrollRef}>
           <div 
             className={styles.ruler} 
             style={{ width: Math.max(selectedAnimation.duration * PX_PER_MS, 2000) }}
             onClick={handleRulerClick}
           >
               {/* Scrubber */}
               <div 
                className={styles.scrubber} 
                style={{ left: currentTime * PX_PER_MS }}
               >
                   <div className={styles.scrubberHead} />
               </div>
           </div>

           {bones.map(b => {
               const track = selectedAnimation.tracks.find(t => t.boneId === b.id);
               return (
                   <div 
                     key={b.id} 
                     className={styles.trackRow}
                     style={{ width: Math.max(selectedAnimation.duration * PX_PER_MS, 2000) }}
                     onDoubleClick={(e) => handleTrackClick(e, b.id)}
                   >
                       {track?.keyframes.map((k, i) => (
                           <div 
                             key={i} 
                             className={styles.keyframe}
                             style={{ left: k.time * PX_PER_MS - 6 }}
                             onClick={(e) => handleKeyframeClick(e, b.id, k.time)}
                             title={`Time: ${Math.round(k.time)}ms (Alt+Click to delete)`}
                           />
                       ))}
                   </div>
               );
           })}
        </div>
      </div>
    </div>
  );
}
