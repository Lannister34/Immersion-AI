import type { SaveScenarioCommand, ScenarioDetailDto } from '@immersion/contracts/scenarios';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createEditorDraftStore, type EditorDraftStore } from '../../shared/drafts/editor-draft-store';
import { createTestQueryClient } from '../../test-support/create-test-query-client';
import { renderWithProviders } from '../../test-support/render-with-providers';
import { stubFetch } from '../../test-support/stub-fetch';
import { ScenarioEditorScreen } from './editor';

const SCENARIO_ID = 'gavan-noch';
const SCENARIO_URL = `/api/scenarios/${SCENARIO_ID}`;
const RESTORED_NOTICE = 'Восстановлен несохранённый черновик.';

const SAVED_SCENARIO: ScenarioDetailDto = {
  concept: 'Туман над причалом',
  content: 'Ночь, пустая гавань, где-то звонит рында.',
  createdAt: '2026-10-01T09:00:00.000Z',
  firstMessage: '',
  id: SCENARIO_ID,
  name: 'Ночная гавань',
  tags: ['нуар'],
  updatedAt: '2026-10-02T09:00:00.000Z',
};

const READY_FOR_GENERATION = {
  activeProvider: 'koboldcpp',
  issue: null,
  mode: 'builtin',
  runtime: null,
  status: 'ready',
  visionSupport: 'unknown',
};

interface ScenarioServer {
  deleted: boolean;
  pendingFirstMessage: ((value: string) => void) | null;
  pendingSave: (() => void) | null;
  saved: ScenarioDetailDto;
  saves: SaveScenarioCommand[];
}

interface ScenarioServerOptions {
  holdSaves?: boolean;
  saved?: ScenarioDetailDto;
}

function serveScenario({ holdSaves = false, saved = SAVED_SCENARIO }: ScenarioServerOptions = {}): ScenarioServer {
  const server: ScenarioServer = { deleted: false, pendingFirstMessage: null, pendingSave: null, saved, saves: [] };
  stubFetch().mockImplementation((input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/api/generation/readiness')) {
      return Promise.resolve(Response.json(READY_FOR_GENERATION));
    }
    if (url.endsWith('/api/generation/scenario-first-message')) {
      return new Promise<Response>((resolve) => {
        server.pendingFirstMessage = (value) => resolve(Response.json({ value }));
      });
    }
    if (url.endsWith(SCENARIO_URL) && method === 'GET') {
      return Promise.resolve(Response.json({ scenario: server.saved }));
    }
    if (url.endsWith(SCENARIO_URL) && method === 'PUT' && typeof init?.body === 'string') {
      const command = JSON.parse(init.body) as SaveScenarioCommand;
      server.saves.push(command);
      const respond = () => {
        server.saved = { ...server.saved, ...command, updatedAt: '2026-10-05T09:00:00.000Z' };
        return Response.json({ scenario: server.saved });
      };
      if (!holdSaves) return Promise.resolve(respond());
      return new Promise<Response>((resolve) => {
        server.pendingSave = () => resolve(respond());
      });
    }
    if (url.endsWith(SCENARIO_URL) && method === 'DELETE') {
      server.deleted = true;
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return new Promise<Response>(() => {});
  });
  return server;
}

async function openEditor(scenarioId: string | null, editorDraftStore: EditorDraftStore) {
  const view = await renderWithProviders(<ScenarioEditorScreen scenarioId={scenarioId} />, {
    editorDraftStore,
    queryClient: createTestQueryClient(),
  });
  if (scenarioId !== null) {
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ночная гавань'));
  }
  return view;
}

function field(label: string): HTMLInputElement | HTMLTextAreaElement {
  return screen.getByLabelText(label);
}

function type(label: string, value: string) {
  fireEvent.change(field(label), { target: { value } });
}

