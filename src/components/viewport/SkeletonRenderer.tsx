import { Group, Circle, Line, Image as KonvaImage, Arc } from 'react-konva';
import { useRigStore } from '../../stores/rigStore';
import type { Bone, Slot, Skin, Attachment } from '../../types/skeleton';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useState, useRef } from 'react';
import { getCachedImage } from '../../utils/imageLoader';
import { radToDeg } from '../../utils/math';

export function SkeletonRenderer() {
  const selectedSkeleton = useRigStore(s => s.getSelectedSkeleton());
  const selectedBoneId = useRigStore(s => s.selectedBoneId);
  const updateBone = useRigStore(s => s.updateBone);
  const selectBone = useRigStore(s => s.selectBone);

  if (!selectedSkeleton) return null;

  const roots = selectedSkeleton.bones.filter(b => !b.parentId);

  return (
    <Group>
      {roots.map(bone => (
        <BoneView
          key={bone.id}
          bone={bone}
          allBones={selectedSkeleton.bones}
          slots={selectedSkeleton.slots}
          skins={selectedSkeleton.skins}
          selectedBoneId={selectedBoneId}
          onUpdate={(id, updates) => updateBone(selectedSkeleton.id, id, updates)}
          onSelect={selectBone}
        />
      ))}
    </Group>
  );
}

interface BoneViewProps {
  bone: Bone;
  allBones: Bone[];
  slots: Slot[];
  skins: Skin[];
  selectedBoneId: string | null;
  onUpdate: (id: string, updates: Partial<Bone>) => void;
  onSelect: (id: string | null) => void;
}

function BoneView({ bone, allBones, slots, skins, selectedBoneId, onUpdate, onSelect }: BoneViewProps) {
  const children = allBones.filter(b => b.parentId === bone.id);
  const isSelected = bone.id === selectedBoneId;
  const rotateRef = useRef<{ startAngle: number; boneStartRotation: number } | null>(null);

  const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
    // Live update while dragging
    onUpdate(bone.id, {
      x: e.target.x(),
      y: e.target.y(),
    });
  };

  const handleClick = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    onSelect(bone.id);
  };

  // Rotation handle drag
  const handleRotateStart = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    // Get bone world position (approximate - would need proper transform chain)
    const group = e.target.getParent();
    if (!group) return;

    const absPos = group.getAbsolutePosition();
    const dx = pos.x - absPos.x;
    const dy = pos.y - absPos.y;
    const startAngle = Math.atan2(dy, dx);

    rotateRef.current = {
      startAngle,
      boneStartRotation: bone.rotation
    };
  };

  const handleRotateMove = (e: KonvaEventObject<DragEvent>) => {
    if (!rotateRef.current) return;
    e.cancelBubble = true;

    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const group = e.target.getParent();
    if (!group) return;

    const absPos = group.getAbsolutePosition();
    const dx = pos.x - absPos.x;
    const dy = pos.y - absPos.y;
    const currentAngle = Math.atan2(dy, dx);

    const deltaAngle = radToDeg(currentAngle - rotateRef.current.startAngle);
    const newRotation = rotateRef.current.boneStartRotation + deltaAngle;

    onUpdate(bone.id, { rotation: newRotation });
  };

  const handleRotateEnd = () => {
    rotateRef.current = null;
  };

  // Find attachment
  const slot = slots.find(s => s.boneId === bone.id);
  const attachment = slot?.attachment ? skins.find(s => s.name === 'default')?.attachments[slot.id] : null;

  const boneColor = isSelected ? '#00e5ff' : '#888';
  const jointColor = isSelected ? '#00e5ff' : '#666';

  return (
    <Group
      x={bone.x}
      y={bone.y}
      rotation={bone.rotation}
      scaleX={bone.scaleX}
      scaleY={bone.scaleY}
      draggable
      onDragMove={handleDragMove}
      onClick={handleClick}
    >
      {/* Attachment / Sprite (rendered behind bone) */}
      {attachment && <AttachmentView attachment={attachment} />}

      {/* Bone shape - tapered look */}
      <Line
        points={[
          0, -4,
          bone.length * 0.3, -2,
          bone.length, 0,
          bone.length * 0.3, 2,
          0, 4,
        ]}
        closed
        fill={isSelected ? 'rgba(0, 229, 255, 0.2)' : 'rgba(136, 136, 136, 0.15)'}
        stroke={boneColor}
        strokeWidth={isSelected ? 2 : 1}
      />

      {/* Joint circle at origin */}
      <Circle
        radius={isSelected ? 8 : 6}
        fill={jointColor}
        stroke="white"
        strokeWidth={2}
        shadowColor="black"
        shadowBlur={isSelected ? 8 : 0}
        shadowOpacity={0.5}
      />

      {/* Rotation handle (only for selected bone) */}
      {isSelected && (
        <Group x={bone.length} y={0}>
          {/* Rotation arc indicator */}
          <Arc
            innerRadius={15}
            outerRadius={20}
            angle={90}
            rotation={-45}
            fill="rgba(0, 229, 255, 0.3)"
            stroke="#00e5ff"
            strokeWidth={1}
          />
          {/* Draggable rotation handle */}
          <Circle
            x={18}
            y={0}
            radius={8}
            fill="#00e5ff"
            stroke="white"
            strokeWidth={2}
            draggable
            onDragStart={handleRotateStart}
            onDragMove={handleRotateMove}
            onDragEnd={handleRotateEnd}
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'grab';
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'default';
            }}
          />
        </Group>
      )}

      {/* Tip marker */}
      <Circle
        x={bone.length}
        y={0}
        radius={4}
        fill={boneColor}
        stroke="white"
        strokeWidth={1}
      />

      {/* Bone name label (only for selected) */}
      {isSelected && (
        <Group x={bone.length / 2} y={-15}>
          {/* Background for readability */}
        </Group>
      )}

      {/* Children */}
      {children.map(child => (
        <BoneView
          key={child.id}
          bone={child}
          allBones={allBones}
          slots={slots}
          skins={skins}
          selectedBoneId={selectedBoneId}
          onUpdate={onUpdate}
          onSelect={onSelect}
        />
      ))}
    </Group>
  );
}

function AttachmentView({ attachment }: { attachment: Attachment }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let active = true;
    getCachedImage(attachment.imageData).then(img => {
      if (active) setImage(img);
    });
    return () => { active = false; };
  }, [attachment.imageData]);

  if (!image) return null;

  return (
    <KonvaImage
      image={image}
      x={attachment.x}
      y={attachment.y}
      rotation={attachment.rotation}
      scaleX={attachment.scaleX}
      scaleY={attachment.scaleY}
      offsetX={attachment.width / 2}
      offsetY={attachment.height / 2}
      opacity={0.9}
    />
  );
}
