import { type RenderHookResult, type RenderResult, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

import { createTestProviders, type TestProviders, type TestProvidersOptions } from './create-test-providers';

type ProviderHandles = Omit<TestProviders, 'wrapper'>;

export interface RenderHookWithProvidersOptions<Props> extends TestProvidersOptions {
  initialProps?: Props;
}

export async function renderWithProviders(
  ui: ReactNode,
  options: TestProvidersOptions = {},
): Promise<RenderResult & ProviderHandles> {
  const { editorDraftStore, queryClient, router, wrapper } = await createTestProviders(options);

  return Object.assign(render(ui, { wrapper }), { editorDraftStore, queryClient, router });
}

export async function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  options: RenderHookWithProvidersOptions<Props> = {},
): Promise<RenderHookResult<Result, Props> & ProviderHandles> {
  const { initialProps, ...providersOptions } = options;
  const { editorDraftStore, queryClient, router, wrapper } = await createTestProviders(providersOptions);

  return Object.assign(renderHook(hook, { initialProps, wrapper }), { editorDraftStore, queryClient, router });
}
