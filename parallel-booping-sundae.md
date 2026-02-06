# 2D Sprite Animation Editor - Implementation Plan

## Overview
A professional 2D sprite animation editor with two workflows:
1. **Frame-by-frame animation** - Load PNGs, order frames, set FPS, preview with onion skinning
2. **Skeletal rigging animation** - Load body part PNGs, set pivots, create bone hierarchy, keyframe timeline with interpolation

Built as a web app that can later be embedded in the user's Tauri game toolchain.

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | **React 18 + TypeScript** | Strong typing for complex animation data, component-based UI |
| Build | **Vite** | Fast dev server, good TS support |
| Canvas | **Konva + react-konva** | Interactive canvas objects, built-in drag/transform handles, parent-child groups (critical for skeletal rigs), good React integration |
| State | **Zustand** | Lightweight, TS-friendly, supports middleware for undo/redo |
| Timeline | **Custom component** | No off-the-shelf timeline fits animation keyframing needs |
| Sprite Sheet Packing | **Custom bin-packing** | Simple row/grid packing for sprite sheet export |
| Easing | **bezier-easing** | Industry-standard cubic bezier curves for keyframe interpolation |
| UI Polish | **CSS Modules** | Scoped styles, no extra dependencies |

---

## Data Models (TypeScript)

```typescript
// === Core ===
interface Project {
  id: string;
  name: string;
  animations: Animation[];
  skeletons: Skeleton[];
}

// === Flow 1: Frame-by-frame ===
interface Animation {
  id: string;
  name: string;
  fps: number;
  frames: Frame[];
  loop: boolean;
}

interface Frame {
  id: string;
  imageData: string; // data URL or object URL
  fileName: string;
  width: number;
  height: number;
  duration?: number; // optional per-frame duration override (in ms)
  offsetX: number;   // for alignment adjustments
  offsetY: number;
}

// === Flow 2: Skeletal Rigging ===
interface Skeleton {
  id: string;
  name: string;
  bones: Bone[];
  slots: Slot[];      // draw order
  skins: Skin[];      // sprite assignments
  rigAnimations: RigAnimation[];
}

interface Bone {
  id: string;
  name: string;
  parentId: string | null;
  x: number;          // local position
  y: number;
  rotation: number;   // degrees
  scaleX: number;
  scaleY: number;
  length: number;     // visual bone length
  pivotX: number;     // pivot point (0-1 normalized)
  pivotY: number;
}

interface Slot {
  id: string;
  boneId: string;
  name: string;
  zIndex: number;
  attachment: string | null; // skin attachment name
}

interface Skin {
  name: string;
  attachments: Record<string, Attachment>;
}

interface Attachment {
  type: 'sprite';
  imageData: string;
  fileName: string;
  width: number;
  height: number;
  x: number;          // offset from bone
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

interface RigAnimation {
  id: string;
  name: string;
  duration: number;   // total duration in ms
  fps: number;
  loop: boolean;
  tracks: AnimationTrack[];
}

interface AnimationTrack {
  boneId: string;
  keyframes: Keyframe[];
}

interface Keyframe {
  time: number;       // ms from start
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  easing: EasingType;
}

type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step' | [number, number, number, number]; // cubic bezier
```

---

## UI Layout

```
+---------------------------------------------------------------+
|  Menu Bar  [File] [Edit] [View]    [Frame Mode | Rig Mode]    |
+----------+-----------------------------------+----------------+
|          |                                   |                |
| Left     |        Canvas Viewport            |  Properties    |
| Panel    |     (react-konva Stage)           |  Panel         |
|          |                                   |                |
| - Anim   |   [onion skin layers]             | - FPS          |
|   List   |   [current frame/rig]             | - Frame info   |
|          |   [transform handles]             | - Bone props   |
|          |                                   | - Keyframe     |
|          |                                   |   easing       |
+----------+-----------------------------------+----------------+
|                    Timeline Panel                              |
|  [<<] [<] [Play/Pause] [>] [>>]  FPS:[___]  Frame: 3/12     |
|  +--+--+--+--+--+--+--+--+--+--+--+--+--+                   |
|  |F1|F2|F3|F4|F5|F6|F7|F8|F9|10|11|12|  |  (frame strip)    |
|  +--+--+--+--+--+--+--+--+--+--+--+--+--+                   |
|  OR (in rig mode):                                            |
|  |=====[K]==========[K]======[K]====|  (keyframe timeline)   |
+---------------------------------------------------------------+
```

---

## File Structure

