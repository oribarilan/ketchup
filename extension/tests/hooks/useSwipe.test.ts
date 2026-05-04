import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipe } from '../../src/core/hooks/useSwipe';

function makePointerEvent(clientX: number, pointerId = 1): React.PointerEvent<HTMLElement> {
  return {
    clientX,
    pointerId,
    target: { setPointerCapture: () => {} },
  } as unknown as React.PointerEvent<HTMLElement>;
}

describe('useSwipe', () => {
  it('idle at rest with dragX=0', () => {
    const { result } = renderHook(() => useSwipe({ onLeft: vi.fn(), onRight: vi.fn() }));
    expect(result.current.dragX).toBe(0);
    expect(result.current.isAnimating).toBe(false);
  });

  it('snaps back when drag does not exceed threshold', () => {
    vi.useFakeTimers();
    const onLeft = vi.fn();
    const onRight = vi.fn();
    const { result } = renderHook(() => useSwipe({ onLeft, onRight, threshold: 100 }));

    act(() => result.current.bind.onPointerDown(makePointerEvent(0)));
    act(() => result.current.bind.onPointerMove(makePointerEvent(40)));
    act(() => result.current.bind.onPointerUp(makePointerEvent(40)));
    act(() => vi.advanceTimersByTime(300));

    expect(onLeft).not.toHaveBeenCalled();
    expect(onRight).not.toHaveBeenCalled();
    expect(result.current.dragX).toBe(0);
    vi.useRealTimers();
  });

  it('fires onLeft when dragged past negative threshold', () => {
    vi.useFakeTimers();
    const onLeft = vi.fn();
    const { result } = renderHook(() => useSwipe({ onLeft, onRight: vi.fn(), threshold: 100 }));
    act(() => result.current.bind.onPointerDown(makePointerEvent(0)));
    act(() => result.current.bind.onPointerMove(makePointerEvent(-150)));
    act(() => result.current.bind.onPointerUp(makePointerEvent(-150)));
    act(() => vi.advanceTimersByTime(500));
    expect(onLeft).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('fires onRight when dragged past positive threshold', () => {
    vi.useFakeTimers();
    const onRight = vi.fn();
    const { result } = renderHook(() => useSwipe({ onLeft: vi.fn(), onRight, threshold: 100 }));
    act(() => result.current.bind.onPointerDown(makePointerEvent(0)));
    act(() => result.current.bind.onPointerMove(makePointerEvent(150)));
    act(() => result.current.bind.onPointerUp(makePointerEvent(150)));
    act(() => vi.advanceTimersByTime(500));
    expect(onRight).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('pointer-cancel mid-drag snaps back without firing', () => {
    vi.useFakeTimers();
    const onLeft = vi.fn();
    const onRight = vi.fn();
    const { result } = renderHook(() => useSwipe({ onLeft, onRight, threshold: 100 }));
    act(() => result.current.bind.onPointerDown(makePointerEvent(0)));
    act(() => result.current.bind.onPointerMove(makePointerEvent(-200)));
    act(() => result.current.bind.onPointerCancel(makePointerEvent(-200)));
    act(() => vi.advanceTimersByTime(300));
    expect(onLeft).not.toHaveBeenCalled();
    expect(onRight).not.toHaveBeenCalled();
    expect(result.current.dragX).toBe(0);
    vi.useRealTimers();
  });

  it('respects disabled flag', () => {
    const onLeft = vi.fn();
    const { result } = renderHook(() =>
      useSwipe({ onLeft, onRight: vi.fn(), threshold: 50, disabled: true }),
    );
    act(() => result.current.bind.onPointerDown(makePointerEvent(0)));
    act(() => result.current.bind.onPointerMove(makePointerEvent(-200)));
    act(() => result.current.bind.onPointerUp(makePointerEvent(-200)));
    expect(onLeft).not.toHaveBeenCalled();
    expect(result.current.dragX).toBe(0);
  });
});
