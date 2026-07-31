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
- **External API** — connect to any OpenAI-compatible server (LM Studio, KoboldCpp, llama-server)

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

## TODO

- [ ] Instruct templates (ChatML, Alpaca, Llama 3, Mistral)
- [ ] Multi-provider support (OpenAI, Anthropic, Ollama, OpenRouter)
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
- **Внешний API** — подключение к любому OpenAI-совместимому серверу (LM Studio, KoboldCpp, llama-server)

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

## TODO

- [ ] Instruct-шаблоны (ChatML, Alpaca, Llama 3, Mistral)
- [ ] Мульти-провайдеры (OpenAI, Anthropic, Ollama, OpenRouter)
- [ ] Многие другие функции

## Лицензия

[AGPL-3.0](LICENSE)
