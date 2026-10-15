import { parseWebConfig, type WebConfig } from './parse-web-config';

export const webConfig: WebConfig = parseWebConfig(import.meta.env);
