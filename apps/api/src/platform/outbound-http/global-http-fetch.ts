import type { HttpFetch } from './http-fetch.js';

export const globalHttpFetch: HttpFetch = (url, init) => fetch(url, init);
