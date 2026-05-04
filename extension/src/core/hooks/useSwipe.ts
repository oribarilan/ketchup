import { useEffect, useRef, useState } from 'react';

export interface SwipeOptions {
  onLeft: () => void;
  onRight: () => void;
  /** Pixel threshold past which a release commits the swipe. */
  threshold?: number;
  /** Disable interaction (e.g. while iframe loads). */
  disabled?: boolean;
  /** Resting tilt for the card, in degrees. Composed with the drag rotation. */
  restTilt?: number;
  /**
   * When this value changes, the swipe state is reset. Pass `itemKey` so the
   * fly-off animation lingers (card stays invisible) until the next item is
   * actually rendered, then snaps back to rest.
   */
  resetKey?: string;
}

export interface SwipeBindings {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
}

export interface SwipeState {
  bind: SwipeBindings;
  /** Decomposed values so Card can compose them with entrance state. */
  dragX: number;
  totalRot: number;
  opacity: number;
  transition: string;
  /** True while a snap or fly animation is in flight. */
  isAnimating: boolean;
  /** Programmatic fling, used by keyboard / button paths. */
  fling: (dir: 'left' | 'right') => void;
  /** Convenience packed style for callers that don't need composition. */
  style: React.CSSProperties;
}

const FLY_MS = 450;
const SNAP_MS = 250;

/**
 * Pointer state machine driving the card's translate/rotation/opacity.
 *
 * Pure: depends only on its options + internal state. No plugin coupling.
 * Animation is CSS-transition driven via inline style transitions.
 */
export function useSwipe(opts: SwipeOptions): SwipeState {
  const { onLeft, onRight, threshold = 100, disabled = false, restTilt = 0, resetKey } = opts;
  const [dragX, setDragX] = useState(0);
  const [animating, setAnimating] = useState<'idle' | 'snapping' | 'flying'>('idle');
  const [flyDir, setFlyDir] = useState<-1 | 0 | 1>(0);
  const startX = useRef<number | null>(null);
  const pointerId = useRef<number | null>(null);
  const onLeftRef = useRef(onLeft);
  const onRightRef = useRef(onRight);
  useEffect(() => {
    onLeftRef.current = onLeft;
    onRightRef.current = onRight;
  });

  function reset() {
    startX.current = null;
    pointerId.current = null;
    setDragX(0);
    setFlyDir(0);
    setAnimating('idle');
  }

  // Reset when the parent signals a new item arrived. This is what unsticks
  // the card from the fly-off frozen state and lets the entrance animation
  // run on the new content.
  useEffect(() => {
    if (resetKey === undefined) return;
    reset();
  }, [resetKey]);

  function fly(dir: 'left' | 'right') {
    if (animating === 'flying') return;
    setAnimating('flying');
    setFlyDir(dir === 'left' ? -1 : 1);
    setDragX(dir === 'left' ? -window.innerWidth : window.innerWidth);
    // Fire the callback after the visual fly completes. We do NOT reset state
    // here — the card stays off-screen + invisible until `resetKey` changes
    // (i.e. the queue advanced to a new item). This prevents the brief
    // re-appearance of the old card while async actions like openItem run.
    setTimeout(() => {
      if (dir === 'left') onLeftRef.current();
      else onRightRef.current();
    }, FLY_MS);
  }

  const bind: SwipeBindings = {
    onPointerDown: (e) => {
      if (disabled) return;
      if (animating !== 'idle') return;
      startX.current = e.clientX;
      pointerId.current = e.pointerId;
      try {
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    onPointerMove: (e) => {
      if (disabled) return;
      if (startX.current == null || pointerId.current !== e.pointerId) return;
      setDragX(e.clientX - startX.current);
    },
    onPointerUp: (e) => {
      if (disabled) return;
      if (startX.current == null || pointerId.current !== e.pointerId) return;
      const dx = e.clientX - startX.current;
      if (dx <= -threshold) fly('left');
      else if (dx >= threshold) fly('right');
      else {
        setAnimating('snapping');
        setDragX(0);
        setTimeout(() => setAnimating('idle'), SNAP_MS);
      }
      startX.current = null;
      pointerId.current = null;
    },
    onPointerCancel: () => {
      if (startX.current == null) return;
      setAnimating('snapping');
      setDragX(0);
      setTimeout(() => setAnimating('idle'), SNAP_MS);
      startX.current = null;
      pointerId.current = null;
    },
  };

  // Card rotation = rest tilt + drag-driven rotation. Flying uses a strong tilt.
  const dragRot = animating === 'flying' ? flyDir * 24 : dragX / 18;
  const totalRot = restTilt + dragRot;
  const opacity = animating === 'flying' ? 0 : 1;
  let transition: string;
  if (animating === 'flying') {
    transition = `transform ${FLY_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${FLY_MS - 100}ms ease`;
  } else if (animating === 'snapping') {
    transition = `transform ${SNAP_MS + 30}ms cubic-bezier(0.2, 0.9, 0.3, 1)`;
  } else {
    transition = 'none';
  }

  const style: React.CSSProperties = {
    transform: `translate(calc(-50% + ${dragX}px), -50%) rotate(${totalRot}deg)`,
    transition,
    opacity,
  };

  return {
    bind,
    style,
    dragX,
    totalRot,
    opacity,
    transition,
    isAnimating: animating !== 'idle',
    fling: fly,
  };
}
