import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';

export function useServerSeededForm<T>(
  baseline: T,
  equals: (left: T, right: T) => boolean,
): [T, Dispatch<SetStateAction<T>>] {
  const [form, setForm] = useState(baseline);
  const appliedBaselineRef = useRef(baseline);

  useEffect(() => {
    const previous = appliedBaselineRef.current;
    if (equals(previous, baseline)) return;
    appliedBaselineRef.current = baseline;
    setForm((current) => (equals(current, previous) ? baseline : current));
  }, [baseline, equals]);

  return [form, setForm];
}
