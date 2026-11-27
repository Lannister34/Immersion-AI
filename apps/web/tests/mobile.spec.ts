import { expect, type Page, test } from '@playwright/test';

import { resetSmokeData } from './smoke-data-root.js';
import { PASSWORD_GATED_WEB_ORIGIN, SMOKE_WEB_PASSWORD, STUB_PROVIDER_URL } from './smoke-servers.js';

const PHONE_WIDTH = 375;
const PHONE_HEIGHT = 812;

test.use({ hasTouch: true, isMobile: true, viewport: { height: PHONE_HEIGHT, width: PHONE_WIDTH } });
test.describe.configure({ mode: 'serial' });
test.beforeEach(resetSmokeData);

const LIST_ELEMENTS_PAST_THE_VIEWPORT = `(() => {
  const width = document.documentElement.clientWidth;
  const found = [];
  if (document.documentElement.scrollWidth > width) {
    found.push('the page scrolls sideways: ' + document.documentElement.scrollWidth + 'px in ' + width + 'px');
  }
  for (const element of document.body.querySelectorAll('*')) {
    const box = element.getBoundingClientRect();
    if (box.width > 0 && box.height > 0 && (box.right > width + 0.5 || box.left < -0.5)) {
      const name = element.tagName.toLowerCase() + '.' + (element.getAttribute('class') ?? '').replaceAll(' ', '.');
      found.push(name + ' spans ' + Math.round(box.left) + '..' + Math.round(box.right) + 'px');
    }
  }
  return found;
})()`;

function elementsPastTheViewport(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(LIST_ELEMENTS_PAST_THE_VIEWPORT);
}

async function createChat(page: Page): Promise<string> {
  const response = await page.request.post('/api/chats', { data: {} });
  expect(response.status()).toBe(201);
  const { chat } = (await response.json()) as { chat: { id: string } };
  return chat.id;
}

function menuButton(page: Page) {
  return page.getByRole('button', { name: 'Открыть меню' });
}

function drawerLink(page: Page, name: string) {
  return page.getByRole('complementary').getByRole('link', { name: new RegExp(`^${name}`) });
}

test('signs in on a phone and lands on the chat list without sideways scrolling', async ({ page }) => {
  await page.goto(`${PASSWORD_GATED_WEB_ORIGIN}/chat`);
  await expect(page.getByRole('heading', { name: 'Вход в Immersion AI' })).toBeVisible();
  expect(await elementsPastTheViewport(page)).toEqual([]);

  await page.getByLabel('Пароль').fill(SMOKE_WEB_PASSWORD);
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Чаты' })).toBeVisible();
  await expect(menuButton(page)).toBeVisible();
  await expect(drawerLink(page, 'Персонажи')).toBeHidden();
  expect(await elementsPastTheViewport(page)).toEqual([]);
});

test('opens the navigation drawer and closes it after a link, on Escape and on the backdrop', async ({ page }) => {
  await page.goto('/chat');
  await expect(drawerLink(page, 'Персонажи')).toBeHidden();

  await menuButton(page).click();
  await expect(drawerLink(page, 'Персонажи')).toBeVisible();
  expect(await elementsPastTheViewport(page)).toEqual([]);
  await drawerLink(page, 'Персонажи').click();
  await expect(page).toHaveURL(/\/characters$/);
  await expect(drawerLink(page, 'Персонажи')).toBeHidden();

  await menuButton(page).click();
  await expect(drawerLink(page, 'Настройки')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawerLink(page, 'Настройки')).toBeHidden();

  await menuButton(page).click();
  await expect(drawerLink(page, 'Настройки')).toBeVisible();
  await page.mouse.click(PHONE_WIDTH - 10, PHONE_HEIGHT / 2);
  await expect(drawerLink(page, 'Настройки')).toBeHidden();
});

test('sends a message from a phone, keeping Enter for new lines, and shows the reply', async ({ page }) => {
  const settings = await page.request.patch('/api/providers/settings', {
    data: { activeProvider: 'custom', config: { model: 'stub-model', url: STUB_PROVIDER_URL }, mode: 'external' },
  });
  expect(settings.ok()).toBe(true);
  const chatId = await createChat(page);
  await page.goto(`/chat/${chatId}`);

  const composer = page.getByPlaceholder('Напишите сообщение…');
  await composer.fill('Привет с телефона');
  await composer.press('Enter');
  await expect(composer).toHaveValue('Привет с телефона\n');

  await page.getByRole('button', { name: 'Отправить' }).click();

  await expect(page.getByText('Эхо: Привет с телефона')).toBeVisible();
  await expect(composer).toHaveValue('');
  const composerBox = await composer.boundingBox();
  expect(composerBox?.y).toBeDefined();
  expect((composerBox?.y ?? 0) + (composerBox?.height ?? 0)).toBeLessThanOrEqual(PHONE_HEIGHT);
  expect(await elementsPastTheViewport(page)).toEqual([]);
});

