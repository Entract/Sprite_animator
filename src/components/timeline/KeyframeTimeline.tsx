import { useRef, useState, useEffect } from 'react';
import { useRigStore } from '../../stores/rigStore';
import { useUIStore } from '../../stores/uiStore';
import styles from './KeyframeTimeline.module.css';

export function KeyframeTimeline() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [timelineZoom, setTimelineZoom] = useState(0.15); // px per ms

  const selectedSkeleton = useRigStore(s => s.getSelectedSkeleton());
  const selectedAnimation = useRigStore(s => s.getSelectedRigAnimation());
  const currentTime = useRigStore(s => s.currentTime);
  const setRigTime = useRigStore(s => s.setRigTime);
  const setKeyframe = useRigStore(s => s.setKeyframe);
  const deleteKeyframe = useRigStore(s => s.deleteKeyframe);

  const createAnimation = useRigStore(s => s.createRigAnimation);
  const selectRigAnimation = useRigStore(s => s.selectRigAnimation);
  const updateRigAnimation = useRigStore(s => s.updateRigAnimation);

  const isPlaying = useUIStore(s => s.playback.isPlaying);
  const setPlaying = useUIStore(s => s.setPlaying);

  // Sync scroll between labels and content
  const handleScroll = () => {
    if (scrollRef.current && labelsRef.current) {
      labelsRef.current.scrollTop = scrollRef.current.scrollTop;
    }
  };

  // Auto-scroll to keep scrubber visible during playback
  useEffect(() => {
    if (isPlaying && scrollRef.current && selectedAnimation) {
      const scrubberX = currentTime * timelineZoom;
      const viewLeft = scrollRef.current.scrollLeft;
      const viewRight = viewLeft + scrollRef.current.clientWidth - 150;

      if (scrubberX < viewLeft + 50 || scrubberX > viewRight - 50) {
        scrollRef.current.scrollLeft = Math.max(0, scrubberX - 100);
      }
    }
  }, [currentTime, isPlaying]);

  if (!selectedSkeleton) {
    return <div className={styles.empty}>Select a Rig first</div>;
  }

  if (!selectedAnimation) {
    return (
      <div className={styles.container} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <button onClick={() => createAnimation(selectedSkeleton.id)}>Create Animation</button>
        {selectedSkeleton.rigAnimations.length > 0 && (
          <select onChange={(e) => selectRigAnimation(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="">Select Animation...</option>
            {selectedSkeleton.rigAnimations.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
      </div>
    );
  }

  const bones = selectedSkeleton.bones;
  const timelineWidth = Math.max(selectedAnimation.duration * timelineZoom + 200, 2000);

  const handleRulerClick = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft || 0);
    const time = Math.max(0, Math.min(selectedAnimation.duration, x / timelineZoom));
    setPlaying(false);
    setRigTime(time);
  };

  const handleTrackDoubleClick = (boneId: string) => {
    setKeyframe(selectedSkeleton.id, selectedAnimation.id, boneId, currentTime);
  };

  const handleKeyframeClick = (e: React.MouseEvent, boneId: string, time: number) => {
    e.stopPropagation();
    if (e.altKey) {
      deleteKeyframe(selectedSkeleton.id, selectedAnimation.id, boneId, time);
    } else {
      setPlaying(false);
      setRigTime(time);
    }
  };

  const handleDurationChange = (newDuration: number) => {
    if (updateRigAnimation) {
      updateRigAnimation(selectedSkeleton.id, selectedAnimation.id, { duration: newDuration });
    }
  };

  const handleLoopChange = (loop: boolean) => {
    if (updateRigAnimation) {
      updateRigAnimation(selectedSkeleton.id, selectedAnimation.id, { loop });
    }
  };

  // Generate time markers
  const markers: { time: number; label: string; major: boolean }[] = [];
  const majorInterval = timelineZoom > 0.2 ? 500 : timelineZoom > 0.1 ? 1000 : 2000;
  const minorInterval = majorInterval / 4;

  for (let t = 0; t <= selectedAnimation.duration + majorInterval; t += minorInterval) {
    const isMajor = t % majorInterval === 0;
    markers.push({
      time: t,
      label: isMajor ? `${(t / 1000).toFixed(1)}s` : '',
      major: isMajor,
    });
  }

  return (
    <div className={styles.container}>
      {/* Controls bar */}
      <div className={styles.controls}>
        <button onClick={() => setPlaying(!isPlaying)} className={isPlaying ? styles.activeBtn : ''}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button onClick={() => { setPlaying(false); setRigTime(0); }}>Stop</button>

        <span className={styles.separator} />

        <select value={selectedAnimation.id} onChange={(e) => selectRigAnimation(e.target.value)}>
          {selectedSkeleton.rigAnimations.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <button onClick={() => createAnimation(selectedSkeleton.id)} title="New Animation">+</button>

        <span className={styles.separator} />

        <label className={styles.controlLabel}>Duration:</label>
        <input
          type="number"
          value={selectedAnimation.duration}
          onChange={(e) => handleDurationChange(Math.max(100, parseInt(e.target.value) || 1000))}
          className={styles.numberInput}
          min={100}
          step={100}
        />
        <span className={styles.unit}>ms</span>

        <label className={styles.controlLabel}>
          <input
            type="checkbox"
            checked={selectedAnimation.loop}
            onChange={(e) => handleLoopChange(e.target.checked)}
          />
          Loop
        </label>

        <span className={styles.separator} />

        <label className={styles.controlLabel}>Zoom:</label>
        <input
          type="range"
          min={0.05}
          max={0.5}
          step={0.01}
          value={timelineZoom}
          onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
          className={styles.zoomSlider}
        />

        <span className={styles.separator} />

        <span className={styles.timeDisplay}>{Math.round(currentTime)}ms</span>
      </div>

      {/* Timeline area */}
      <div className={styles.timelineArea}>
        {/* Track labels */}
        <div className={styles.trackLabels} ref={labelsRef}>
          <div className={styles.trackLabelHeader}>Bones</div>
          {bones.map(b => (
            <div key={b.id} className={styles.trackLabelRow} title={b.name}>{b.name}</div>
          ))}
        </div>

        {/* Track content with scrolling */}
        <div className={styles.trackContent} ref={scrollRef} onScroll={handleScroll}>
          {/* Ruler with time markers */}
          <div className={styles.ruler} style={{ width: timelineWidth }} onClick={handleRulerClick}>
            {markers.map((m, i) => (
              <div
                key={i}
                className={m.major ? styles.markerMajor : styles.markerMinor}
                style={{ left: m.time * timelineZoom }}
              >
                {m.label && <span className={styles.markerLabel}>{m.label}</span>}
              </div>
            ))}
            {/* Scrubber head */}
            <div className={styles.scrubberHead} style={{ left: currentTime * timelineZoom - 5 }} />
          </div>

          {/* Track rows */}
          {bones.map(b => {
            const track = selectedAnimation.tracks.find(t => t.boneId === b.id);
            return (
              <div
                key={b.id}
                className={styles.trackRow}
                style={{ width: timelineWidth }}
                onDoubleClick={() => handleTrackDoubleClick(b.id)}
              >
                {track?.keyframes.map((k, i) => (
                  <div
                    key={i}
                    className={styles.keyframe}
                    style={{ left: k.time * timelineZoom - 6 }}
                    onClick={(e) => handleKeyframeClick(e, b.id, k.time)}
                    title={`${Math.round(k.time)}ms\nAlt+Click to delete`}
                  />
                ))}
              </div>
            );
          })}

          {/* Scrubber line (spans all rows) */}
          <div className={styles.scrubberLine} style={{ left: currentTime * timelineZoom }} />
        </div>
      </div>
    </div>
  );
}
