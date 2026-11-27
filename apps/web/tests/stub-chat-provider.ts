import { createServer, type ServerResponse } from 'node:http';

interface ChatCompletionRequest {
  messages?: { content?: unknown; role?: string }[];
  stream?: boolean;
}

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
  throw new Error(`Usage: node tests/stub-chat-provider.ts <port>; got "${process.argv[2] ?? ''}".`);
}

function parseCompletion(body: string): ChatCompletionRequest | null {
  try {
    return JSON.parse(body) as ChatCompletionRequest;
  } catch {
    return null;
  }
}

function lastUserText(request: ChatCompletionRequest): string {
  const content = request.messages?.findLast((message) => message.role === 'user')?.content;
  return typeof content === 'string' ? content : '';
}

function sendJson(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function streamReply(response: ServerResponse, reply: string): void {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const content of reply.split(/(?<= )/)) {
    const chunk = { choices: [{ delta: { content }, finish_reason: null, index: 0 }], object: 'chat.completion.chunk' };
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  const last = { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], object: 'chat.completion.chunk' };
  response.end(`data: ${JSON.stringify(last)}\n\ndata: [DONE]\n\n`);
}

const server = createServer((request, response) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk: string) => {
    body += chunk;
  });
  request.on('end', () => {
    if (request.url?.endsWith('/models')) {
      sendJson(response, { data: [{ id: 'stub-model', object: 'model' }], object: 'list' });
      return;
    }
    if (!request.url?.endsWith('/chat/completions')) {
      response.writeHead(404).end();
      return;
    }
    const completion = parseCompletion(body);
    if (!completion) {
      response.writeHead(400).end();
      return;
    }
    const reply = `Эхо: ${lastUserText(completion)}`;
    if (completion.stream) {
      streamReply(response, reply);
    } else {
      sendJson(response, {
        choices: [{ finish_reason: 'stop', index: 0, message: { content: reply, role: 'assistant' } }],
        object: 'chat.completion',
      });
    }
  });
});

server.listen(port, '127.0.0.1');
