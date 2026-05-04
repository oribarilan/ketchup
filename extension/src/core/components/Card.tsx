import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type MutableRefObject,
} from 'react';
import { useSwipe } from '../hooks/useSwipe';

export interface CardHandle {
  fling(dir: 'left' | 'right'): void;
}

interface CardProps {
  /** Stable id of the current item — used to trigger entrance + tilt refresh. */
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
 * The Card is mounted ONCE for the lifetime of the overlay. The iframe is a
 * stable child — never re-mounted across card transitions — so we don't reload
 * Teams/Outlook between cards.
 *
 * Per-item entrance animation + random tilt are driven by `itemKey` changes
 * via a CSS class toggle, not a React re-mount.
 */
export const Card = forwardRef<CardHandle, CardProps>(function Card(
  { itemKey, masked, onSwipeLeft, onSwipeRight, disabled, iframeRef },
  handleRef,
) {
  const restTilt = useMemo(() => seededTilt(itemKey), [itemKey]);
  const [enterClass, setEnterClass] = useState('');

  // Trigger an entrance animation each time itemKey changes.
  useEffect(() => {
    setEnterClass('card-enter');
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setEnterClass('card-enter card-enter-active')),
    );
    const clear = setTimeout(() => setEnterClass(''), 700);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(clear);
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

  return (
    <>
      <div className={`swipe-label swipe-label-left ${showLeftHint ? 'active' : ''}`}>✓ Read</div>
      <div className={`swipe-label swipe-label-right ${showRightHint ? 'active' : ''}`}>→ Keep</div>
      <div
        className={`card ${enterClass}`}
        style={{ ...swipe.style, ['--rest-tilt' as string]: `${restTilt}deg` }}
        {...swipe.bind}
      >
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
