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

- [Node.js](https://nodejs.org/) of the major version in [`.nvmrc`](.nvmrc) or newer (Corepack ships with it and provides pnpm); `corepack pnpm install` refuses an older Node

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

## Configuration

The API reads these environment variables once, at startup. A blank value counts as unset, and an
invalid value stops the API with a message that names the variable.

| Variable | Default | Meaning |
| --- | --- | --- |
| `IMMERSION_API_HOST` | `127.0.0.1` | Address the API listens on: loopback only, so `localhost` or an address in `127.0.0.0/8` or `::1`; any other value stops the API |
| `IMMERSION_API_PORT` | `4787` | API port, 1–65535 |
| `IMMERSION_WEB_PORT` | `4788` | Web client port: the API root redirects there, and the default origins use it |
| `IMMERSION_WEB_ORIGINS` | `http://localhost:<web port>,http://127.0.0.1:<web port>` | Comma-separated http(s) origins, without a path, that browsers may call the API from; compared in `scheme://host[:port]` form, so a trailing slash, an upper-case host or a default port still match |
| `IMMERSION_DATA_ROOT` | `data` in the repository root | Folder for chats, characters, settings and logs; a relative path resolves against the repository root |
| `IMMERSION_LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |

The web client has one build variable, `VITE_API_BASE_URL`, read by `vite build` and the Vite dev
server. Unset or blank, the client sends requests to its own origin, and the dev server forwards
`/api` to the API. To call the API directly, set it to the API's origin, such as
`http://127.0.0.1:4787`: scheme, host and optional port, with no path, query, fragment or
credentials. The API accepts those requests from the origins in `IMMERSION_WEB_ORIGINS`. Any other
value stops the client from loading, with an error in the browser console that names the variable.

Earlier versions started with `npm run dev:api` or `start.bat` kept data in `apps/data`: move that
folder to `data` in the repository root to keep your library.

### Password and local network

To ask for a password in the browser, create `apps/web/.env.local` (ignored by git) with:

```
IMMERSION_WEB_PASSWORD=your-password-or-PIN
```

The password is at least 4 characters, so a PIN works; use 6 digits or more, since a 4-digit PIN
can be guessed within a day or two from the network. Once it is set, every browser that opens the
app through the dev server, this computer included, gets a login page, and every page load asks
again: a reload, a new tab or a reopened browser shows the login. Opening the app in a new tab
signs the other tabs of that browser out: each returns to the login page at its next request.
Wrong passwords make that address wait longer after each attempt, up to 5 minutes, and after 30
wrong passwords in 10 minutes from anywhere every login waits. To log out without reloading, open
`/__web/logout`. With no password set, nothing asks for one.

By default the dev server listens on `127.0.0.1` only. To use the app from a phone or another
computer on the same network, add:

```
IMMERSION_WEB_LAN=1
```

LAN access requires the password: without it the dev server refuses to start. The dev server
restarts by itself when the file changes, and listens on every IPv4 interface; `pm2 restart
immersion-web` does the same. Open `http://<this computer's IP>:4788` on the other device: the
address, not the computer's name, which the dev server refuses. Delete the line or set `0` to close
it again. The variable accepts `1`, `true`, `yes`, `on`, `0`, `false`, `no` or `off`; a value set
in the process environment wins over the file (a blank one meaning unset), and any other value, an
unknown `IMMERSION_` key or a UTF-16 file stops the dev server at startup. The API stays on loopback
and is reached through the dev server's `/api` proxy, so leave `VITE_API_BASE_URL` unset; the dev
server also reads `IMMERSION_API_PROXY_TARGET` (default `http://127.0.0.1:4787`) from the same
file.

Only callers from loopback and the private and link-local ranges (`10.0.0.0/8`, `172.16.0.0/12`,
`192.168.0.0/16`, `169.254.0.0/16`) are served; a connection from any other address is dropped.
The password crosses the network unencrypted, as plain HTTP, so use it on a network you trust.
Anyone who knows it can use the app as you do: stored provider keys are never returned and do not
follow a changed provider address to another server, but they can be replaced or cleared. The file
stays on when a laptop joins another network, such as a café's Wi-Fi.

The password guards the browser path only. The API on `127.0.0.1:4787`, which the ComfyUI nodes
and other local programs call directly, asks for nothing: any program on this computer can read
`data/` anyway.

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
`presence_penalty` or `max_tokens`. `model` is passed to the provider as-is, except that an
empty name and the placeholders `default`, `immersion`, `immersion-ai`, `gpt-3.5-turbo` and
`gpt-4` select the model Immersion is configured with. Streaming and image parts work.

Other fields — OpenAI's own `seed` and `stop` as well as server extensions such as
`enable_thinking` and `chat_template_kwargs` — are forwarded unchanged to local
OpenAI-compatible servers only. The OpenAI and Anthropic clouds receive none of them, since
those APIs reject extension fields they do not know. Tool calls and `n > 1`
are reported as errors instead of being silently ignored. When a reasoning model spends the
whole budget on thinking, the answer comes back with `finish_reason: "length"` and the
thinking in `reasoning_content`, not as an error.

Errors on `/v1`, a malformed body and an unknown `/v1` route included, come back in OpenAI's
error shape, `{ "error": { "message", "type", "code" } }`, which OpenAI client libraries read.
A failure after a stream has started arrives as one more `data:` event in that shape, followed by
`data: [DONE]`.

### Managing the provider

The provider is switched over the same API, without opening the web UI:

```
GET   /api/providers/settings   # mode, active provider, configs (apiKeyConfigured, never the key)
PATCH /api/providers/settings   # change only the fields you send
POST  /api/providers/models     # list a provider's models without saving anything
GET   /api/runtime/overview     # built-in llama-server: status, models, directories
POST  /api/runtime/start        # start the built-in server with a model
POST  /api/runtime/apply-context # restart the running model with another context size
POST  /api/runtime/stop
```

`start` takes `modelPath`, `port`, `gpuLayers`, `flashAttention`, `threads`, an optional
`contextSize` and an optional `mmprojPath` — the multimodal projector passed to llama-server as
`--mmproj`, which is what turns a VL model into a model that actually sees images. Without
`contextSize` the model runs with the context of the sampler preset bound to it, or of the active
preset.

```
curl -X PATCH http://127.0.0.1:4787/api/providers/settings   -H 'Content-Type: application/json'   -d '{"mode":"external","activeProvider":"anthropic","config":{"apiKey":"sk-ant-…","model":"claude-sonnet-4-5"}}'
```

`config` applies to the provider that becomes active; an empty `apiKey` clears the stored key and
an empty `model` clears the model. Keys are write-only: no response carries a stored key, only
`apiKeyConfigured`. `POST /api/providers/models` without `apiKey` uses the stored key of that
provider, and only when the `url` has the same origin as the saved one; an empty `apiKey` asks
with no key. A key is visible ASCII without spaces. A key stays with the server it was entered for:
changing a provider's `url` to another origin (scheme, host or port) without sending `apiKey` in the
same request clears the stored key; a change within the same origin keeps it. Requests that can
carry the key (generation, the connection test and the model list) do not follow HTTP redirects, so the
provider's server cannot pass the key on to another one: set the provider's final address, since a
redirect is reported as an error that names its target.

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

- [Node.js](https://nodejs.org/) мажорной версии из [`.nvmrc`](.nvmrc) или новее (pnpm поставляется с ним через Corepack); на более старом Node `corepack pnpm install` завершится ошибкой

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

## Настройка

API читает эти переменные окружения один раз, при запуске. Пустое значение считается незаданным, а
неверное останавливает API с сообщением, в котором названа переменная.

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `IMMERSION_API_HOST` | `127.0.0.1` | Адрес, на котором слушает API: только loopback, то есть `localhost` или адрес из `127.0.0.0/8` или `::1`; любое другое значение останавливает API |
| `IMMERSION_API_PORT` | `4787` | Порт API, 1–65535 |
| `IMMERSION_WEB_PORT` | `4788` | Порт веб-клиента: туда перенаправляет корень API, и из него собираются origin по умолчанию |
| `IMMERSION_WEB_ORIGINS` | `http://localhost:<порт клиента>,http://127.0.0.1:<порт клиента>` | Origin через запятую (http или https, без пути), из которых браузер может обращаться к API; сравниваются в виде `схема://хост[:порт]`, поэтому косая черта в конце, хост в верхнем регистре или порт по умолчанию не мешают совпадению |
| `IMMERSION_DATA_ROOT` | `data` в корне репозитория | Папка с чатами, персонажами, настройками и логами; относительный путь считается от корня репозитория |
| `IMMERSION_LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` или `silent` |

У веб-клиента одна переменная сборки, `VITE_API_BASE_URL`; её читают `vite build` и dev-сервер
Vite. Если она не задана или пуста, клиент шлёт запросы на свой же origin, а dev-сервер
перенаправляет `/api` в API. Чтобы клиент обращался к API напрямую, укажите origin API, например
`http://127.0.0.1:4787`: схема, хост и, если нужно, порт, без пути, параметров запроса, фрагмента и
учётных данных. API принимает такие запросы с origin из `IMMERSION_WEB_ORIGINS`. Любое другое
значение не даёт клиенту загрузиться, а в консоли браузера появляется ошибка с именем переменной.

Прежние версии, запущенные через `npm run dev:api` или `start.bat`, хранили данные в `apps/data`:
перенесите эту папку в `data` в корне репозитория, чтобы не потерять библиотеку.

### Пароль и локальная сеть

Чтобы браузер спрашивал пароль, создайте `apps/web/.env.local` (git его игнорирует) со строкой:

```
IMMERSION_WEB_PASSWORD=ваш-пароль-или-PIN
```

Пароль — не короче 4 символов, так что подойдёт и PIN; берите 6 цифр и больше: 4-значный PIN из
сети можно подобрать за день-два. Когда он задан, любой браузер,
открывающий приложение через dev-сервер, включая этот компьютер, видит страницу входа, и каждая
загрузка страницы спрашивает пароль заново: после обновления, в новой вкладке и после перезапуска
браузера. Открытие приложения в новой вкладке выводит из системы другие вкладки этого браузера:
каждая возвращается на страницу входа при следующем запросе. После каждого неверного пароля адрес
ждёт дольше, вплоть до 5 минут, а после 30 неверных паролей за 10 минут с любых адресов ждут все
входы. Чтобы выйти без обновления, откройте `/__web/logout`. Без пароля ничего не спрашивается.

По умолчанию dev-сервер слушает только `127.0.0.1`. Чтобы пользоваться приложением с телефона или
другого компьютера в той же сети, добавьте:

```
IMMERSION_WEB_LAN=1
```

Доступ из сети требует пароля: без него dev-сервер не запустится. Dev-сервер сам перезапускается,
когда файл меняется, и слушает все IPv4-интерфейсы; `pm2 restart immersion-web` делает то же. На
другом устройстве откройте `http://<IP этого компьютера>:4788` — именно адрес, а не имя
компьютера: имя dev-сервер отклоняет. Чтобы снова закрыть доступ, удалите строку или поставьте
`0`. Переменная принимает `1`, `true`, `yes`, `on`, `0`, `false`, `no` или `off`; значение из
окружения процесса важнее файла (пустое значит «не задано»), а любое другое значение, неизвестный
ключ `IMMERSION_` или файл в UTF-16 останавливают dev-сервер при запуске. API остаётся на loopback,
и до него доходят через прокси `/api` dev-сервера, поэтому `VITE_API_BASE_URL` не задавайте; из
того же файла dev-сервер читает и `IMMERSION_API_PROXY_TARGET` (по умолчанию
`http://127.0.0.1:4787`).

Обслуживаются только запросы с loopback и из частных и link-local диапазонов (`10.0.0.0/8`,
`172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`); соединение с любого другого адреса
сбрасывается. Пароль идёт по сети без шифрования, по обычному HTTP, поэтому пользуйтесь им в сети,
которой доверяете. Кто знает пароль, может пользоваться приложением так же, как вы: сохранённые
ключи провайдеров не отдаются и не уходят на другой сервер при смене адреса провайдера, но их
можно заменить или удалить. Файл остаётся в силе, когда ноутбук подключается к другой сети, например
к Wi-Fi в кафе.

Пароль защищает только путь через браузер. API на `127.0.0.1:4787`, к которому напрямую обращаются
узлы ComfyUI и другие локальные программы, ничего не спрашивает: любая программа на этом
компьютере и так может прочитать `data/`.

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
`max_tokens`. `model` уходит провайдеру как есть, но пустое имя и заглушки `default`,
`immersion`, `immersion-ai`, `gpt-3.5-turbo` и `gpt-4` заменяются моделью из настроек
Immersion. Стриминг и картинки работают.

Остальные поля — собственные поля OpenAI `seed` и `stop`, а также расширения серверов вроде
`enable_thinking` и `chat_template_kwargs` — уходят без изменений только локальным
OpenAI-совместимым серверам. Облакам OpenAI и Anthropic они не отправляются: эти API
отвечают 400 на незнакомые поля-расширения. Вызов инструментов и
`n > 1` возвращают ошибку, а не молчаливую подмену. Если модель-рассуждатель потратила весь
лимит на размышления, ответ приходит с `finish_reason: "length"` и мыслями в
`reasoning_content` — это не ошибка.

Ошибки `/v1`, включая неразборчивое тело запроса и неизвестный адрес под `/v1`, приходят
в формате ошибки OpenAI, `{ "error": { "message", "type", "code" } }`, который читают
клиентские библиотеки OpenAI. Сбой после начала стрима приходит ещё одним событием `data:` в
этом формате, а за ним `data: [DONE]`.

### Управление провайдером

Провайдер переключается тем же API, без захода в веб-интерфейс:

```
GET   /api/providers/settings   # режим, активный провайдер, конфиги (apiKeyConfigured, не ключ)
PATCH /api/providers/settings   # меняет только присланные поля
POST  /api/providers/models     # список моделей провайдера, ничего не сохраняя
GET   /api/runtime/overview     # встроенный llama-server: статус, модели, каталоги
POST  /api/runtime/start        # запустить встроенный сервер с моделью
POST  /api/runtime/apply-context # перезапустить работающую модель с другим контекстом
POST  /api/runtime/stop
```

`start` принимает `modelPath`, `port`, `gpuLayers`, `flashAttention`, `threads`,
необязательный `contextSize` и необязательный `mmprojPath` — мультимодальный проектор, который
уходит llama-server как `--mmproj`; без него VL-модель запускается текстовой и картинок не видит.
Без `contextSize` модель запускается с контекстом предустановки, привязанной к ней, или активной
предустановки.

```
curl -X PATCH http://127.0.0.1:4787/api/providers/settings   -H 'Content-Type: application/json'   -d '{"mode":"external","activeProvider":"anthropic","config":{"apiKey":"sk-ant-…","model":"claude-sonnet-4-5"}}'
```

`config` применяется к провайдеру, который становится активным; пустой `apiKey` снимает
сохранённый ключ, пустой `model` снимает модель. Ключи только записываются: ни один ответ не
содержит сохранённый ключ, только `apiKeyConfigured`. `POST /api/providers/models` без `apiKey`
берёт сохранённый ключ этого провайдера, и только если `url` того же origin, что и сохранённый;
пустой `apiKey` запрашивает без ключа. Ключ — видимые ASCII-символы без пробелов. Ключ остаётся
при сервере, для которого его ввели: смена `url` провайдера на другой origin (схема, хост или порт)
без `apiKey` в том же запросе удаляет сохранённый ключ, смена в пределах того же origin его
сохраняет. Запросы, которые могут нести ключ (генерация, проверка связи и список моделей), не следуют
HTTP-перенаправлениям, чтобы сервер провайдера не мог передать ключ другому серверу: указывайте
конечный адрес провайдера, а перенаправление приходит ошибкой с его целью.

API слушает 127.0.0.1 и не проверяет авторизацию. Держите его на loopback либо ставьте
перед ним обратный прокси, прежде чем открывать в сеть.

## TODO

- [ ] Instruct-шаблоны (ChatML, Alpaca, Llama 3, Mistral)
- [ ] Больше провайдеров (Ollama, OpenRouter)
- [ ] Многие другие функции

## Лицензия

[AGPL-3.0](LICENSE)