```
D:\sandbox\
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.tsx                    # Entry point
│   ├── App.tsx                     # Root layout, mode switching
│   ├── App.module.css
│   │
│   ├── stores/                     # Zustand stores
│   │   ├── projectStore.ts         # Project-level state
│   │   ├── animationStore.ts       # Frame-by-frame state
│   │   ├── rigStore.ts             # Skeletal rig state
│   │   ├── uiStore.ts             # UI state (selected items, panels, viewport)
│   │   └── historyMiddleware.ts    # Undo/redo middleware
│   │
│   ├── types/                      # TypeScript interfaces
│   │   ├── animation.ts
│   │   ├── skeleton.ts
│   │   └── project.ts
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── MenuBar.tsx
│   │   │   ├── LeftPanel.tsx
│   │   │   ├── PropertiesPanel.tsx
│   │   │   └── PanelResizer.tsx
│   │   │
│   │   ├── viewport/
│   │   │   ├── CanvasViewport.tsx       # Main Konva Stage
│   │   │   ├── FrameRenderer.tsx        # Renders current frame (flow 1)
│   │   │   ├── OnionSkinLayer.tsx       # Ghost frames
│   │   │   ├── SkeletonRenderer.tsx     # Renders bones + sprites (flow 2)
│   │   │   ├── BoneHandle.tsx           # Interactive bone control
│   │   │   ├── PivotHandle.tsx          # Pivot point marker
│   │   │   └── GridBackground.tsx       # Reference grid
│   │   │
│   │   ├── timeline/
│   │   │   ├── Timeline.tsx             # Container, switches between modes
│   │   │   ├── FrameStrip.tsx           # Frame thumbnails (flow 1)
│   │   │   ├── FrameThumb.tsx           # Single frame thumbnail
│   │   │   ├── KeyframeTimeline.tsx     # Keyframe editor (flow 2)
│   │   │   ├── KeyframeDiamond.tsx      # Keyframe marker
│   │   │   ├── PlaybackControls.tsx     # Play/pause/step buttons
│   │   │   └── Scrubber.tsx             # Timeline position indicator
│   │   │
│   │   ├── panels/
│   │   │   ├── AnimationList.tsx        # List of animations
│   │   │   ├── FrameProperties.tsx      # Frame offset, duration
│   │   │   ├── BoneProperties.tsx       # Bone transform, pivot
│   │   │   ├── BoneHierarchy.tsx        # Tree view of bones
│   │   │   ├── KeyframeProperties.tsx   # Easing curve editor
│   │   │   └── ExportDialog.tsx         # Export options
│   │   │
│   │   └── shared/
│   │       ├── DropZone.tsx             # File drag-and-drop
│   │       ├── DraggableList.tsx        # Reorderable list
│   │       ├── NumberInput.tsx          # Numeric input with drag
│   │       └── EasingCurveEditor.tsx    # Visual bezier curve editor
│   │
│   ├── engine/
│   │   ├── PlaybackEngine.ts        # Animation playback loop (requestAnimationFrame)
│   │   ├── InterpolationEngine.ts   # Keyframe interpolation (lerp, slerp, bezier)
│   │   ├── BoneResolver.ts          # Resolves bone hierarchy transforms
│   │   ├── SpriteSheetPacker.ts     # Bin-packing for sprite sheet export
│   │   └── ExportEngine.ts          # Export to PNG sprite sheet + JSON
│   │
│   ├── utils/
│   │   ├── imageLoader.ts           # Load PNGs, create object URLs
│   │   ├── math.ts                  # Lerp, clamp, angle math
│   │   ├── id.ts                    # UUID generation
│   │   └── fileUtils.ts             # File read/save helpers
│   │
│   └── styles/
│       ├── variables.css            # CSS custom properties (colors, sizing)
│       ├── global.css               # Reset, base styles, dark theme
│       └── timeline.module.css
```

---

## Implementation Phases

### Phase 1: Foundation + Frame-by-Frame Animation
_Goal: Fully working frame-by-frame sprite animation workflow_

**Step 1: Project Setup**
- Initialize Vite + React + TypeScript project
- Install dependencies: react-konva, konva, zustand, bezier-easing
- Set up file structure, CSS variables, dark theme
- Create root App layout with resizable panels

**Step 2: Core Data & State**
- Define TypeScript types (animation.ts, project.ts)
- Build animationStore (Zustand) - CRUD animations, add/remove/reorder frames
- Build uiStore - selected animation, selected frame, playback state, viewport zoom/pan
- Implement undo/redo middleware for Zustand

**Step 3: Image Loading**
- Build DropZone component (drag-and-drop PNGs onto app)
- Build imageLoader utility (File -> objectURL + dimensions)
- Handle multiple file selection, batch loading
- Show loading state

