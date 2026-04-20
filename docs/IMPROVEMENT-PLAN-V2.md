# QuickButton — план улучшений, v2 (пост-Sprint 2)

Документ продолжает `docs/IMPROVEMENT-PLAN.md`. Первый план закрыт: Sprint 1 (P0, 6 задач) и Sprint 2 (P1, 9 задач) выполнены.

Этот документ фиксирует замечания, которые остались / появились после Sprint 2, в формате «проблема → решение → критерий готовности». Он структурирован так, чтобы его можно было исполнять как Sprint 3 и Sprint 4.

Приоритеты:

- **P0** — блокеры качества / безопасности / релиза. Без них публичная сборка небезопасна или сломана.
- **P1** — сильный вклад в сопровождаемость / надёжность / UX. Следующая итерация.
- **P2** — желательно, но можно отложить.

Текущая интегральная оценка: **7.0 / 10** для внутреннего инструмента, **5.5 / 10** для публичного релиза. Главные точки роста — packaging, CSP, модульность renderer.

---

## Sprint 3 — P0 (до любого публичного билда)

### B1. Починить packaging: `src/shared/**` в bundle (P0)

**Проблема.** В `package.json` поле `build.files` перечисляет `electron/**/*`, `src/renderer/**/*`, `package.json`, но не включает `src/shared/**`. После Sprint 2 `electron/main.cjs` делает `require("../src/shared/presetSchema.cjs")` и `require("../src/shared/ipc.cjs")`. В `npm start` всё работает (реальная ФС), в packaged app — `MODULE_NOT_FOUND` при старте.

**Решение.** Добавить `"src/shared/**/*"` в `build.files`. Сгенерировать DMG, открыть на чистом профиле, убедиться в корректном старте.

**Критерий готовности.**

- `npm run dist:mac` собирается без ошибок.
- Распакованный `.app` запускается, в логах нет `MODULE_NOT_FOUND`.
- Открытие / сохранение preset работает.
- На вкладке тестов `npm test` остаётся зелёным.

### B2. Content-Security-Policy (P0)

**Проблема.** В `src/renderer/index.html` нет `<meta http-equiv="Content-Security-Policy">`. В main не навешан `session.defaultSession.webRequest.onHeadersReceived`. Любая XSS через пользовательский ввод (имя кнопки, будущая HTML-подсказка) получит прямой доступ к `window.quickButtonApi`.

**Решение.**

- Добавить в `index.html` минимальный CSP: `default-src 'self'; img-src 'self' data: qb-asset:; script-src 'self'; style-src 'self' 'unsafe-inline';` (inline-style нужен для динамических стилей кнопок).
- В main навесить `onHeadersReceived`, возвращающий тот же CSP в HTTP-заголовке (защита в двух слоях).
- Включить `webSecurity: true` (проверить — уже должен быть по умолчанию).

**Критерий готовности.**

- DevTools → Security показывает активный CSP.
- Попытка загрузить внешний `<script src="http://…">` блокируется.
- Функциональность (рендер, фон-картинки) не ломается.

### B3. Custom protocol `qb-asset://` для пользовательских картинок (P0)

**Проблема.** `filePathToSrc(path)` формирует `file://` URL (`src/renderer/app.js:315-318`). Работает, но:

- Хрупко в packaged Electron 36 — `file://` всё чаще ограничен.
- Нет валидации: любой путь из пресета уходит в CSS `background-image`.
- Конфликтует с будущим CSP (`img-src 'self'` не покрывает `file://`).

**Решение.**

- В main зарегистрировать `protocol.handle("qb-asset", …)` с whitelisted корнями (userData, выбранные через dialog).
- Preload добавляет метод `dialog.pickIconFile` → возвращает `{ assetId }` вместо сырого пути (mapping хранится в userData).
- `filePathToSrc` превращается в `qb-asset://<assetId>`.
- Миграция v3 → v4: существующие `iconPath` переносятся в новый реестр.

**Критерий готовности.**

- Пользователь выбирает картинку → она видна на кнопке.
- В CSP есть `img-src 'self' qb-asset:;`, `file://` не используется.
- Попытка подсунуть `../../etc/passwd` через пресет не пролезает.

### B4. Crash handlers + reporter (P0)

