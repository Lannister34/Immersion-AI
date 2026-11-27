import { expect, type Page, test } from '@playwright/test';

import { resetSmokeData } from './smoke-data-root.js';
import { PASSWORD_GATED_WEB_ORIGIN, SMOKE_WEB_PASSWORD, STUB_PROVIDER_URL } from './smoke-servers.js';

const PHONE_WIDTH = 375;
const PHONE_HEIGHT = 812;

test.use({ hasTouch: true, isMobile: true, viewport: { height: PHONE_HEIGHT, width: PHONE_WIDTH } });
test.describe.configure({ mode: 'serial' });
test.beforeEach(resetSmokeData);

const MIN_PHONE_FIELD_FONT_PX = 16;
const MIN_PHONE_TAP_PX = 32;

const LIST_PHONE_LAYOUT_PROBLEMS = `(() => {
  const width = document.documentElement.clientWidth;
  const found = [];
  const describe = (element) =>
    element.tagName.toLowerCase() + (element.id ? '#' + element.id : '') + '.' +
    (element.getAttribute('class') ?? '').replaceAll(' ', '.');
  const isShown = (element) => {
    const box = element.getBoundingClientRect();
    return (
      box.width > 0 &&
      box.height > 0 &&
      getComputedStyle(element).visibility !== 'hidden' &&
      !element.closest('[aria-hidden="true"]')
    );
  };
  if (document.documentElement.scrollWidth > width) {
    found.push('the page scrolls sideways: ' + document.documentElement.scrollWidth + 'px in ' + width + 'px');
  }
  for (const element of document.body.querySelectorAll('*')) {
    const box = element.getBoundingClientRect();
    if (box.width > 0 && box.height > 0 && (box.right > width + 0.5 || box.left < -0.5)) {
      found.push(describe(element) + ' spans ' + Math.round(box.left) + '..' + Math.round(box.right) + 'px');
    }
  }
  const fields = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select';
  for (const field of document.body.querySelectorAll(fields)) {
    const size = parseFloat(getComputedStyle(field).fontSize);
    if (isShown(field) && size < ${MIN_PHONE_FIELD_FONT_PX}) {
      found.push(describe(field) + ' has a ' + size + 'px font, which makes iOS zoom in on focus');
    }
  }
  for (const target of document.body.querySelectorAll('button, a[href], select, summary, [role=button]')) {
    const box = target.getBoundingClientRect();
    if (isShown(target) && (box.width < ${MIN_PHONE_TAP_PX} || box.height < ${MIN_PHONE_TAP_PX})) {
      found.push(describe(target) + ' is a ' + Math.round(box.width) + 'x' + Math.round(box.height) + 'px tap target');
    }
  }
  return found;
})()`;

function phoneLayoutProblems(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(LIST_PHONE_LAYOUT_PROBLEMS);
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
  expect(await phoneLayoutProblems(page)).toEqual([]);

  await page.getByLabel('Пароль').fill(SMOKE_WEB_PASSWORD);
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Чаты' })).toBeVisible();
  await expect(menuButton(page)).toBeVisible();
  await expect(drawerLink(page, 'Персонажи')).toBeHidden();
  expect(await phoneLayoutProblems(page)).toEqual([]);
});

test('opens the navigation drawer and closes it after a link, on Escape and on the backdrop', async ({ page }) => {
  await page.goto('/chat');
  await expect(drawerLink(page, 'Персонажи')).toBeHidden();

  await menuButton(page).click();
  await expect(drawerLink(page, 'Персонажи')).toBeVisible();
  expect(await phoneLayoutProblems(page)).toEqual([]);
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
  await page.getByTitle('Редактировать').last().click();
  await expect(page.getByRole('button', { name: 'Сохранить' })).toBeVisible();
  expect(await phoneLayoutProblems(page), 'editing a message').toEqual([]);
  await page.getByRole('button', { name: 'Отменить' }).click();
  const composerBox = await composer.boundingBox();
  expect(composerBox?.y).toBeDefined();
  expect((composerBox?.y ?? 0) + (composerBox?.height ?? 0)).toBeLessThanOrEqual(PHONE_HEIGHT);
  expect(await phoneLayoutProblems(page)).toEqual([]);
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
  await page.locator('#chat-sampling-temperature').fill('1.25');
  await expect(page.getByTitle(/^Вернуть/).first()).toBeVisible();
  expect(await phoneLayoutProblems(page)).toEqual([]);

  await page.getByRole('button', { name: 'Скрыть панель' }).click();
  await expect(panelTitle).toBeHidden();

  await page.getByRole('button', { name: 'Контекст чата' }).click();
  await expect(page.getByText('Дополнительные инструкции')).toBeVisible();
  expect(await phoneLayoutProblems(page), 'context tab').toEqual([]);
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
  expect(await phoneLayoutProblems(page)).toEqual([]);
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
    expect(await phoneLayoutProblems(page), path).toEqual([]);
  }

  await page.goto(`/chat/${chatId}`);
  await page.getByTitle('Удалить чат').click();
  await expect(page.getByText('удалить весь чат?')).toBeVisible();
  expect(await phoneLayoutProblems(page), 'chat delete confirmation').toEqual([]);

  await page.goto('/server');
  await page.getByRole('button', { name: 'Встроенный' }).click();
  await expect(page.getByRole('heading', { name: 'Модели' })).toBeVisible();
  await page.getByRole('button', { name: 'Параметры' }).click();
  await expect(page.getByRole('heading', { name: 'Каталоги моделей' })).toBeVisible();
  expect(await phoneLayoutProblems(page), '/server, built-in').toEqual([]);

  await page.goto('/characters');
  await page.getByRole('button', { name: 'Вид: список' }).click();
  await expect(page.getByRole('columnheader', { name: 'Персонаж' })).toBeVisible();
  expect(await phoneLayoutProblems(page), '/characters, list view').toEqual([]);
});
