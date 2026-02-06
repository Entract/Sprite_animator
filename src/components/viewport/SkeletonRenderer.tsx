import { Group, Circle, Line, Image as KonvaImage } from 'react-konva';
import { useRigStore } from '../../stores/rigStore';
import type { Bone, Slot, Skin, Attachment } from '../../types/skeleton';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useState } from 'react';
import { getCachedImage } from '../../utils/imageLoader';

export function SkeletonRenderer() {
  const selectedSkeleton = useRigStore(s => s.getSelectedSkeleton());
  const selectedBoneId = useRigStore(s => s.selectedBoneId);
  const updateBone = useRigStore(s => s.updateBone);
  const selectBone = useRigStore(s => s.selectBone);

  if (!selectedSkeleton) return null;

  // Find roots
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

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    onUpdate(bone.id, {
      x: e.target.x(),
      y: e.target.y(),
    });
  };

  const handleClick = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    onSelect(bone.id);
  };

  // Find attachment
  const slot = slots.find(s => s.boneId === bone.id);
  const attachment = slot?.attachment ? skins.find(s => s.name === 'default')?.attachments[slot.id] : null;

  return (
    <Group
      x={bone.x}
      y={bone.y}
      rotation={bone.rotation}
      scaleX={bone.scaleX}
      scaleY={bone.scaleY}
      draggable
      onDragEnd={handleDragEnd}
      onClick={handleClick}
    >
      {/* Attachment / Sprite */}
      {attachment && <AttachmentView attachment={attachment} />}

      {/* Bone Visual */}
      <Line 
        points={[0, 0, bone.length, 0]} 
        stroke={isSelected ? '#00e5ff' : '#aaa'} 
        strokeWidth={isSelected ? 4 : 2}
        lineCap="round"
      />
      
      {/* Joint/Pivot */}
      <Circle 
        radius={isSelected ? 6 : 4} 
        fill={isSelected ? '#00e5ff' : '#666'} 
        stroke="white"
        strokeWidth={1}
      />

      {/* Tip (visual aid for direction) */}
      <Circle 
        x={bone.length} 
        y={0} 
        radius={3} 
        fill={isSelected ? '#00e5ff' : '#888'} 
        opacity={0.6} 
      />

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
      // Opacity or other props?
    />
  );
}
