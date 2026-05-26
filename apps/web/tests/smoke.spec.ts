import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const smokeDataRoot = process.env.IMMERSION_SMOKE_DATA_ROOT;

if (!smokeDataRoot) {
  throw new Error('IMMERSION_SMOKE_DATA_ROOT must point to an isolated smoke-test data directory.');
}

const smokeUserSettingsPath = path.join(smokeDataRoot, 'user-settings.json');
const smokeChatsPath = path.join(smokeDataRoot, 'chats');

let baselineUserSettings = '';

test.describe.configure({ mode: 'serial' });

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
  await expect(renameButton).toContainText('Renamed smoke chat');

  await page.reload();
  await expect(page.locator('button[title="Переименовать чат"]')).toContainText('Renamed smoke chat');
});
