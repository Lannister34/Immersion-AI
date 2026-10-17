import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../test-support/render-with-providers';
import { ErrorBanner } from './error-banner';

describe('ErrorBanner', () => {
  it('announces its message as an alert', async () => {
    const message = 'Не удалось сохранить: файл «<b>config</b>.json» занят';

    await renderWithProviders(<ErrorBanner>{message}</ErrorBanner>);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(message);
    expect(alert.querySelector('b')).toBeNull();
  });

  it('renders nothing extra around its children', async () => {
    await renderWithProviders(
      <ErrorBanner>
        <code>models/qwen.gguf</code> не найден
      </ErrorBanner>,
    );

    const alert = screen.getByRole('alert');
    expect(screen.getByText('models/qwen.gguf').parentElement).toBe(alert);
    expect(alert.textContent).toBe('models/qwen.gguf не найден');
  });

  it('announces the soft tone as an alert too', async () => {
    await renderWithProviders(<ErrorBanner tone="soft">Генерация прервана</ErrorBanner>);

    expect(screen.getByRole('alert').textContent).toBe('Генерация прервана');
  });
});
