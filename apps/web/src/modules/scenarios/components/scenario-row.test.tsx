import type { ScenarioSummaryDto } from '@immersion/contracts/scenarios';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../../test-support/render-with-providers';
import { ScenarioRow } from './scenario-row';

const scenario: ScenarioSummaryDto = {
  concept: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  id: 'gavan-noch',
  name: 'Ночная гавань',
  preview: 'Туман над причалом.',
  tags: ['нуар'],
  updatedAt: '2026-10-02T09:00:00.000Z',
};

function pressFocused(button: HTMLElement) {
  button.focus();
  fireEvent.click(button);
}

describe('ScenarioRow', () => {
  it('keeps focus on the same button when asking to delete, so keyboard users stay in place', async () => {
    await renderWithProviders(<ScenarioRow scenario={scenario} />);
    const askDelete = screen.getByTitle('Удалить сценарий');

    pressFocused(askDelete);

    expect(screen.getByText('Удалить')).toBe(askDelete);
    expect(document.activeElement).toBe(askDelete);
  });

  it('keeps focus on the same button when cancelling the delete', async () => {
    await renderWithProviders(<ScenarioRow scenario={scenario} />);
    pressFocused(screen.getByTitle('Удалить сценарий'));
    const cancel = screen.getByTitle('Не удалять');

    pressFocused(cancel);

    expect(screen.getByText('Начать чат')).toBe(cancel);
    expect(document.activeElement).toBe(cancel);
  });
});
