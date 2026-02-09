import type { Animation } from './animation';
import type { Skeleton } from './skeleton';

export type EditorMode = 'frame' | 'rig' | 'motion-lab';

export interface Project {
  id: string;
  name: string;
  animations: Animation[];
  skeletons: Skeleton[];
}
