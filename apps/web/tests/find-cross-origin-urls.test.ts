import { describe, expect, it } from 'vitest';

import { findAbsoluteUrlsInScript, findCrossOriginUrls } from './find-cross-origin-urls.js';

describe('findCrossOriginUrls in HTML', () => {
  it('finds absolute and protocol-relative references in double-quoted, single-quoted and unquoted attributes', () => {
    const html = [
      '<link rel="stylesheet" href="https://fonts.example/css">',
      "<script src='//cdn.example/app.js'></script>",
      '<img src=HTTP://images.example/a.png>',
      '<link rel="preconnect" href="https://fonts.gstatic.example" crossorigin />',
    ].join('\n');

    expect(findCrossOriginUrls(html, 'html')).toEqual([
      'https://fonts.example/css',
      '//cdn.example/app.js',
      'HTTP://images.example/a.png',
      'https://fonts.gstatic.example',
    ]);
  });

  it('checks every srcset candidate, SVG xlink:href and inline style urls', () => {
    const html = [
      '<img srcset="/local.png 1x, https://images.example/b.png 2x">',
      '<svg><use xlink:href="https://sprites.example/s.svg#i"></use></svg>',
      '<div style="background: url(\'//images.example/bg.png\')"></div>',
    ].join('\n');

    expect(findCrossOriginUrls(html, 'html')).toEqual([
      'https://images.example/b.png',
      'https://sprites.example/s.svg#i',
      '//images.example/bg.png',
    ]);
  });

  it('checks preload image candidates and the URL literals of inline scripts', () => {
    const html = [
      '<link rel="preload" as="image" imagesrcset="/a.png 1x, https://images.example/a2.png 2x">',
      `<script>fetch("https://analytics.example/t");new WebSocket('wss://live.example/s')</script>`,
    ].join('\n');

    expect(findCrossOriginUrls(html, 'html')).toEqual([
      'https://images.example/a2.png',
      'https://analytics.example/t',
      'wss://live.example/s',
    ]);
  });

  it('checks the URL literals of event-handler attributes and javascript: URLs', () => {
    const html = [
      `<body onload="fetch('https://ev.example/x')">`,
      `<img src="/a.png" ONERROR='this.src="https://fallback.example/a.png"'>`,
      `<a href="javascript:fetch('https://js.example/y')">Ссылка</a>`,
      `<link rel="stylesheet" href="/local.css" media="print" onload="this.media='all'">`,
    ].join('\n');

    expect(findCrossOriginUrls(html, 'html')).toEqual([
      'https://ev.example/x',
      'https://fallback.example/a.png',
      'https://js.example/y',
    ]);
  });

  it('accepts same-origin paths, data URIs and namespace declarations that fetch nothing', () => {
    const html = [
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AAAA"/></svg>',
      '<link rel="icon" href="/favicon.svg" />',
      '<script type="module" src="/src/main.tsx"></script>',
      '<a data-href="https://example.test">Ссылка на ёлку</a>',
    ].join('\n');

    expect(findCrossOriginUrls(html, 'html')).toEqual([]);
  });
});

describe('findCrossOriginUrls in CSS', () => {
  it('finds url() and @import references to other hosts in any quoting and letter case', () => {
    const css = [
      '@import "https://fonts.example/css2?family=Inter";',
      "@import url('//fonts.example/other.css');",
      '@font-face { src: URL(HTTPS://fonts.example/inter.woff2) format("woff2"); }',
    ].join('\n');

    expect(findCrossOriginUrls(css, 'css')).toEqual([
      '//fonts.example/other.css',
      'HTTPS://fonts.example/inter.woff2',
      'https://fonts.example/css2?family=Inter',
    ]);
  });

  it('finds the string candidates of image-set(), plain and prefixed', () => {
    const css = [
      '.hero { background-image: image-set("/hero.png" 1x, "https://images.example/hero@2x.png" 2x); }',
      ".logo { background-image: -webkit-image-set(url('/logo.png') 1x, '//cdn.example/logo@2x.png' 2x); }",
    ].join('\n');

    expect(findCrossOriginUrls(css, 'css')).toEqual([
      'https://images.example/hero@2x.png',
      '//cdn.example/logo@2x.png',
    ]);
  });

  it('accepts bundled assets, package specifiers and inline SVG data', () => {
    const css = [
      '@import "./styles/fonts.css";',
      '@font-face { src: url(/assets/inter-cyrillic-wght-normal-D1.woff2) format("woff2-variations"); }',
      '@font-face { src: url("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"); }',
      '.select { background: url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\'%3e%3c/svg%3e"); }',
    ].join('\n');

    expect(findCrossOriginUrls(css, 'css')).toEqual([]);
  });
});

describe('findAbsoluteUrlsInScript', () => {
  it('lists every http(s) and ws(s) URL literal so a reviewer decides whether the script fetches it', () => {
    const script = [
      'const ns="http://www.w3.org/2000/svg";fetch(`https://telemetry.example/v1?x=` + id);let p="/api/chats";',
      'new WebSocket("wss://live.example/socket");new WebSocket(`WS://127.0.0.1:9000`)',
    ].join('');

    expect(findAbsoluteUrlsInScript(script)).toEqual([
      'http://www.w3.org/2000/svg',
      'https://telemetry.example/v1?x=',
      'wss://live.example/socket',
      'WS://127.0.0.1:9000',
    ]);
  });
});
