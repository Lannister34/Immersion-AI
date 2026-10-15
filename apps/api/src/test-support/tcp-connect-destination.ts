const DEFAULT_CONNECT_HOST = 'localhost';
const MAX_TCP_PORT = 65_535;

export interface TcpDestination {
  host: string;
  port: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toPort(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) {
    return null;
  }

  const port = Number(value);

  return Number.isInteger(port) && port >= 0 && port <= MAX_TCP_PORT ? port : null;
}

function readOptionsDestination(options: Record<string, unknown>): TcpDestination | null {
  if (options.path) {
    return null;
  }

  const port = toPort(options.port);
  const host = options.host || DEFAULT_CONNECT_HOST;

  return port !== null && typeof host === 'string' ? { host, port } : null;
}

function readPositionalDestination(portValue: unknown, host: unknown): TcpDestination | null {
  const port = toPort(portValue);

  if (port === null) {
    return null;
  }

  return { host: typeof host === 'string' && host !== '' ? host : DEFAULT_CONNECT_HOST, port };
}

export function readTcpConnectDestination(args: readonly unknown[]): TcpDestination | null {
  const [first, second] = args;
  const target: unknown = Array.isArray(first) ? first[0] : first;

  return isRecord(target) ? readOptionsDestination(target) : readPositionalDestination(target, second);
}
