import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';

export interface SwipeOptions {
  onLeft: () => void;
  onRight: () => void;
  /** Pixel threshold past which a release commits the swipe. */
  threshold?: number;
  /** Disable interaction (e.g. while iframe loads). */
  disabled?: boolean;
  /** Resting tilt for this card, in degrees. Composed with the drag rotation. */
  restTilt?: number;
}

export interface SwipeBindings {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
}

export interface SwipeState {
  bind: SwipeBindings;
  style: CSSProperties;
  isAnimating: boolean;
  /** Current horizontal drag offset in px. 0 when at rest. */
  dragX: number;
  /** Programmatic fling, used by the keyboard / button paths. */
  fling: (dir: 'left' | 'right') => void;
}

/**
 * Pointer state machine driving the card's translate/rotation/opacity.
 *
 * Pure: depends only on its options + internal state. No plugin coupling.
 * Animation is CSS-transition driven via inline style transitions.
 */
export function useSwipe(opts: SwipeOptions): SwipeState {
  const { onLeft, onRight, threshold = 100, disabled = false, restTilt = 0 } = opts;
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

  function fly(dir: 'left' | 'right') {
    if (animating === 'flying') return;
    setAnimating('flying');
    setFlyDir(dir === 'left' ? -1 : 1);
    setDragX(dir === 'left' ? -window.innerWidth : window.innerWidth);
    setTimeout(() => {
      if (dir === 'left') onLeftRef.current();
      else onRightRef.current();
      reset();
    }, 450);
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
      if (dx <= -threshold) {
        fly('left');
      } else if (dx >= threshold) {
        fly('right');
      } else {
        setAnimating('snapping');
        setDragX(0);
        setTimeout(() => setAnimating('idle'), 250);
      }
      startX.current = null;
      pointerId.current = null;
    },
    onPointerCancel: () => {
      if (startX.current == null) return;
      setAnimating('snapping');
      setDragX(0);
      setTimeout(() => setAnimating('idle'), 250);
      startX.current = null;
      pointerId.current = null;
    },
  };

  // Card rotation = rest tilt + drag-driven rotation.
  // Flying off uses an exaggerated rotation in the fly direction.
  const dragRot = animating === 'flying' ? flyDir * 24 : dragX / 18;
  const totalRot = restTilt + dragRot;
  const opacity = animating === 'flying' ? 0 : 1;
  let transition: string;
  if (animating === 'idle') {
    transition = 'none';
  } else if (animating === 'flying') {
    transition = 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease';
  } else {
    transition = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)';
  }

  const style: CSSProperties = {
    transform: `translate(calc(-50% + ${dragX}px), -50%) rotate(${totalRot}deg)`,
    transition,
    opacity,
  };

  return { bind, style, isAnimating: animating !== 'idle', dragX, fling: fly };
}
