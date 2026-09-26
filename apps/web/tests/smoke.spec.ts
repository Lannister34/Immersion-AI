import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, type Page, test } from '@playwright/test';

const smokeDataRoot = process.env.IMMERSION_SMOKE_DATA_ROOT;

if (!smokeDataRoot) {
  throw new Error('IMMERSION_SMOKE_DATA_ROOT must point to an isolated smoke-test data directory.');
}

const smokeUserSettingsPath = path.join(smokeDataRoot, 'user-settings.json');
const smokeChatsPath = path.join(smokeDataRoot, 'chats');

let baselineUserSettings = '';

test.describe.configure({ mode: 'serial' });

/** Название чата — заголовок экрана; рядом с ним живёт кнопка переименования. */
function chatTitle(page: Page) {
  return page.getByRole('heading', { level: 1 });
}

async function resetSmokeData() {
  await fs.writeFile(smokeUserSettingsPath, baselineUserSettings, 'utf8');
  await fs.rm(smokeChatsPath, { recursive: true, force: true });
}

test.beforeAll(async () => {
  baselineUserSettings = await fs.readFile(smokeUserSettingsPath, 'utf8');
});

test.beforeEach(resetSmokeData);

test.afterEach(resetSmokeData);

test('redirects root to chats and exposes the full sidebar navigation', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole('heading', { name: 'Чаты' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Чаты' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Персонажи' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Сценарии' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Лорбуки' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Настройки' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'API / Сервер' })).toBeVisible();
});

test('shows the LLM-runtime page with the LLM-runtime heading and mode switcher', async ({ page }) => {
  await page.goto('/server');

  await expect(page.getByRole('heading', { exact: true, name: 'LLM-runtime' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Встроенный' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Внешний API' })).toBeVisible();

  // Карточка логов живёт только во встроенном режиме; фикстура стартует во внешнем.
  await page.getByRole('button', { name: 'Встроенный' }).click();

  const logsToggle = page.getByRole('button', { name: /Логи сервера/ });
  await expect(logsToggle).toBeVisible();
  await logsToggle.click();
  await expect(page.getByText('Логи пусты. Запустите модель, чтобы увидеть вывод llama-server.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Скопировать' })).toBeVisible();
});

test('adds and removes a models directory on /server without a save step, keeping each change across reloads', async ({
  page,
}) => {
  await page.goto('/server');
  await page.getByRole('button', { name: 'Встроенный' }).click();

  await page.getByRole('button', { name: 'Параметры' }).click();
  await expect(page.getByRole('heading', { name: 'Каталоги моделей' })).toBeVisible();

  const addedConfig = page.waitForResponse(
    (response) => response.url().includes('/api/runtime/config') && response.request().method() === 'PUT',
  );
  await page.getByLabel('Новый каталог моделей').fill('C:\\smoke-models-extra');
  await page.getByRole('button', { name: 'Добавить' }).click();
  expect((await addedConfig).status()).toBe(200);

  // Шапка таблицы моделей переключается на счётчик каталогов после сохранения.
  await expect(page.getByText('2 каталога')).toBeVisible();
  // Каталог из фикстуры существует, добавленный — нет: ровно один бейдж «не найден».
  await expect(page.getByText('не найден', { exact: true })).toHaveCount(1);

  await page.reload();
  await page.getByRole('button', { name: 'Параметры' }).click();
  await expect(page.getByText('C:\\smoke-models-extra')).toBeVisible();

  const removedConfig = page.waitForResponse(
    (response) => response.url().includes('/api/runtime/config') && response.request().method() === 'PUT',
  );
  await page.locator('li', { hasText: 'C:\\smoke-models-extra' }).getByRole('button', { name: 'Убрать' }).click();
  expect((await removedConfig).status()).toBe(200);

  await page.reload();
  await page.getByRole('button', { name: 'Параметры' }).click();
  await expect(page.getByText('C:\\smoke-models-extra')).toBeHidden();
});

