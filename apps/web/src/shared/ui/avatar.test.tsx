import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createApiUrl } from '../api/client';
import { Avatar } from './avatar';

describe('Avatar', () => {
  it('shows the image while it loads', () => {
    render(<Avatar name="Мария Иванова" size={40} url="/api/characters/maria/avatar" />);

    expect(screen.getByRole('presentation').getAttribute('src')).toBe(createApiUrl('/api/characters/maria/avatar'));
    expect(screen.queryByText('МИ')).toBeNull();
  });

  it('shows the initial after the image fails to load', () => {
    render(<Avatar name="Мария Иванова" size={40} url="/api/characters/maria/avatar" />);

    fireEvent.error(screen.getByRole('presentation'));

    expect(screen.queryByRole('presentation')).toBeNull();
    expect(screen.getByTitle('Мария Иванова').textContent).toBe('МИ');
  });

  it('shows the initial when there is no url', () => {
    render(<Avatar name="Мария" size={40} url={null} />);

    expect(screen.queryByRole('presentation')).toBeNull();
    expect(screen.getByTitle('Мария').textContent).toBe('М');
  });

  it('shows the image again when a broken url is replaced', () => {
    const { rerender } = render(<Avatar name="Мария" size={40} url="/api/characters/maria/avatar" />);
    fireEvent.error(screen.getByRole('presentation'));

    rerender(<Avatar name="Мария" size={40} url="/api/characters/maria/avatar?v=2" />);

    expect(screen.getByRole('presentation').getAttribute('src')).toBe(createApiUrl('/api/characters/maria/avatar?v=2'));
  });
});
