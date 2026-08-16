# Immersion AI

LLM frontend for roleplay and creative writing. Designed to make working with language models as simple and convenient as possible, while keeping full flexibility and control over generation.

All data is stored locally. No cloud dependencies, no telemetry.

## Features

- **Characters** — create, edit, import PNG V2/V3 cards (SillyTavern-compatible)
- **Lorebooks** — world info entries with keyword-based context injection
- **Scenarios** — manage and use RP scenarios
- **AI Generation** — generate characters, lorebooks, scenarios, chat titles, and more using your LLM
- **Flexible Configuration** — per-chat sampler settings, system prompts, generation presets
- **Built-in llama-server** — start/stop, model selection, GPU layers, context size
- **External API** — connect to any OpenAI-compatible server (LM Studio, KoboldCpp, llama-server) or to the OpenAI and Anthropic clouds
- **Use it as a backend** — an OpenAI-compatible endpoint lets other tools (ComfyUI, scripts) generate through Immersion

## Requirements

- [Node.js](https://nodejs.org/) 24+ (Corepack ships with it and provides pnpm)

## Getting Started

```
git clone https://github.com/Lannister34/immersion-ai.git
cd immersion-ai
corepack pnpm install
npm run dev:api
npm run dev:web
```

The web client runs at http://localhost:4788 and talks to the API at http://localhost:4787.

**Windows:** run `start.bat` — it installs dependencies and opens the app for you.

## Using Immersion as a backend

The API exposes an OpenAI-compatible endpoint, so any OpenAI client can generate through
the provider Immersion is configured with — a local llama-server, LM Studio, OpenAI or Claude:

```
POST http://127.0.0.1:4787/v1/chat/completions
GET  http://127.0.0.1:4787/v1/models
```

```
curl http://127.0.0.1:4787/v1/chat/completions   -H 'Content-Type: application/json'   -d '{"messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

The request carries the whole conversation: nothing is written to your chats. Sampler values
come from the active preset unless the request overrides `temperature`, `top_p`,
`presence_penalty` or `max_tokens`; `model` is passed to the provider as-is. Streaming and
image parts work; tool calls, `n > 1` and stop sequences are not supported and are reported
as errors instead of being silently ignored.

The API listens on 127.0.0.1 and has no authentication. Keep it on loopback, or put a
reverse proxy in front of it before exposing it to a network.

## TODO

- [ ] Instruct templates (ChatML, Alpaca, Llama 3, Mistral)
- [ ] More providers (Ollama, OpenRouter)
- [ ] Many more features

## License

[AGPL-3.0](LICENSE)

---

# Immersion AI (RU)

LLM-фронтенд для ролевых чатов и творческого письма. Цель проекта — максимальное удобство и простота работы с языковыми моделями при сохранении гибкости и полного контроля над генерацией.

Все данные хранятся локально. Без облачных зависимостей, без телеметрии.

## Возможности

- **Персонажи** — создание, редактирование, импорт PNG V2/V3 карточек (совместимы с SillyTavern)
- **Лорбуки** — записи с ключевыми словами для автоматической инъекции в контекст
- **Сценарии** — управление и использование RP-сценариев
- **AI-генерация** — генерация персонажей, лорбуков, сценариев, заголовков чатов и другого с помощью LLM
- **Гибкая настройка** — параметры сэмплера для каждого чата, системные промпты, пресеты генерации
- **Встроенный llama-server** — запуск/остановка, выбор модели, GPU-слои, размер контекста
- **Внешний API** — подключение к любому OpenAI-совместимому серверу (LM Studio, KoboldCpp, llama-server), а также к облакам OpenAI и Anthropic
- **Работа бэкендом** — OpenAI-совместимый эндпоинт позволяет генерировать через Immersion из других программ (ComfyUI, скрипты)

## Требования

- [Node.js](https://nodejs.org/) версии 24+ (pnpm поставляется с ним через Corepack)

## Запуск

```
git clone https://github.com/Lannister34/immersion-ai.git
cd immersion-ai
corepack pnpm install
npm run dev:api
npm run dev:web
```

Клиент открывается на http://localhost:4788 и работает с API на http://localhost:4787.

**Windows:** запустите `start.bat` — он поставит зависимости и откроет приложение.

## Immersion как бэкенд

API отдаёт OpenAI-совместимый эндпоинт: любой OpenAI-клиент может генерировать через
провайдера, настроенного в Immersion, — локальный llama-server, LM Studio, OpenAI или Claude:

```
POST http://127.0.0.1:4787/v1/chat/completions
GET  http://127.0.0.1:4787/v1/models
```

```
curl http://127.0.0.1:4787/v1/chat/completions   -H 'Content-Type: application/json'   -d '{"messages":[{"role":"user","content":"Привет"}],"stream":true}'
```

Вся история приходит в запросе, в ваши чаты ничего не пишется. Параметры сэмплера берутся
из активного пресета, если запрос не задал `temperature`, `top_p`, `presence_penalty` или
`max_tokens`; `model` уходит провайдеру как есть. Стриминг и картинки работают; вызов
инструментов, `n > 1` и стоп-последовательности не поддерживаются — на них приходит ошибка,
а не молчаливая подмена.

API слушает 127.0.0.1 и не проверяет авторизацию. Держите его на loopback либо ставьте
перед ним обратный прокси, прежде чем открывать в сеть.

## TODO

- [ ] Instruct-шаблоны (ChatML, Alpaca, Llama 3, Mistral)
- [ ] Больше провайдеров (Ollama, OpenRouter)
- [ ] Многие другие функции

## Лицензия

[AGPL-3.0](LICENSE)