**Проблема.** Если main упадёт, пользователь увидит молчаливо закрывшееся окно. `app.on("render-process-gone")`, `app.on("child-process-gone")`, `process.on("uncaughtException")` и `"unhandledRejection"` не обрабатываются. Логгер ловит только то, что явно логируется.

**Решение.**

- В main подписаться на все четыре события, писать структурированный лог (`{level, name, reason, stack}`), показывать диалог «приложение столкнулось с ошибкой» с кнопкой «Open logs».
- В renderer — `window.addEventListener("error")` + `"unhandledrejection"` → IPC в main для записи в тот же лог.
- Опционально: отключаемый в настройках crash-reporter (Sentry в self-hosted / локально).

**Критерий готовности.**

- Искусственный `throw` в main → в `quickbutton.log` появляется stack.
- `window.onerror` в renderer → то же самое.
- Пользователю показан человекочитаемый диалог, а не silent close.

### B5. Снимок-тесты для preset migrations (P0)

**Проблема.** Сейчас в `tests/presetSchema.test.js` тестируются миграции на синтетических объектах. Если пользователь сегодня сохранил пресет v2, а мы завтра внесём миграцию v3→v4 с багом, это не поймается.

**Решение.**

- `tests/fixtures/preset.v1.json`, `preset.v2.json`, `preset.v3.json` — реальные-ish примеры.
- Тесты: `migratePreset(fixtures.v1)` → ожидаемый v3-объект (snapshot).
- Защита от forward-migration: если `version > PRESET_SCHEMA_VERSION` — `migratePreset` бросает `PresetVersionError`, UI показывает «preset создан в более новой версии, откройте в актуальной сборке».

**Критерий готовности.**

- Тесты для каждой версии N → current проходят.
- Загрузка пресета с `version = CURRENT + 1` даёт явную ошибку, а не молчаливую потерю полей.

### B6. ESLint + Prettier + минимальный CI (P0)

**Проблема.** В репозитории 4000 строк без единой конфигурации линтинга. Разнобой в стиле (кавычки, `return`-синтаксис, обработка ошибок). Никакой автоматической проверки перед merge.

**Решение.**

- `eslint` + `@eslint/js` + `eslint-plugin-n` + `eslint-config-prettier` + `prettier` (плоская конфигурация ESLint 9).
- Правила: no-unused-vars, no-implicit-globals, prefer-const, eqeqeq, curly, eol-last.
- `.github/workflows/ci.yml`: на push/PR запускать `npm ci && npm run lint && npm run typecheck && npm test`.
- Скрипты `lint`, `format`, `format:check`.

**Критерий готовности.**

- `npm run lint` проходит, `npm run format:check` чистый.
- CI зелёный на main.
- В PR виден статус CI.

### B7. Preload импортирует каналы из shared (P0)

**Проблема.** `electron/preload.cjs:3-17` дублирует таблицу `channels`, которая уже живёт в `src/shared/ipc.cjs`. Любое расхождение = «канал не вызывается» без внятной ошибки.

**Решение.**

- Preload делает `const { CHANNELS, MENU_EVENTS } = require("../src/shared/ipc.cjs");` и использует.
- Удалить локальные таблицы `channels`/`menuEvents`/`menuChannels` в preload.
- Проверить, что `sandbox: true` совместим с require из preload (Electron 36 разрешает при `sandbox: true` только ограниченный набор встроенных модулей + относительные файлы из preload — `src/shared/*.cjs` подходит).

**Критерий готовности.**

- Единственный источник правды по каналам — `src/shared/ipc.cjs`.
- Добавление нового IPC-канала требует правки ≤ 2 файлов (shared + handler).

---

## Sprint 4 — P1 (зрелость кода и продукта)

### B8. Модуляризация renderer + Vite + TypeScript (P1)

**Проблема.** `src/renderer/app.js` ~1900 строк в одной `DOMContentLoaded`-функции. Всё в одной области видимости, нет `import/export`, нет типов. Любая новая фича ещё на 200-300 строк в тот же файл.

**Решение.** Поставить Vite как dev-сервер + сборщик для renderer, перевести на TS:

