import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderHookWithProviders, renderWithProviders } from './render-with-providers';

function Navigation() {
  const navigate = useNavigate();

  return (
    <>
      <Link to="/settings">Настройки</Link>
      <button onClick={() => void navigate({ to: '/server' })} type="button">
        Сервер
      </button>
    </>
  );
}

describe('renderWithProviders', () => {
  it('renders the element at the initial path of a router that Link and useNavigate drive', async () => {
    const { router } = await renderWithProviders(<Navigation />, { initialPath: '/chat' });

    expect(router.state.location.pathname).toBe('/chat');

    fireEvent.click(screen.getByRole('link', { name: 'Настройки' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));

    fireEvent.click(screen.getByRole('button', { name: 'Сервер' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/server'));
    expect(screen.getByRole('link', { name: 'Настройки' })).toBeDefined();
  });
});

describe('renderHookWithProviders', () => {
  it('fails a query on its first error instead of retrying it', async () => {
    const queryFn = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('недоступно'));

    const { result } = await renderHookWithProviders(() => useQuery({ queryKey: ['probe'], queryFn }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('passes the props of a rerender through the router to the hook', async () => {
    const { result, rerender } = await renderHookWithProviders(({ value }: { value: string }) => value, {
      initialProps: { value: 'первый' },
    });

    rerender({ value: 'второй' });

    expect(result.current).toBe('второй');
  });

  it('gives each render its own query client', async () => {
    const first = await renderHookWithProviders(() => null);
    first.queryClient.setQueryData(['probe'], 'кэш');

    const second = await renderHookWithProviders(() => null);

    expect(second.queryClient.getQueryData(['probe'])).toBeUndefined();
  });
});
