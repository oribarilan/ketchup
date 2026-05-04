/**
 * Public entry point for the triage runtime (React-based).
 */
import { mountOverlay, type TriageHandle } from './mount';

export const startTriage = mountOverlay;
export type { TriageHandle };
