// Solo para pruebas: imita useSelector leyendo un estado global falso
import { useSyncExternalStore } from 'react';
export function useSelector(fn) { return fn(window.__store || {}); }
export const Provider = ({ children }) => children;
