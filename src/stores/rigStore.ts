import { create } from 'zustand';
import type { Skeleton, Bone, Attachment, RigAnimation, Keyframe, IKConstraint } from '../types/skeleton';
import { generateId } from '../utils/id';
import { withHistory, type HistoryState } from './historyMiddleware';
import { evaluateTrackAtTime } from '../engine/InterpolationEngine';
import { applyAllIKConstraints } from '../engine/IKSolver';

interface RigState {
  skeletons: Skeleton[];
  selectedSkeletonId: string | null;
  selectedBoneId: string | null;
  selectedIKConstraintId: string | null;

  // Animation Mode State
  selectedRigAnimationId: string | null;
  currentTime: number;

  createSkeleton: (name?: string) => string;
  deleteSkeleton: (id: string) => void;
  renameSkeleton: (id: string, name: string) => void;
  duplicateSkeleton: (id: string) => string;
  selectSkeleton: (id: string | null) => void;

  selectBone: (id: string | null) => void;
  addBone: (skeletonId: string, parentId: string | null, bone?: Partial<Bone>) => string;
  updateBone: (skeletonId: string, boneId: string, updates: Partial<Bone>) => void;
  removeBone: (skeletonId: string, boneId: string) => void;
  reparentBone: (skeletonId: string, boneId: string, newParentId: string | null) => void;

  attachSpriteToBone: (skeletonId: string, boneId: string, attachment: Omit<Attachment, 'type'>) => void;

  // IK Constraint Actions
  addIKConstraint: (skeletonId: string, targetBoneId: string) => string;
  updateIKConstraint: (skeletonId: string, constraintId: string, updates: Partial<IKConstraint>) => void;
  removeIKConstraint: (skeletonId: string, constraintId: string) => void;
  selectIKConstraint: (id: string | null) => void;

  // Animation Actions
  createRigAnimation: (skeletonId: string, name?: string) => string;
  selectRigAnimation: (id: string | null) => void;
  updateRigAnimation: (skeletonId: string, animationId: string, updates: Partial<RigAnimation>) => void;
  setRigTime: (time: number) => void; // Updates bones based on active animation
  setKeyframe: (skeletonId: string, animationId: string, boneId: string, time: number) => void;
  deleteKeyframe: (skeletonId: string, animationId: string, boneId: string, time: number) => void;

  getSelectedSkeleton: () => Skeleton | null;
  getSelectedRigAnimation: () => RigAnimation | null;
  getSelectedIKConstraint: () => IKConstraint | null;
}