test('renders editable profile and sampler sections on /settings', async ({ page }) => {
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Профиль / Persona' })).toBeVisible();
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Тестер');
  await expect(page.getByRole('heading', { name: 'System Prompt' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sampler Presets' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Model Bindings' })).toBeVisible();
});

test('shows a route-level not-found screen for unknown paths', async ({ page }) => {
  await page.goto('/missing-route');

  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
  await expect(page.getByText('Проверьте адрес или вернитесь в доступные разделы приложения.')).toBeVisible();
});

test('imports a chat from a JSONL export file and opens the new session', async ({ page }) => {
  await page.goto('/chat');
  await expect(page.getByRole('heading', { name: 'Чаты' })).toBeVisible();

  const transcript = [
    JSON.stringify({
      chat_metadata: {
        createdAt: '2026-01-01T00:00:00.000Z',
        title: 'Импортированный смоук-чат',
        updatedAt: '2026-01-01T00:00:02.000Z',
      },
      user_name: 'Тестер',
      character_name: '',
    }),
    JSON.stringify({ is_user: true, mes: 'Привет из файла', send_date: '2026-01-01T00:00:01.000Z' }),
    JSON.stringify({ is_user: false, mes: 'Ответ из файла', send_date: '2026-01-01T00:00:02.000Z' }),
  ].join('\n');

  const importResponse = page.waitForResponse(
    (response) => response.url().includes('/api/chats/import') && response.request().method() === 'POST',
  );
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(transcript, 'utf8'),
    mimeType: 'application/x-ndjson',
    name: 'export.jsonl',
  });
  expect((await importResponse).status()).toBe(201);

  await expect(page).toHaveURL(/\/chat\/[A-Za-z0-9_-]+$/);
  await expect(chatTitle(page)).toHaveText('Импортированный смоук-чат');
  await expect(page.getByText('Привет из файла')).toBeVisible();
  await expect(page.getByText('Ответ из файла')).toBeVisible();
});

test('opens a freshly created chat from the list, renames it inline, and surfaces the new title on reload', async ({
  page,
}) => {
  await page.goto('/chat');

  await expect(page.getByRole('heading', { name: 'Чаты' })).toBeVisible();
  await page.getByRole('button', { name: /Свободный чат/i }).click();

  await expect(page).toHaveURL(/\/chat\/[A-Za-z0-9_-]+$/);

  const renameButton = page.locator('button[title="Переименовать чат"]');
  await expect(renameButton).toBeVisible();
  await renameButton.click();

  const renameInput = page.getByRole('textbox').first();
  await renameInput.fill('Renamed smoke chat');
  const putRename = page.waitForResponse(
    (response) => response.url().includes('/title') && response.request().method() === 'PATCH',
  );
  await renameInput.press('Enter');
  await putRename;
  await expect(chatTitle(page)).toHaveText('Renamed smoke chat');

  await page.reload();
  await expect(chatTitle(page)).toHaveText('Renamed smoke chat');
});

test('overrides a model parameter and chat instructions from the settings panel', async ({ page }) => {
  await page.goto('/chat');

  await expect(page.getByRole('heading', { name: 'Чаты' })).toBeVisible();
  await page.getByRole('button', { name: /Свободный чат/i }).click();
  await expect(page).toHaveURL(/\/chat\/[A-Za-z0-9_-]+$/);

  const resetButton = page.getByRole('button', { name: 'Сбросить изменения' });
  await expect(resetButton).toBeHidden();

  const savedTemperature = page.waitForResponse(
    (response) => response.url().includes('/generation-settings') && response.request().method() === 'PUT',
  );
  await page.locator('#chat-sampling-temperature').fill('1.25');
  await savedTemperature;
  await expect(resetButton).toBeVisible();

  await page.getByRole('button', { name: /Увеличить Temperature/ }).click();
  await expect(page.locator('#chat-sampling-temperature')).toHaveValue('1.3');

  const clearedTemperature = page.waitForResponse(
    (response) => response.url().includes('/generation-settings') && response.request().method() === 'PUT',
  );
  await resetButton.click();
  await clearedTemperature;
  await expect(resetButton).toBeHidden();

  await page.getByRole('button', { name: 'Контекст', exact: true }).click();
  const savedInstructions = page.waitForResponse(
    (response) => response.url().includes('/generation-settings') && response.request().method() === 'PUT',
  );
  await page.locator('#chat-additional-instructions').fill('Отвечай коротко.');
  await savedInstructions;

  // После перезагрузки панель открывается на «Модели»: вкладка — состояние сеанса, а не URL.
  await page.reload();
  await page.getByRole('button', { name: 'Контекст', exact: true }).click();
  await expect(page.locator('#chat-additional-instructions')).toHaveValue('Отвечай коротко.');
});

