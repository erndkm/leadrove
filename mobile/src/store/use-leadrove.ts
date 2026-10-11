import { useSyncExternalStore } from "react";
import { actions, getSnapshot, subscribe } from "./app-store";
export function useLeadrove() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...state, ...actions };
}