```
src/renderer/
  index.html                     // только <div id="app"> и <script type="module" src="/main.ts">
  main.ts
  state/
    store.ts                     // pub/sub + типизированный state
    ui-state.ts                  // selection, activeTab, dirty
  modules/
    grid.ts                      // рендер сетки + DnD
    editor.ts                    // редактор кнопки
    service.ts                   // service-кнопки, drag-handle, click-through
    shortcuts.ts                 // Cmd+E, 1-9, Esc
    onboarding.ts                // overlay + focus trap
  ipc/
    client.ts                    // типизированная обёртка над window.quickButtonApi
  styles/
    base.css, editor.css, grid.css, service.css
```

- Vite dev: `vite --mode electron-renderer`.
- Build: `vite build --outDir dist/renderer`, `electron-builder` забирает `dist/renderer/**`.
- Types: `src/shared/types.ts` становится живым (импортируется из renderer и из тестов через `vitest`).

**Критерий готовности.**

- Ни один файл в `src/renderer/` не превышает 400 строк.
- Цикл правки → hot-reload < 1 s.
- `tsc --noEmit` находит реальные ошибки типов.

### B9. Единый store как источник правды (P1)

**Проблема.** Половина runtime-состояния живёт вне `state.preset`: `selectedButtonId`, `selectedTarget`, `activeRightTab`, `selectedContactId`. Это блокирует undo/redo, multi-window, снимки для debug. `store`, добавленный в Sprint 2, используется только для подписки `render`.

**Решение.**

- Полный state = `{ preset, ui: { selection, activeTab, dirty } }`.
- Все мутации идут через `store.commit(draft => …)` (immer или ручная иммутабельность).
- `render()` больше не вызывается вручную — только через `store.subscribe(render)`.
- `markDirty()` удаляется, `isDirty` вычисляется диффом vs последнего saved-snapshot.

**Критерий готовности.**

- Поиск `\brender\(\)` по коду находит ≤ 2 вхождений (init + subscribe).
- `markDirty` отсутствует.
- Undo/redo легко встраивается поверх (entry для B17).

### B10. OSC codec в shared + тесты (P1)

**Проблема.** `encodeOscArg`, `encodeOscPacket` и пр. живут в `electron/main.cjs`. Pure-функции, но не покрыты тестами. OSC-совместимость — главное требование от аудио/видео-операторов.

**Решение.**

- Вынести в `src/shared/oscCodec.cjs`.
- Тесты: encode int/float/string/bool, смешанные args, empty args, OSC address validation, round-trip decode.
- Проверить бинарный вывод на известных фикстурах (Reaper/TouchOSC).

**Критерий готовности.**

- ≥ 15 тестов, byte-for-byte сравнение с фикстурой.
- `main.cjs` импортирует codec из shared.

### B11. Типизированные сетевые ошибки в UI (P1)

**Проблема.** `SendError` в main несёт `code` (`ETIMEDOUT`, `ECONNREFUSED`, `EINVAL`), но до UI доезжает только `message`. Пользователь видит одну и ту же «серую» строку независимо от класса ошибки.

**Решение.**

- В renderer типизировать error → `ErrorKind = "timeout" | "unreachable" | "refused" | "validation" | "unknown"`.
- Маппер `code → kind` (`ETIMEDOUT → timeout`, `EHOSTUNREACH/ENOTFOUND → unreachable`, `ECONNREFUSED → refused`, `EINVAL → validation`).
- Toast показывает иконку + человечное сообщение на языке UI: «Устройство не отвечает (timeout 2s)», «Нет связи с 192.168.1.10», «Соединение отклонено».
- В логах сохраняется исходный код и raw message.

**Критерий готовности.**

- Выключенный порт → toast «Connection refused», не «Unknown error».
- Блокированный firewall → toast «Host unreachable».
- Корректная локализация (после B16).

### B12. Retry / backoff + TCP connection pool (P1)

**Проблема.** Одна транзиентная UDP-ошибка = fail. Каждый TCP send открывает новый сокет, на стороне Companion/OSC-сервера это рваные соединения.

**Решение.**

- UDP/OSC: опционально `retry: {count: 2, jitterMs: 50}` на уровне команды (по умолчанию 0, чтобы не менять поведение).
- TCP: `ConnectionPool` с ключом `host:port`. Reuse keep-alive сокета в пределах 10 s, авто-reconnect при `ECONNRESET`.
- Настройка per-contact: «persistent connection» / «fire-and-forget».

**Критерий готовности.**

- Один сокет обслуживает 10 последовательных команд в течение keep-alive окна.
- Настройка retry работает и покрыта тестом с mock UDP.

