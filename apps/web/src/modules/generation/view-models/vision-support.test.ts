import { describe, expect, it } from 'vitest';

import { describeVisionSupport } from './vision-support';

describe('describeVisionSupport', () => {
  it('leaves attaching images to the user when vision support is not reported', () => {
    expect(describeVisionSupport('unknown').allowsImages).toBe(true);
    expect(describeVisionSupport(undefined).allowsImages).toBe(true);
  });

  it('forbids attaching images only for a model known to be text-only', () => {
    expect(describeVisionSupport('supported').allowsImages).toBe(true);
    expect(describeVisionSupport('unsupported').allowsImages).toBe(false);
  });
});
