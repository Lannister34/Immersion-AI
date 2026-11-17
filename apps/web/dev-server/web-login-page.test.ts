import { describe, expect, it } from 'vitest';

import { renderWebLoginPage } from './web-login-page.js';

describe('the web login page', () => {
  it('posts the password and the return path to the login route, in Russian', () => {
    const html = renderWebLoginPage({ next: '/chat/abc' });

    expect(html).toContain('<html lang="ru">');
    expect(html).toContain('action="/__web/login"');
    expect(html).toContain('name="next" value="/chat/abc"');
    expect(html).toContain('type="password" name="password"');
  });

  it('escapes the return path and the error, so neither can inject markup', () => {
    const html = renderWebLoginPage({ error: '<b>x</b>', next: '/"><script>alert(1)</script>' });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });
});