export const useRigStore = create<RigState & HistoryState>(
  withHistory((set, get) => ({
    skeletons: [],
    selectedSkeletonId: null,
    selectedBoneId: null,
    selectedIKConstraintId: null,
    selectedRigAnimationId: null,
    currentTime: 0,

    createSkeleton: (name) => {
      const id = generateId();
      const existingCount = get().skeletons.length;
      set((state) => ({
        skeletons: [
          ...state.skeletons,
          {
            id,
            name: name || `Skeleton ${existingCount + 1}`,
            bones: [],
            slots: [],
            skins: [],
            ikConstraints: [],
            rigAnimations: [],
          },
        ],
        selectedSkeletonId: id,
      }));
      return id;
    },

    deleteSkeleton: (id) => {
      set((state) => {
        const newSkeletons = state.skeletons.filter((s) => s.id !== id);
        return {
          skeletons: newSkeletons,
          selectedSkeletonId:
            state.selectedSkeletonId === id
              ? newSkeletons[0]?.id ?? null
              : state.selectedSkeletonId,
        };
      });
    },

    renameSkeleton: (id, name) => {
      set((state) => ({
        skeletons: state.skeletons.map((s) =>
          s.id === id ? { ...s, name } : s
        ),
      }));
    },

    duplicateSkeleton: (id) => {
      const newId = generateId();
      set((state) => {
        const source = state.skeletons.find((s) => s.id === id);
        if (!source) return state;
        
        // Deep copy bones to give them new IDs
        const boneIdMap = new Map<string, string>();
        source.bones.forEach(b => boneIdMap.set(b.id, generateId()));
        
        const newBones: Bone[] = source.bones.map(b => ({
            ...b,
            id: boneIdMap.get(b.id)!,
            parentId: b.parentId ? boneIdMap.get(b.parentId) ?? null : null
        }));

        const duplicate: Skeleton = {
          ...source,
          id: newId,
          name: `${source.name} (copy)`,
          bones: newBones,
          slots: [],
          skins: [],
          ikConstraints: [],
          rigAnimations: []
        };
        
        return {
          skeletons: [...state.skeletons, duplicate],
          selectedSkeletonId: newId,
        };
      });
      return newId;
    },

    selectSkeleton: (id) => {
      set({ selectedSkeletonId: id, selectedBoneId: null, selectedIKConstraintId: null, selectedRigAnimationId: null, currentTime: 0 });
    },

    selectBone: (id) => {
      set({ selectedBoneId: id });
    },

    addBone: (skeletonId, parentId, boneInit) => {
      const id = generateId();
      set((state) => ({
        skeletons: state.skeletons.map((s) => {
          if (s.id !== skeletonId) return s;
          const newBone: Bone = {
            id,
            name: boneInit?.name || 'New Bone',
            parentId,
            x: boneInit?.x ?? 0,
            y: boneInit?.y ?? 0,
            rotation: boneInit?.rotation ?? 0,
            scaleX: boneInit?.scaleX ?? 1,
            scaleY: boneInit?.scaleY ?? 1,
            length: boneInit?.length ?? 50,
            pivotX: boneInit?.pivotX ?? 0,
            pivotY: boneInit?.pivotY ?? 0.5,
          };
          return { ...s, bones: [...s.bones, newBone] };
        }),
        selectedBoneId: id,
      }));
      return id;
    },

    updateBone: (skeletonId, boneId, updates) => {
      set((state) => ({
        skeletons: state.skeletons.map((s) => {
          if (s.id !== skeletonId) return s;
          return {
            ...s,
            bones: s.bones.map((b) => (b.id === boneId ? { ...b, ...updates } : b)),
          };
        }),
      }));
    },

    removeBone: (skeletonId, boneId) => {
      set((state) => ({
        skeletons: state.skeletons.map((s) => {
          if (s.id !== skeletonId) return s;
          
          const toDelete = new Set<string>([boneId]);
          let added;
          do {
            added = false;
            s.bones.forEach(b => {
                if (b.parentId && toDelete.has(b.parentId) && !toDelete.has(b.id)) {
                    toDelete.add(b.id);
                    added = true;
                }
            });
          } while (added);

          return {
            ...s,
            bones: s.bones.filter((b) => !toDelete.has(b.id)),
          };
        }),
        selectedBoneId: state.selectedBoneId === boneId ? null : state.selectedBoneId,
      }));
    },

    reparentBone: (skeletonId, boneId, newParentId) => {
        const state = get();
        const skeleton = state.skeletons.find(s => s.id === skeletonId);
        if (!skeleton) return;
        
        if (newParentId) {
             let current = skeleton.bones.find(b => b.id === newParentId);
             while (current) {
                 if (current.id === boneId) {
                     console.warn("Cannot reparent bone to its own descendant");
                     return;
                 }
                 current = skeleton.bones.find(b => b.id === current?.parentId);
             }
        }

      set((state) => ({
        skeletons: state.skeletons.map((s) => {
          if (s.id !== skeletonId) return s;
          return {
            ...s,
            bones: s.bones.map((b) =>
              b.id === boneId ? { ...b, parentId: newParentId } : b
            ),
          };
        }),
      }));
    },

    attachSpriteToBone: (skeletonId, boneId, attachmentData) => {
      set((state) => ({
        skeletons: state.skeletons.map((s) => {
          if (s.id !== skeletonId) return s;

          let slot = s.slots.find(sl => sl.boneId === boneId);
          let newSlots = s.slots;
          if (!slot) {
             slot = {
                 id: generateId(),
                 boneId,
                 name: `${attachmentData.fileName}_slot`,
                 zIndex: s.slots.length,
                 attachment: 'default' 
             };
             newSlots = [...s.slots, slot];
          }

          let skinIndex = s.skins.findIndex(sk => sk.name === 'default');
          let skin = skinIndex >= 0 ? s.skins[skinIndex] : { name: 'default', attachments: {} };
          
          const newAttachments = { ...skin.attachments };
          newAttachments[slot.id] = { ...attachmentData, type: 'sprite' };
          
          const newSkin = { ...skin, attachments: newAttachments };
          
          const newSkins = [...s.skins];
          if (skinIndex >= 0) newSkins[skinIndex] = newSkin;
          else newSkins.push(newSkin);

          return { ...s, slots: newSlots, skins: newSkins };
        })
      }));
    },

    // IK Constraint Implementation
    addIKConstraint: (skeletonId, targetBoneId) => {
      const id = generateId();
      const state = get();
      const skeleton = state.skeletons.find(s => s.id === skeletonId);
      if (!skeleton) return id;

      const bone = skeleton.bones.find(b => b.id === targetBoneId);
      const boneName = bone?.name || 'Unknown';

      // Calculate approximate world position of the bone's tip
      // by walking up the parent chain
      let worldX = 0;
      let worldY = 0;
      let worldRotation = 0;
      const boneChain: typeof bone[] = [];
      let current = bone;
      while (current) {
        boneChain.unshift(current);
        current = current.parentId ? skeleton.bones.find(b => b.id === current!.parentId) : undefined;
      }
      for (const b of boneChain) {
        if (!b) continue;
        const rad = worldRotation * Math.PI / 180;
        worldX += Math.cos(rad) * b.x - Math.sin(rad) * b.y;
        worldY += Math.sin(rad) * b.x + Math.cos(rad) * b.y;
        worldRotation += b.rotation;
      }
      // Add the bone length to get to the tip
      if (bone) {
        const rad = worldRotation * Math.PI / 180;
        worldX += Math.cos(rad) * bone.length;
        worldY += Math.sin(rad) * bone.length;
      }

      set((state) => ({
        skeletons: state.skeletons.map((s) => {
          if (s.id !== skeletonId) return s;
          const newConstraint: IKConstraint = {
            id,
            name: `IK_${boneName}`,
            targetBoneId,
            chainLength: 2,
            targetX: Math.round(worldX),
            targetY: Math.round(worldY),
            bendPositive: true,
            mix: 1,
            enabled: true,
          };
          return {
            ...s,
            ikConstraints: [...s.ikConstraints, newConstraint],
          };
        }),
        selectedIKConstraintId: id,
      }));
      return id;
    },

    updateIKConstraint: (skeletonId, constraintId, updates) => {
      set((state) => {
        const skeleton = state.skeletons.find(s => s.id === skeletonId);
        if (!skeleton) return state;

        // Update the constraint
        const updatedConstraints = skeleton.ikConstraints.map((c) =>
          c.id === constraintId ? { ...c, ...updates } : c
        );

        // Re-apply IK with updated constraints
        const updatedBones = applyAllIKConstraints(skeleton.bones, updatedConstraints);

        return {
          skeletons: state.skeletons.map((s) => {
            if (s.id !== skeletonId) return s;
            return {
              ...s,
              ikConstraints: updatedConstraints,
              bones: updatedBones,
            };
          }),
        };
      });
    },

    removeIKConstraint: (skeletonId, constraintId) => {
      set((state) => ({
        skeletons: state.skeletons.map((s) => {
          if (s.id !== skeletonId) return s;
          return {
            ...s,
            ikConstraints: s.ikConstraints.filter((c) => c.id !== constraintId),
          };
        }),
        selectedIKConstraintId:
          state.selectedIKConstraintId === constraintId ? null : state.selectedIKConstraintId,
      }));
    },

    selectIKConstraint: (id) => {
      set({ selectedIKConstraintId: id, selectedBoneId: null });
    },

    // Animation Implementation
    createRigAnimation: (skeletonId, name) => {
        const id = generateId();
        set(state => ({
            skeletons: state.skeletons.map(s => {
                if(s.id !== skeletonId) return s;
                return {
                    ...s,
                    rigAnimations: [...s.rigAnimations, {
                        id,
                        name: name || 'New Animation',
                        duration: 1000,
                        fps: 30,
                        loop: true,
                        tracks: []
                    }]
                };
            }),
            selectedRigAnimationId: id,
            currentTime: 0
        }));
        return id;
    },

    selectRigAnimation: (id) => {
        set({ selectedRigAnimationId: id, currentTime: 0 });
    },

    updateRigAnimation: (skeletonId, animationId, updates) => {
        set(state => ({
            skeletons: state.skeletons.map(s => {
                if (s.id !== skeletonId) return s;
                return {
                    ...s,
                    rigAnimations: s.rigAnimations.map(a =>
                        a.id === animationId ? { ...a, ...updates } : a
                    )
                };
            })
        }));
    },

    setRigTime: (time) => {
        const state = get();
        const skeleton = state.skeletons.find(s => s.id === state.selectedSkeletonId);
        const anim = skeleton?.rigAnimations.find(a => a.id === state.selectedRigAnimationId);

        if (!skeleton || !anim) {
            set({ currentTime: time });
            return;
        }

        const newTime = Math.max(0, Math.min(anim.duration, time));

        // Apply keyframe interpolation
        let updatedBones = skeleton.bones.map(bone => {
            const track = anim.tracks.find(t => t.boneId === bone.id);
            if (!track) return bone; // No keyframes for this bone

            const evalResult = evaluateTrackAtTime(track.keyframes, newTime);
            if (!evalResult) return bone;

            return { ...bone, ...evalResult };
        });

        // Apply IK constraints after keyframe interpolation
        if (skeleton.ikConstraints && skeleton.ikConstraints.length > 0) {
            updatedBones = applyAllIKConstraints(updatedBones, skeleton.ikConstraints);
        }

        set(state => ({
            currentTime: newTime,
            skeletons: state.skeletons.map(s => s.id === skeleton.id ? { ...s, bones: updatedBones } : s)
        }));
    },

    setKeyframe: (skeletonId, animationId, boneId, time) => {
        const state = get();
        const skeleton = state.skeletons.find(s => s.id === skeletonId);
        if (!skeleton) return;
        const bone = skeleton.bones.find(b => b.id === boneId);
        if (!bone) return;

        set(state => ({
            skeletons: state.skeletons.map(s => {
                if (s.id !== skeletonId) return s;
                
                const anims = s.rigAnimations.map(a => {
                    if (a.id !== animationId) return a;

                    const tracks = [...a.tracks];
                    let trackIndex = tracks.findIndex(t => t.boneId === boneId);
                    
                    if (trackIndex === -1) {
                        tracks.push({ boneId, keyframes: [] });
                        trackIndex = tracks.length - 1;
                    }

                    const track = { ...tracks[trackIndex] };
                    const newKeyframe: Keyframe = {
                        time,
                        easing: 'linear',
                        x: bone.x,
                        y: bone.y,
                        rotation: bone.rotation,
                        scaleX: bone.scaleX,
                        scaleY: bone.scaleY
                    };

                    // Remove existing at same time if any
                    const filtered = track.keyframes.filter(k => Math.abs(k.time - time) > 1); // 1ms tolerance
                    const newKeyframes = [...filtered, newKeyframe].sort((a, b) => a.time - b.time);

                    tracks[trackIndex] = { ...track, keyframes: newKeyframes };
                    return { ...a, tracks };
                });

                return { ...s, rigAnimations: anims };
            })
        }));
    },

    deleteKeyframe: (skeletonId, animationId, boneId, time) => {
        set(state => ({
            skeletons: state.skeletons.map(s => {
                if (s.id !== skeletonId) return s;
                return {
                    ...s,
                    rigAnimations: s.rigAnimations.map(a => {
                        if (a.id !== animationId) return a;
                        return {
                            ...a,
                            tracks: a.tracks.map(t => {
                                if (t.boneId !== boneId) return t;
                                return {
                                    ...t,
                                    keyframes: t.keyframes.filter(k => Math.abs(k.time - time) > 1)
                                };
                            })
                        };
                    })
                };
            })
        }));
    },

    getSelectedSkeleton: () => {
      const state = get();
      return state.skeletons.find((s) => s.id === state.selectedSkeletonId) ?? null;
    },

    getSelectedRigAnimation: () => {
        const state = get();
        const skel = state.skeletons.find((s) => s.id === state.selectedSkeletonId);
        if (!skel || !state.selectedRigAnimationId) return null;
        return skel.rigAnimations.find(a => a.id === state.selectedRigAnimationId) ?? null;
    },

    getSelectedIKConstraint: () => {
        const state = get();
        const skel = state.skeletons.find((s) => s.id === state.selectedSkeletonId);
        if (!skel || !state.selectedIKConstraintId) return null;
        return skel.ikConstraints.find(c => c.id === state.selectedIKConstraintId) ?? null;
    }
  }))
);