### B13. Playwright E2E-тесты (P1)

**Проблема.** Юнит-тесты есть только на pure-functions. Критичные сценарии (запуск цепочки, переключение режимов, загрузка пресета) не автоматизированы.

**Решение.**

- `@playwright/test` + `electron` provider.
- Три базовых сценария:
  1. «Загрузить дефолтный preset → добавить кнопку → добавить UDP-команду на `127.0.0.1:7000` → нажать → получить success-toast» (с локальным test-udp-сервером).
  2. «Cmd+E переключает режим; цифра `1` в use-mode запускает первую кнопку».
  3. «Открыть preset v1 (фикстура) → миграции успешны → сохранить → перечитать».
- CI: запуск E2E на macOS runner (optional).

**Критерий готовности.**

- 3 сценария проходят локально и в CI.

### B14. Atomic-write + backup для last-used preset (P1)

**Проблема.** `saveLastUsedPresetPath` пишет JSON напрямую. Крах в момент записи = пустой / битый файл = пустое состояние при следующем запуске.

**Решение.**

- Писать в `last-used-preset.json.tmp`, `fsync`, `rename` (atomic).
- Держать последнюю удачную версию как `last-used-preset.prev.json`.
- При невалидном текущем → fallback на prev + toast.

**Критерий готовности.**

- kill -9 во время записи не оставляет битый state.
- Восстановление из prev задокументировано и покрыто тестом.

### B15. A11y и onboarding focus trap (P1)

**Проблема.** Onboarding-оверлей не ловит фокус: Tab уходит на элементы под ним. Табы редактора (`editor-tab`) — `<button>`, но без `role="tab"` и навигации стрелками. Color-picker без HEX-поля.

**Решение.**

- Onboarding: focus trap по паттерну «Tab циклится по кнопкам внутри диалога», `autofocus` на «Got it», Esc закрывает.
- Tabs: `role="tablist"`, `role="tab"`, `aria-selected`, стрелки ←/→ переключают.
- Editor: рядом с color-picker — текстовое поле `#RRGGBB` с валидацией.
- Проверить контраст текста на фон-картинках при `iconDarken=0` (должен предупреждать).

**Критерий готовности.**

- axe-core или Lighthouse a11y = 0 серьёзных нарушений на главных экранах.
- Ручной прогон VoiceOver по вкладкам редактора проходит.

### B16. i18n + минимальный набор языков (P1)

**Проблема.** UI только на английском, хотя пользователь RU/UA. Вся строка UI — литералы в коде и HTML.

**Решение.**

- Вынести строки в `src/shared/i18n/en.json`, `ru.json`, `uk.json`.
- Лёгкая обёртка `t(key, params?)` (свои 20 строк кода, без i18next).
- Язык: по `app.getLocale()` + переключатель в настройках.
- В логи писать оригинальные (английские) версии.

**Критерий готовности.**

- Всё UI доступно на 3 языках.
- Нет «hardcoded» строк в renderer / index.html.

### B17. Подтверждение удаления + dirty-indicator + версия в UI (P1)

**Проблема.** «Delete button» срабатывает без подтверждения — опасно для кнопки с 10 командами. Пользователь не видит unsaved-индикатор (frameless-заголовок). Нет visible version.

**Решение.**

- Перед удалением кнопки — confirm-диалог (native `dialog.showMessageBox`) или inline-подтверждение с 3-секундным «Undo».
- Dirty-индикатор: маленькая точка на service-кнопке close, toast «unsaved changes» при попытке закрыть с dirty.
- Version pill в углу окна, читает `app.getVersion()` + git hash (в dev).

**Критерий готовности.**

- Нельзя случайно потерять кнопку.
- При закрытии с dirty — confirm.
- Пользователь на скриншоте может видеть версию.

---

## Sprint 5 — P2 (рост продукта)

### B18. Auto-update + code signing (P2)

**Проблема.** Каждое обновление — пользователь качает DMG вручную. На свежем macOS незнакомый DMG блокируется Gatekeeper.

**Решение.**

- `electron-updater` + `latest.yml` на GitHub Releases / S3.
- Apple Developer ID cert + notarization hook в `electron-builder`.
- Для Windows — signtool + EV-сертификат (опционально).

