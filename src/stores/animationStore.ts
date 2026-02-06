import { create } from 'zustand';
import type { Animation, Frame } from '../types/animation';
import { generateId } from '../utils/id';
import { withHistory, type HistoryState } from './historyMiddleware';

interface AnimationState {
  animations: Animation[];
  selectedAnimationId: string | null;

  createAnimation: (name?: string) => string;
  deleteAnimation: (id: string) => void;
  renameAnimation: (id: string, name: string) => void;
  duplicateAnimation: (id: string) => string;
  selectAnimation: (id: string | null) => void;

  addFrames: (animationId: string, frames: Omit<Frame, 'id' | 'offsetX' | 'offsetY'>[], insertIndex?: number) => void;
  removeFrame: (animationId: string, frameId: string) => void;
  reorderFrames: (animationId: string, fromIndex: number, toIndex: number) => void;
  duplicateFrame: (animationId: string, frameId: string) => void;
  updateFrame: (animationId: string, frameId: string, updates: Partial<Frame>) => void;

  setFps: (animationId: string, fps: number) => void;
  setLoop: (animationId: string, loop: boolean) => void;

  getSelectedAnimation: () => Animation | null;
}

export const useAnimationStore = create<AnimationState & HistoryState>(
  withHistory((set, get) => ({
    animations: [],
    selectedAnimationId: null,

    createAnimation: (name?: string) => {
      const id = generateId();
      const existingCount = get().animations.length;
      set((state) => ({
        animations: [
          ...state.animations,
          {
            id,
            name: name || `Animation ${existingCount + 1}`,
            fps: 12,
            frames: [],
            loop: true,
          },
        ],
        selectedAnimationId: id,
      }));
      return id;
    },

    deleteAnimation: (id) => {
      set((state) => {
        const newAnimations = state.animations.filter((a) => a.id !== id);
        return {
          animations: newAnimations,
          selectedAnimationId:
            state.selectedAnimationId === id
              ? newAnimations[0]?.id ?? null
              : state.selectedAnimationId,
        };
      });
    },

    renameAnimation: (id, name) => {
      set((state) => ({
        animations: state.animations.map((a) =>
          a.id === id ? { ...a, name } : a
        ),
      }));
    },

    duplicateAnimation: (id) => {
      const newId = generateId();
      set((state) => {
        const source = state.animations.find((a) => a.id === id);
        if (!source) return state;
        const duplicate: Animation = {
          ...source,
          id: newId,
          name: `${source.name} (copy)`,
          frames: source.frames.map((f) => ({ ...f, id: generateId() })),
        };
        return {
          animations: [...state.animations, duplicate],
          selectedAnimationId: newId,
        };
      });
      return newId;
    },

    selectAnimation: (id) => {
      set({ selectedAnimationId: id });
    },

    addFrames: (animationId, frames, insertIndex) => {
      set((state) => ({
        animations: state.animations.map((a) => {
          if (a.id !== animationId) return a;
          const newFrames: Frame[] = frames.map((f) => ({
            ...f,
            id: generateId(),
            offsetX: 0,
            offsetY: 0,
          }));
          const allFrames = [...a.frames];
          const idx = insertIndex ?? allFrames.length;
          allFrames.splice(idx, 0, ...newFrames);
          return { ...a, frames: allFrames };
        }),
      }));
    },

    removeFrame: (animationId, frameId) => {
      set((state) => ({
        animations: state.animations.map((a) =>
          a.id === animationId
            ? { ...a, frames: a.frames.filter((f) => f.id !== frameId) }
            : a
        ),
      }));
    },

    reorderFrames: (animationId, fromIndex, toIndex) => {
      set((state) => ({
        animations: state.animations.map((a) => {
          if (a.id !== animationId) return a;
          const frames = [...a.frames];
          const [moved] = frames.splice(fromIndex, 1);
          frames.splice(toIndex, 0, moved);
          return { ...a, frames };
        }),
      }));
    },

    duplicateFrame: (animationId, frameId) => {
      set((state) => ({
        animations: state.animations.map((a) => {
          if (a.id !== animationId) return a;
          const idx = a.frames.findIndex((f) => f.id === frameId);
          if (idx === -1) return a;
          const source = a.frames[idx];
          const duplicate: Frame = { ...source, id: generateId() };
          const frames = [...a.frames];
          frames.splice(idx + 1, 0, duplicate);
          return { ...a, frames };
        }),
      }));
    },

    updateFrame: (animationId, frameId, updates) => {
      set((state) => ({
        animations: state.animations.map((a) =>
          a.id === animationId
            ? {
                ...a,
                frames: a.frames.map((f) =>
                  f.id === frameId ? { ...f, ...updates } : f
                ),
              }
            : a
        ),
      }));
    },

    setFps: (animationId, fps) => {
      set((state) => ({
        animations: state.animations.map((a) =>
          a.id === animationId ? { ...a, fps: Math.max(1, Math.min(60, fps)) } : a
        ),
      }));
    },

    setLoop: (animationId, loop) => {
      set((state) => ({
        animations: state.animations.map((a) =>
          a.id === animationId ? { ...a, loop } : a
        ),
      }));
    },

    getSelectedAnimation: () => {
      const state = get();
      return state.animations.find((a) => a.id === state.selectedAnimationId) ?? null;
    },
  }))
);
