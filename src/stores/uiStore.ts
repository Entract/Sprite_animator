import { create } from 'zustand';
import type { EditorMode } from '../types/project';

interface PlaybackState {
  isPlaying: boolean;
  currentFrameIndex: number;
}

interface OnionSkinSettings {
  enabled: boolean;
  prevCount: number;
  nextCount: number;
  opacity: number;
}

interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

export type ToolType = 'select' | 'fuzzy' | 'brush' | 'eraser' | 'ai-remove' | 'smart-eraser' | 'box-select' | 'keep-island';

interface UIState {
  mode: EditorMode;
  setMode: (mode: EditorMode) => void;

  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  fuzzyThreshold: number;
  setFuzzyThreshold: (threshold: number) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;

  selectedFrameId: string | null;
  selectFrame: (id: string | null) => void;

  playback: PlaybackState;
  setPlaying: (playing: boolean) => void;
  setCurrentFrameIndex: (index: number) => void;

  onionSkin: OnionSkinSettings;
  toggleOnionSkin: () => void;
  setOnionSkinPrevCount: (count: number) => void;
  setOnionSkinNextCount: (count: number) => void;
  setOnionSkinOpacity: (opacity: number) => void;

  viewport: ViewportState;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  resetViewport: () => void;

  showGrid: boolean;
  toggleGrid: () => void;

  leftPanelWidth: number;
  rightPanelWidth: number;
  timelineHeight: number;
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  setTimelineHeight: (height: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  mode: 'frame',
  setMode: (mode) => set({ mode }),

  activeTool: 'select',
  setActiveTool: (activeTool) => set({ activeTool }),
  fuzzyThreshold: 20,
  setFuzzyThreshold: (fuzzyThreshold) => set({ fuzzyThreshold }),
  brushSize: 5,
  setBrushSize: (brushSize) => set({ brushSize: Math.max(1, Math.min(100, brushSize)) }),

  selectedFrameId: null,
  selectFrame: (id) => set({ selectedFrameId: id }),

  playback: {
    isPlaying: false,
    currentFrameIndex: 0,
  },
  setPlaying: (isPlaying) =>
    set((state) => ({ playback: { ...state.playback, isPlaying } })),
  setCurrentFrameIndex: (index) =>
    set((state) => ({ playback: { ...state.playback, currentFrameIndex: index } })),

  onionSkin: {
    enabled: false,
    prevCount: 2,
    nextCount: 1,
    opacity: 0.3,
  },
  toggleOnionSkin: () =>
    set((state) => ({
      onionSkin: { ...state.onionSkin, enabled: !state.onionSkin.enabled },
    })),
  setOnionSkinPrevCount: (count) =>
    set((state) => ({
      onionSkin: { ...state.onionSkin, prevCount: Math.max(0, Math.min(5, count)) },
    })),
  setOnionSkinNextCount: (count) =>
    set((state) => ({
      onionSkin: { ...state.onionSkin, nextCount: Math.max(0, Math.min(5, count)) },
    })),
  setOnionSkinOpacity: (opacity) =>
    set((state) => ({
      onionSkin: { ...state.onionSkin, opacity: Math.max(0.05, Math.min(1, opacity)) },
    })),

  viewport: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  setZoom: (zoom) =>
    set((state) => ({
      viewport: { ...state.viewport, zoom: Math.max(0.1, Math.min(10, zoom)) },
    })),
  setPan: (panX, panY) =>
    set((state) => ({ viewport: { ...state.viewport, panX, panY } })),
  resetViewport: () =>
    set({ viewport: { zoom: 1, panX: 0, panY: 0 } }),

  showGrid: true,
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),

  leftPanelWidth: 240,
  rightPanelWidth: 260,
  timelineHeight: 200,
  setLeftPanelWidth: (width) => set({ leftPanelWidth: Math.max(180, Math.min(400, width)) }),
  setRightPanelWidth: (width) => set({ rightPanelWidth: Math.max(180, Math.min(400, width)) }),
  setTimelineHeight: (height) => set({ timelineHeight: Math.max(120, Math.min(400, height)) }),
}));