describe('ScenarioEditorScreen drafts', () => {
  it('brings back what was typed into a new scenario after leaving the editor', async () => {
    serveScenario();
    const store = createEditorDraftStore();
    const first = await openEditor(null, store);
    type('Название *', 'Шхуна «Призрак»');
    type('Сцена', 'Палуба скрипит под ногами {{user}}.');
    first.unmount();

    await openEditor(null, store);

    expect(field('Название *').value).toBe('Шхуна «Призрак»');
    expect(field('Сцена').value).toBe('Палуба скрипит под ногами {{user}}.');
    expect(screen.getByRole('status').textContent).toContain(RESTORED_NOTICE);
  });

  it('opens a new scenario empty and without a notice when nothing was left unsaved', async () => {
    serveScenario();

    await openEditor(null, createEditorDraftStore());

    expect(field('Название *').value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('discards a restored new-scenario draft back to an empty form for good', async () => {
    serveScenario();
    const store = createEditorDraftStore();
    const first = await openEditor(null, store);
    type('Название *', 'Шхуна «Призрак»');
    first.unmount();
    const second = await openEditor(null, store);

    fireEvent.click(screen.getByRole('button', { name: 'Отбросить черновик' }));

    expect(field('Название *').value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
    second.unmount();
    await openEditor(null, store);
    expect(field('Название *').value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('restores edits of a saved scenario over its saved version and discards back to it', async () => {
    serveScenario();
    const store = createEditorDraftStore();
    const first = await openEditor(SCENARIO_ID, store);
    type('Сцена', 'Рассвет, гавань оживает.');
    first.unmount();

    await openEditor(SCENARIO_ID, store);
    expect(field('Сцена').value).toBe('Рассвет, гавань оживает.');
    expect(screen.getByRole('status').textContent).toContain(RESTORED_NOTICE);

    fireEvent.click(screen.getByRole('button', { name: 'Отбросить черновик' }));

    expect(field('Сцена').value).toBe(SAVED_SCENARIO.content);
    expect(screen.queryByRole('status')).toBeNull();
    expect(store.read('scenario', SCENARIO_ID)).toBeNull();
  });

  it('clears the draft when the scenario is saved', async () => {
    const server = serveScenario();
    const store = createEditorDraftStore();
    const first = await openEditor(SCENARIO_ID, store);
    type('Сцена', 'Рассвет, гавань оживает.');

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(server.saves).toHaveLength(1));
    await waitFor(() => expect(store.read('scenario', SCENARIO_ID)).toBeNull());
    first.unmount();
    await openEditor(SCENARIO_ID, store);
    expect(field('Сцена').value).toBe('Рассвет, гавань оживает.');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('leaves no draft when the saved scenario only reformats what was typed', async () => {
    const server = serveScenario();
    const store = createEditorDraftStore();
    const first = await openEditor(SCENARIO_ID, store);
    type('Теги', 'нуар,ночь');

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(server.saved.tags).toEqual(['нуар', 'ночь']));
    await waitFor(() => expect(store.read('scenario', SCENARIO_ID)).toBeNull());
    first.unmount();
    await openEditor(SCENARIO_ID, store);
    expect(field('Теги').value).toBe('нуар, ночь');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps a generated value that lands while a save is still running', async () => {
    const server = serveScenario({ holdSaves: true });
    const store = createEditorDraftStore();
    const first = await openEditor(SCENARIO_ID, store);
    type('Сцена', 'Рассвет, гавань оживает.');
    const generate = screen.getByRole('button', { name: /Сгенерировать первую фразу/ });
    await waitFor(() => expect(generate).toHaveProperty('disabled', false));
    fireEvent.click(generate);
    await waitFor(() => expect(server.pendingFirstMessage).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(server.pendingSave).not.toBeNull());
    act(() => server.pendingFirstMessage?.('Где-то скрипит причал.'));
    await waitFor(() => expect(field('Первая фраза').value).toBe('Где-то скрипит причал.'));
    act(() => server.pendingSave?.());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDefined());
    first.unmount();

    await openEditor(SCENARIO_ID, store);
    expect(field('Сцена').value).toBe('Рассвет, гавань оживает.');
    expect(field('Первая фраза').value).toBe('Где-то скрипит причал.');
    expect(screen.getByRole('status').textContent).toContain(RESTORED_NOTICE);
  });

  it('clears the draft when the scenario is deleted', async () => {
    const server = serveScenario();
    const store = createEditorDraftStore();
    await openEditor(SCENARIO_ID, store);
    type('Сцена', 'Рассвет, гавань оживает.');

    fireEvent.click(screen.getByRole('button', { name: /Удалить/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Да, удалить' }));

    await waitFor(() => expect(server.deleted).toBe(true));
    await waitFor(() => expect(store.read('scenario', SCENARIO_ID)).toBeNull());
  });

  it('warns that saving the draft overwrites a saved version that changed meanwhile', async () => {
    serveScenario({ saved: { ...SAVED_SCENARIO, content: 'Шторм.', updatedAt: '2026-10-04T09:00:00.000Z' } });
    const store = createEditorDraftStore();
    store.write(
      'scenario',
      SCENARIO_ID,
      {
        concept: SAVED_SCENARIO.concept,
        content: 'Рассвет.',
        firstMessage: '',
        name: 'Ночная гавань',
        tagsText: 'нуар',
      },
      SAVED_SCENARIO.updatedAt,
    );

    await openEditor(SCENARIO_ID, store);

    expect(field('Сцена').value).toBe('Рассвет.');
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('сохранённая версия с тех пор изменилась'),
    );
    expect(screen.queryByTitle('Скрыть уведомление')).toBeNull();
  });
});
