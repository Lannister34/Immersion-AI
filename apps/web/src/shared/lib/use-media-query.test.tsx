import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { mediaQueryStub } from '../../test-support/media-query-stub';
import { NARROW_VIEWPORT_QUERY, TOUCH_ONLY_QUERY } from './media-queries';
import { useMediaQuery } from './use-media-query';

describe('useMediaQuery', () => {
  it('reports whether the query matches now', () => {
    mediaQueryStub.matchOnly([TOUCH_ONLY_QUERY]);

    expect(renderHook(() => useMediaQuery(TOUCH_ONLY_QUERY)).result.current).toBe(true);
    expect(renderHook(() => useMediaQuery(NARROW_VIEWPORT_QUERY)).result.current).toBe(false);
  });

  it('follows the viewport when it crosses the breakpoint', () => {
    const { result } = renderHook(() => useMediaQuery(NARROW_VIEWPORT_QUERY));
    expect(result.current).toBe(false);

    act(() => mediaQueryStub.matchOnly([NARROW_VIEWPORT_QUERY]));
    expect(result.current).toBe(true);

    act(() => mediaQueryStub.matchOnly([]));
    expect(result.current).toBe(false);
  });
});
