import { describe, expect, it } from 'vitest';

import { planMessageEditSave } from './message-edit-save';

describe('planMessageEditSave', () => {
  it('saves the trimmed draft when it differs from the saved content', () => {
    expect(planMessageEditSave({ draft: '  *улыбается* «Да»\n', isSaving: false, savedContent: '«Да»' })).toEqual({
      content: '*улыбается* «Да»',
      kind: 'save',
    });
  });

  it('closes the editor without saving when the draft is blank or unchanged', () => {
    expect(planMessageEditSave({ draft: ' \n\t', isSaving: false, savedContent: '«Да»' })).toEqual({ kind: 'close' });
    expect(planMessageEditSave({ draft: '«Да» ', isSaving: false, savedContent: '«Да»' })).toEqual({ kind: 'close' });
  });

  it('ignores a repeated save while one is in flight, so the editor stays open and no second save starts', () => {
    expect(planMessageEditSave({ draft: '«Да»', isSaving: true, savedContent: '«Да»' })).toEqual({ kind: 'ignore' });
    expect(planMessageEditSave({ draft: '«Да», конечно', isSaving: true, savedContent: '«Да»' })).toEqual({
      kind: 'ignore',
    });
    expect(planMessageEditSave({ draft: '', isSaving: true, savedContent: '«Да»' })).toEqual({ kind: 'ignore' });
  });
});
