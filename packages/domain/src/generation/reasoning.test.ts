import { describe, expect, it } from 'vitest';

import { createReplySplitter, splitReply } from './reasoning.js';

function streamThrough(pieces: string[]) {
  const splitter = createReplySplitter();
  const chunks = pieces.flatMap((piece) => splitter.push(piece));

  return [...chunks, ...splitter.flush()];
}

describe('splitReply', () => {
  it('keeps a plain reply as it is', () => {
    expect(splitReply('Просто ответ.')).toEqual({ content: 'Просто ответ.', reasoning: '' });
  });

  it('takes the think block out of the reply', () => {
    expect(splitReply('<think>Прикину варианты.</think>Готовый ответ.')).toEqual({
      content: 'Готовый ответ.',
      reasoning: 'Прикину варианты.',
    });
  });

  it('understands the longer thinking tag', () => {
    expect(splitReply('<thinking>Ход мысли</thinking> Ответ')).toEqual({
      content: 'Ответ',
      reasoning: 'Ход мысли',
    });
  });

  it('treats an unclosed think block as reasoning, not as a reply', () => {
    expect(splitReply('<think>Модель не закрыла тег')).toEqual({
      content: '',
      reasoning: 'Модель не закрыла тег',
    });
  });

  it('collects several think blocks', () => {
    expect(splitReply('<think>раз</think>Ответ<think>два</think> и хвост')).toEqual({
      content: 'Ответ и хвост',
      reasoning: 'раздва',
    });
  });
});

describe('createReplySplitter', () => {
  it('routes streamed pieces to their channels', () => {
    expect(streamThrough(['<think>Ду', 'маю…</think>', 'Ответ.'])).toEqual([
      { channel: 'reasoning', text: 'Ду' },
      { channel: 'reasoning', text: 'маю…' },
      { channel: 'reply', text: 'Ответ.' },
    ]);
  });

  it('does not leak a tag split across two chunks', () => {
    expect(streamThrough(['Начало <thi', 'nk>скрытое</think> конец'])).toEqual([
      { channel: 'reply', text: 'Начало ' },
      { channel: 'reasoning', text: 'скрытое' },
      { channel: 'reply', text: ' конец' },
    ]);
  });

  it('holds back a tail that could still become a tag until flush releases it as reply text', () => {
    const splitter = createReplySplitter();

    expect(splitter.push('Ответ <thi')).toEqual([{ channel: 'reply', text: 'Ответ ' }]);
    expect(splitter.flush()).toEqual([{ channel: 'reply', text: '<thi' }]);
  });
});