**Критерий готовности.**

- В меню «Check for updates…» показывает статус.
- Подписанный DMG открывается без предупреждений Gatekeeper.

### B19. Undo/redo (P2)

**Проблема.** Любая правка в редакторе — без откатки. Пользователь, случайно изменивший цвет 6 кнопок, восстанавливает вручную.

**Решение.**

- Поверх store (после B9) логируем каждую `commit` как patch.
- `Cmd+Z` / `Cmd+Shift+Z` → применение inverse-патчей.
- Ограничение истории (50 шагов), очистка при save.

**Критерий готовности.**

- Стандартное поведение Cmd+Z работает во всех полях редактора и в гриде.

### B20. Multi-select и bulk-edit кнопок (P2)

**Проблема.** Настройка палитры из 20 кнопок — по одной, крайне утомительно.

**Решение.**

- Shift-click в гриде → multi-select.
- Редактор переходит в «bulk mode»: меняется цвет / радиус / font-size для всех выбранных (поле показывает «mixed» если различаются).

**Критерий готовности.**

- Можно за раз сменить background 10 кнопок.

### B21. Темы (light / dark / custom) (P2)

**Проблема.** Только dark. В светлой комнате рядом с iMac/MBP режет глаза.

**Решение.**

- CSS-переменные в `:root` + `[data-theme="light"]`.
- Настройка theme в preset или глобально.
- При авто-режиме подхватывать `prefers-color-scheme`.

**Критерий готовности.**

- Переключение темы не требует перезапуска.
- Все три режима читабельны.

### B22. Визуальный дизайн списка команд (P2)

**Проблема.** Список команд в кнопке — плоский текст. Статус последнего запуска, тип, адрес не выделены.

**Решение.**

- Каждая команда — карточка: иконка протокола, host:port (или contact name), статус последнего запуска (OK / ERR / never), timestamp.
- Drag-handle для переупорядочивания.
- Hover показывает payload превью (truncated).

**Критерий готовности.**

- Оператор с 6 командами видит, что «третья упала timeout 2s назад», не раскрывая её.

### B23. Телеметрия / feedback канал (P2)

**Проблема.** Нет никакой обратной связи от пользователей. Крах → пользователь пожимает плечами.

**Решение.**

- Опциональный opt-in «send anonymous usage stats».
- Минимальные метрики: версия, OS, кол-во кнопок, счётчики (пресет открыт / сохранён / команда выполнена), ошибки с code.
- В меню Help — «Send feedback» (mailto или форма).

**Критерий готовности.**

- Opt-in по умолчанию выключен.
- Пользователь видит, что именно уходит.

---

## Порядок исполнения

**Sprint 3 (P0, ~неделя):** B1 → B7 → B5 → B2 → B3 → B4 → B6.

Логика: сначала минимальные правки, которые «разблокируют релиз» (B1 — 5 минут, B7 — полчаса, B5 — час). Потом безопасность (B2/B3 связаны). Потом crash-handling (B4). ESLint/CI (B6) — в конце, чтобы не блокировать первые 6 PR.

**Sprint 4 (P1, ~2 недели):** B8 → B9 → B10 → B11 → B14 → B12 → B15 → B13 → B17 → B16.

Логика: модуляризация (B8) и store (B9) — фундамент для всех остальных. Потом сетевая часть (B10-B12), потом UX-гигиена (B14, B15, B17), потом i18n (B16) — после того, как все строки «осели».

**Sprint 5 (P2):** по мере появления спроса.

---

## Что было сделано до этого

См. `docs/IMPROVEMENT-PLAN.md`:

- **Sprint 1 (P0, 6 задач):** A1 — убрали дубликаты main/preload, A4 — добавили версионирование пресетов, A2 — декомпозировали renderer в HTML/CSS/JS, D1 — визуальная иерархия редактора, D2 — mini-preview кнопки, D4 — feedback после запуска.
- **Sprint 2 (P1, 9 задач):** A7 — логи, A8 — vitest + 33 теста, A5 — IPC-валидация, A6 — таймауты и SendError, D6 — индикация режима, D3 — читаемость поверх иконки + labelVisibility, D5 — горячие клавиши, D7 — tooltips + onboarding, A3 — минимальный store.

Текущий документ (`IMPROVEMENT-PLAN-V2.md`) — план Sprint 3+.
