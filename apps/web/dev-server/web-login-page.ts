import { WEB_LOGIN_PATH } from './web-login-routes.js';

export interface WebLoginPageOptions {
  readonly next: string;
  readonly error?: string;
}

const STYLE = `
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #15151a; color: #e8e8ee;
    font: 16px/1.5 system-ui, sans-serif; }
  main { width: min(360px, calc(100vw - 32px)); display: grid; gap: 14px; }
  h1 { margin: 0; font-size: 22px; font-weight: 600; }
  p { margin: 0; color: #a8a8b8; }
  input, button { font: inherit; padding: 10px 12px; border-radius: 8px; border: 1px solid #3a3a46; }
  input { background: #1e1e25; color: inherit; }
  button { background: #7c6cf0; border-color: #7c6cf0; color: #fff; cursor: pointer; }
  form { display: grid; gap: 10px; }
  .error { color: #ff8a8a; }
`;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderWebLoginPage({ error, next }: WebLoginPageOptions): string {
  const errorLine = error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : '';

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Вход — Immersion AI</title>
<style>${STYLE}</style>
</head>
<body><main>
<h1>Вход в Immersion AI</h1>
<p>Введите пароль или PIN. Он нужен при каждой загрузке страницы: после обновления, в новой вкладке и после перезапуска браузера.</p>
${errorLine}
<form method="post" action="${WEB_LOGIN_PATH}">
<input type="hidden" name="next" value="${escapeHtml(next)}">
<input type="password" name="password" aria-label="Пароль" placeholder="Пароль или PIN" autocomplete="current-password" required autofocus>
<button type="submit">Войти</button>
</form>
</main></body>
</html>`;
}