**Step 4: Frame Strip Timeline**
- Build FrameStrip with thumbnails of loaded frames
- Drag-and-drop reordering of frames
- Click to select frame
- Delete frame button
- Duplicate frame button
- Frame count display

**Step 5: Canvas Viewport**
- Set up Konva Stage with zoom (scroll wheel) and pan (middle mouse drag)
- Render selected frame at full resolution
- Checkerboard transparency background
- Grid overlay (toggleable)
- Center/fit-to-view controls

**Step 6: Playback Engine**
- requestAnimationFrame-based playback loop
- Play/pause/stop controls
- Step forward/backward
- FPS control (1-60)
- Loop toggle
- Current frame indicator on timeline

**Step 7: Onion Skinning**
- Render N previous frames with decreasing opacity (red tint)
- Render N next frames with decreasing opacity (green tint)
- Toggle on/off
- Adjustable number of onion skin frames
- Adjustable opacity

**Step 8: Animation Management**
- AnimationList panel - create, rename, delete animations
- Switch between animations
- Duplicate animation

**Step 9: Export**
- Sprite sheet export: pack frames into single PNG (row, grid, or packed)
- JSON metadata export (frame rects, FPS, animation name)
- Format compatible with common game engines
- Download as zip (sprite sheet + JSON)

---

### Phase 2: Skeletal Rigging Animation
_Goal: Add bone-based animation with keyframe timeline_

**Step 10: Skeleton Data & State**
- Define skeleton TypeScript types (skeleton.ts)
- Build rigStore (Zustand) - CRUD skeletons, bones, slots, keyframes
- Bone hierarchy management (parent/child)

**Step 11: Bone System on Canvas**
- Render bones as visual lines/shapes on Konva Stage
- Interactive bone handles: drag to move, rotate handle to rotate
- Pivot point visualization and adjustment
- Parent-child bone connection lines
- Create bone tool: click to place bones
- Bone selection and multi-selection

**Step 12: Body Part Sprite Loading**
- Load PNGs as body part sprites
- Assign sprites to bones (drag onto bone or via properties)
- Adjust sprite offset/rotation relative to bone
- Sprite z-ordering via slots

**Step 13: Bone Hierarchy Editor**
- Tree view of bone hierarchy in left panel
- Drag-and-drop to reparent bones
- Expand/collapse bone children
- Visibility toggle per bone

**Step 14: BoneResolver - Transform Chain**
- Compute world transforms from local bone transforms
- Walk parent chain: child.worldTransform = parent.worldTransform * child.localTransform
- Apply to sprite rendering positions
- Efficient caching / dirty flagging

**Step 15: Keyframe Timeline**
- Switch timeline to keyframe mode when in Rig Mode
- Horizontal time ruler (ms or frames)
- One row per bone with property tracks
- Diamond markers for keyframes
- Click to add keyframe at current time
- Drag keyframes to move in time
- Scrubber for current time position
- Zoom timeline in/out

**Step 16: Interpolation Engine**
- Linear interpolation for position, scale
- Angular interpolation for rotation (shortest path)
- Bezier easing curves (linear, ease-in, ease-out, ease-in-out, custom)
- Step interpolation (for sprite swaps)
- EasingCurveEditor component for visual curve editing

**Step 17: Rig Playback**
- Play/pause/stop rig animations
- Evaluate all bone tracks at current time
- Apply interpolated transforms to skeleton
- Smooth real-time preview
- FPS-independent timing

**Step 18: Rig Export**
- Export skeleton definition as JSON (bones, hierarchy, default pose)
- Export animation data as JSON (keyframes, easing curves, duration)
- Export sprite atlas for body parts
- Format inspired by Spine JSON format (industry standard, can be loaded by game engines)

---

## Verification / Testing

After each phase, verify:

**Phase 1 checks:**
1. `npm run dev` launches the app in browser
2. Can create a new animation, name it
3. Can drag-and-drop multiple PNGs into the app
4. Frames appear in the frame strip, can reorder by dragging
5. Clicking a frame shows it in the viewport
6. Play button animates through frames at the set FPS
7. Onion skinning shows ghost frames
8. Export produces a valid sprite sheet PNG + JSON file
9. Undo/redo works for all operations

**Phase 2 checks:**
1. Can switch to Rig Mode
2. Can create bones, set parent-child relationships
3. Can load body part PNGs and attach to bones
4. Moving a parent bone moves all children
5. Can add keyframes at different times
6. Playing animation interpolates smoothly between keyframes
7. Easing curves affect interpolation correctly
8. Export produces valid skeleton + animation JSON
