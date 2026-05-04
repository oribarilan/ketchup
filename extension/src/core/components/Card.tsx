import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from 'react';
import { useSwipe } from '../hooks/useSwipe';

export interface CardHandle {
  fling(dir: 'left' | 'right'): void;
}

interface CardProps {
  /** Stable id of the current item — drives entrance + tilt refresh. */
  itemKey: string;
  masked: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  disabled?: boolean;
  iframeRef: MutableRefObject<HTMLIFrameElement | null>;
}

/**
 * Swipeable card hosting the persistent iframe.
 *
 * The Card and its iframe are mounted ONCE for the overlay's lifetime so we
 * never reload Teams/Outlook between cards. Per-item entrance + random tilt
 * are driven by `itemKey` changes, composed into the same inline transform as
 * the swipe gesture (no CSS !important fighting React).
 */
export const Card = forwardRef<CardHandle, CardProps>(function Card(
  { itemKey, masked, onSwipeLeft, onSwipeRight, disabled, iframeRef },
  handleRef,
) {
  const restTilt = useMemo(() => seededTilt(itemKey), [itemKey]);

  // Entrance progress 0 → 1, plus an `active` flag so the transition stays
  // applied through the animation window (otherwise the browser sees the
  // transform change in the same frame as `transition: none` and snaps).
  const [entranceProgress, setEntranceProgress] = useState(1);
  const [entranceActive, setEntranceActive] = useState(false);
  useEffect(() => {
    setEntranceProgress(0);
    setEntranceActive(true);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setEntranceProgress(1)));
    const done = setTimeout(() => setEntranceActive(false), 700);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [itemKey]);

  const swipe = useSwipe({
    onLeft: onSwipeLeft,
    onRight: onSwipeRight,
    disabled: disabled ?? false,
    restTilt,
  });

  useImperativeHandle(handleRef, () => ({ fling: swipe.fling }), [swipe.fling]);

  const showLeftHint = swipe.dragX < -60;
  const showRightHint = swipe.dragX > 60;

  // Compose entrance + swipe into a single transform / opacity.
  // Entrance offset: card starts 8% above with scale 0.92 and opacity 0.
  // Both fade to neutral at entranceProgress=1.
  const entranceY = (1 - entranceProgress) * -8; // %
  const entranceScale = 0.92 + 0.08 * entranceProgress;
  const entranceOpacity = entranceProgress;

  const composed: CSSProperties = {
    ...swipe.style,
    transform: `translate(calc(-50% + ${swipe.dragX}px), calc(-50% + ${entranceY}%)) rotate(${swipe.totalRot}deg) scale(${entranceScale})`,
    // While swipe is animating (snap or fly), use the swipe transition.
    // Otherwise during entrance, use a smoother spring.
    transition:
      swipe.transition !== 'none'
        ? swipe.transition
        : entranceActive
          ? 'transform 0.55s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 0.4s ease'
          : 'none',
    opacity: swipe.opacity * entranceOpacity,
  };

  return (
    <>
      <div className={`swipe-label swipe-label-left ${showLeftHint ? 'active' : ''}`}>✓ Read</div>
      <div className={`swipe-label swipe-label-right ${showRightHint ? 'active' : ''}`}>→ Keep</div>
      <div className="card" style={composed} {...swipe.bind}>
        <iframe
          ref={(el) => {
            iframeRef.current = el;
          }}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          title="fs-card"
        />
        <div className={`card-mask ${masked ? 'active' : ''}`} />
      </div>
    </>
  );
});

/** Stable hash → tilt in [-3, +3] degrees (excluding the dead zone near 0). */
function seededTilt(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const norm = ((h >>> 0) % 1000) / 500 - 1; // -1..1
  const sign = norm < 0 ? -1 : 1;
  const mag = 1.2 + Math.abs(norm) * 1.8; // 1.2..3.0
  return sign * mag;
}