test('opens the chat settings as a full-screen sheet and closes it', async ({ page }) => {
  const chatId = await createChat(page);
  await page.goto(`/chat/${chatId}`);
  const panelTitle = page.getByText('Настройки чата', { exact: true });
  await expect(panelTitle).toBeHidden();

  await page.getByRole('button', { name: 'Параметры модели' }).click();
  await expect(panelTitle).toBeVisible();
  const sheet = page.getByRole('complementary').filter({ has: panelTitle });
  expect(await sheet.boundingBox()).toEqual({ height: PHONE_HEIGHT, width: PHONE_WIDTH, x: 0, y: 0 });
  expect(await elementsPastTheViewport(page)).toEqual([]);

  await page.getByRole('button', { name: 'Скрыть панель' }).click();
  await expect(panelTitle).toBeHidden();

  await page.getByRole('button', { name: 'Контекст чата' }).click();
  await expect(page.getByText('Дополнительные инструкции')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panelTitle).toBeHidden();
});

test('opens the character editor from the drawer and the list', async ({ page }) => {
  await page.goto('/chat');
  await menuButton(page).click();
  await drawerLink(page, 'Персонажи').click();
  await page.getByRole('link', { name: 'Новый персонаж' }).first().click();

  await expect(page).toHaveURL(/\/characters\/new$/);
  await page.locator('#character-name').fill('Персонаж с телефона');
  await expect(page.getByRole('button', { name: 'Создать' })).toBeVisible();
  expect(await elementsPastTheViewport(page)).toEqual([]);
});

type LibraryCollection = 'characters' | 'lorebooks' | 'scenarios';

const CREATED_ENTITY_KEY: Record<LibraryCollection, string> = {
  characters: 'character',
  lorebooks: 'lorebook',
  scenarios: 'scenario',
};

async function createEntity(page: Page, collection: LibraryCollection, data: object): Promise<string> {
  const response = await page.request.post(`/api/${collection}`, { data });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as Record<string, { id: string } | undefined>;
  const created = body[CREATED_ENTITY_KEY[collection]];
  if (!created) throw new Error(`POST /api/${collection} returned no ${CREATED_ENTITY_KEY[collection]}.`);
  return encodeURIComponent(created.id);
}

test('keeps every screen within the phone width', async ({ page }) => {
  const longWord = 'ОченьДлинноеСловоБезПробеловКотороеНеПомещаетсяВШиринуТелефона';
  const chatId = await createChat(page);
  const characterId = await createEntity(page, 'characters', { description: longWord, name: `Персонаж ${longWord}` });
  const scenarioId = await createEntity(page, 'scenarios', { content: longWord, name: `Сценарий ${longWord}` });
  const lorebookId = await createEntity(page, 'lorebooks', {
    entries: [{ content: longWord, keys: [longWord] }],
    name: `Лорбук ${longWord}`,
    tags: [longWord.slice(0, 60)],
  });
  const paths = [
    '/chat',
    `/chat/${chatId}`,
    '/characters',
    '/characters/new',
    `/characters/${characterId}`,
    '/scenarios',
    '/scenarios/new',
    `/scenarios/${scenarioId}`,
    '/lorebooks',
    '/lorebooks/new',
    `/lorebooks/${lorebookId}`,
    '/settings',
    '/server',
    '/missing-route',
  ];

  for (const path of paths) {
    await page.goto(path);
    await expect(menuButton(page)).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await elementsPastTheViewport(page), path).toEqual([]);
  }

  await page.goto(`/chat/${chatId}`);
  await page.getByTitle('Удалить чат').click();
  await expect(page.getByText('удалить весь чат?')).toBeVisible();
  expect(await elementsPastTheViewport(page), 'chat delete confirmation').toEqual([]);

  await page.goto('/server');
  await page.getByRole('button', { name: 'Встроенный' }).click();
  await expect(page.getByRole('heading', { name: 'Модели' })).toBeVisible();
  await page.getByRole('button', { name: 'Параметры' }).click();
  await expect(page.getByRole('heading', { name: 'Каталоги моделей' })).toBeVisible();
  expect(await elementsPastTheViewport(page), '/server, built-in').toEqual([]);

  await page.goto('/characters');
  await page.getByRole('button', { name: 'Вид: список' }).click();
  await expect(page.getByRole('columnheader', { name: 'Персонаж' })).toBeVisible();
  expect(await elementsPastTheViewport(page), '/characters, list view').toEqual([]);
});
