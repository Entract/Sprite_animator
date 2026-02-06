import type { Animation } from './animation';
import type { Skeleton } from './skeleton';

export type EditorMode = 'frame' | 'rig';

export interface Project {
  id: string;
  name: string;
  animations: Animation[];
  skeletons: Skeleton[];
}
