export interface ServerSentEventDataDecoder {
  push(chunk: string): string[];
  end(): void;
}

const EVENT_SEPARATOR = /\r\n\r\n|\n\n|\r\r/u;
const LINE_BREAK = /\r\n|\r|\n/u;
const DATA_FIELD = /^data: ?(.*)$/u;

function readEventData(block: string): string | null {
  const dataLines = block
    .split(LINE_BREAK)
    .map((line) => DATA_FIELD.exec(line)?.[1])
    .filter((value) => value !== undefined);

  return dataLines.length > 0 ? dataLines.join('\n') : null;
}

export function createServerSentEventDataDecoder(): ServerSentEventDataDecoder {
  let pending = '';

  return {
    push(chunk) {
      pending += chunk;
      const blocks = pending.split(EVENT_SEPARATOR);
      pending = blocks.pop() ?? '';

      return blocks.map(readEventData).filter((data) => data !== null);
    },
    end() {
      if (pending.trim() !== '') {
        throw new Error(`The event stream ended inside an event: ${JSON.stringify(pending)}`);
      }
    },
  };
}
