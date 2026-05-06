'use client';

/**
 * Minimal toast hook based on the shadcn/ui pattern. State held in a module
 * scope so any component can call toast() without nesting providers.
 */
import { useEffect, useState } from 'react';

import type { ToastActionElement, ToastProps } from '../components/toast';

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 5000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

let count = 0;
const genId = () => {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
};

type State = { toasts: ToasterToast[] };
type Listener = (state: State) => void;

const listeners: Listener[] = [];
let memoryState: State = { toasts: [] };

const dispatch = (next: State): void => {
  memoryState = next;
  listeners.forEach((l) => l(memoryState));
};

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const queueRemoval = (id: string): void => {
  if (toastTimeouts.has(id)) return;
  const t = setTimeout(() => {
    toastTimeouts.delete(id);
    dispatch({ toasts: memoryState.toasts.filter((toast) => toast.id !== id) });
  }, TOAST_REMOVE_DELAY);
  toastTimeouts.set(id, t);
};

export type ToastInput = Omit<ToasterToast, 'id'>;

export function toast(props: ToastInput) {
  const id = genId();

  const update = (patch: Partial<ToasterToast>): void =>
    dispatch({
      toasts: memoryState.toasts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });

  const dismiss = (): void => {
    queueRemoval(id);
    dispatch({
      toasts: memoryState.toasts.map((t) => (t.id === id ? { ...t, open: false } : t)),
    });
  };

  dispatch({
    toasts: [
      { ...props, id, open: true, onOpenChange: (open: boolean) => !open && dismiss() },
      ...memoryState.toasts,
    ].slice(0, TOAST_LIMIT),
  });

  return { id, dismiss, update };
}

export function useToast() {
  const [state, setState] = useState<State>(memoryState);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      const idx = listeners.indexOf(setState);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => {
      if (!toastId) {
        memoryState.toasts.forEach((t) => queueRemoval(t.id));
      } else {
        queueRemoval(toastId);
      }
    },
  };
}