test('creates a character together with the avatar picked before the first save', async ({ page }) => {
  await page.goto('/characters/new');

  await page.locator('#character-name').fill('Смоук аватар');
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('pixels')]),
    mimeType: 'image/png',
    name: 'avatar.png',
  });
  await expect(page.getByText('Аватар загрузится вместе с карточкой.')).toBeVisible();

  const uploadedAvatar = page.waitForResponse(
    (response) => response.url().includes('/avatar') && response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Создать' }).click();
  expect((await uploadedAvatar).status()).toBe(200);

  await expect(page).toHaveURL(/\/characters$/);
  const cardLink = page.getByRole('link', { name: 'Открыть карточку: Смоук аватар' });
  await expect(cardLink).toBeVisible();

  // Прибираем за собой: смоук-фикстура переживает весь прогон целиком.
  await cardLink.click();
  await expect(page).toHaveURL(/\/characters\/.+/);
  await expect(page.locator('#character-name')).toHaveValue('Смоук аватар');
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.getByRole('button', { name: 'Да, удалить' }).click();
  await expect(page).toHaveURL(/\/characters$/);
  await expect(cardLink).toBeHidden();
});

test('offers the cloud providers with their defaults and refuses a model list without a key', async ({ page }) => {
  await page.goto('/server');

  await expect(page.locator('#provider-type')).toBeVisible();
  await page.locator('#provider-type').selectOption('anthropic');
  await expect(page.locator('#provider-url')).toHaveValue('https://api.anthropic.com/v1');
  await expect(page.locator('#provider-model')).toHaveAttribute('placeholder', 'claude-sonnet-4-5');
  await expect(page.locator('#provider-api-key')).toHaveAttribute('placeholder', 'sk-ant-…');

  await page.getByRole('button', { name: 'Список моделей' }).click();
  await expect(page.getByText('API-ключ провайдера не задан — список моделей запросить не у кого.')).toBeVisible();

  await page.locator('#provider-type').selectOption('openai');
  await expect(page.locator('#provider-url')).toHaveValue('https://api.openai.com/v1');
  await expect(page.locator('#provider-model')).toHaveAttribute('placeholder', 'gpt-4o');
});

test('drops the fetched model list when another provider is selected', async ({ page }) => {
  await page.route('**/api/providers/models', (route) =>
    route.fulfill({
      json: {
        activeProvider: 'custom',
        endpoint: 'http://127.0.0.1:5001/v1/models',
        issue: null,
        mode: 'external',
        models: [{ id: 'smoke-model-a' }, { id: 'smoke-model-b' }],
        status: 'ok',
      },
    }),
  );
  await page.goto('/server');

  await page.locator('#provider-type').selectOption('custom');
  await page.getByRole('button', { name: 'Список моделей' }).click();
  await expect(page.locator('#provider-models option')).toHaveCount(2);
  await expect(page.getByText('Провайдер вернул 2 модели — они подсказываются в поле.')).toBeVisible();

  await page.locator('#provider-type').selectOption('koboldcpp');
  await expect(page.locator('#provider-models option')).toHaveCount(0);
});
