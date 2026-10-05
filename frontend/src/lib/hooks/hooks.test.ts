import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from './useDebouncedValue';
import { useResettingPage } from './useResettingPage';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits 300 ms after the last change', () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300);
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: '' },
    });
    rerender({ value: 'b' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: 'bo' });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('');
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe('bo');
  });
});

describe('useResettingPage', () => {
  it('keeps the page for the same key and returns 1 for a new key', () => {
    const { result, rerender } = renderHook(({ key }) => useResettingPage(key), {
      initialProps: { key: 'a' },
    });
    expect(result.current[0]).toBe(1);
    act(() => result.current[1](3));
    expect(result.current[0]).toBe(3);
    rerender({ key: 'b' });
    expect(result.current[0]).toBe(1);
    act(() => result.current[1](2));
    expect(result.current[0]).toBe(2);
    rerender({ key: 'a' });
    expect(result.current[0]).toBe(1);
  });
});
