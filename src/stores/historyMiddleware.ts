import type { StateCreator, StoreMutatorIdentifier } from 'zustand';

export interface HistoryState {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

type HistoryImpl = <
  T extends object,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  stateCreator: StateCreator<T, Mps, Mcs>,
  options?: { limit?: number }
) => StateCreator<T & HistoryState, Mps, Mcs>;

const MAX_HISTORY = 50;

export const withHistory: HistoryImpl =
  (stateCreator, options) => (set, get, api) => {
    const limit = options?.limit ?? MAX_HISTORY;
    let pastStates: Record<string, unknown>[] = [];
    let futureStates: Record<string, unknown>[] = [];
    let isUndoRedo = false;

    const trackedSet = ((...args: unknown[]) => {
      if (!isUndoRedo) {
        const currentState = get() as Record<string, unknown>;
        const { undo: _u, redo: _r, canUndo: _cu, canRedo: _cr, ...snapshot } = currentState;
        pastStates.push(snapshot);
        if (pastStates.length > limit) pastStates.shift();
        futureStates = [];
      }

      (set as Function)(...args);

      if (!isUndoRedo) {
        (set as Function)({
          canUndo: pastStates.length > 0,
          canRedo: futureStates.length > 0,
        });
      }
    }) as typeof set;

    const initialState = stateCreator(
      trackedSet as never,
      get as never,
      api as never
    );

    return {
      ...initialState,
      canUndo: false,
      canRedo: false,

      undo: () => {
        if (pastStates.length === 0) return;
        isUndoRedo = true;

        const currentState = get() as Record<string, unknown>;
        const { undo: _u, redo: _r, canUndo: _cu, canRedo: _cr, ...snapshot } = currentState;
        futureStates.push(snapshot);

        const prev = pastStates.pop()!;
        (set as Function)({
          ...prev,
          canUndo: pastStates.length > 0,
          canRedo: futureStates.length > 0,
        });

        isUndoRedo = false;
      },

      redo: () => {
        if (futureStates.length === 0) return;
        isUndoRedo = true;

        const currentState = get() as Record<string, unknown>;
        const { undo: _u, redo: _r, canUndo: _cu, canRedo: _cr, ...snapshot } = currentState;
        pastStates.push(snapshot);

        const next = futureStates.pop()!;
        (set as Function)({
          ...next,
          canUndo: pastStates.length > 0,
          canRedo: futureStates.length > 0,
        });

        isUndoRedo = false;
      },
    };
  };
