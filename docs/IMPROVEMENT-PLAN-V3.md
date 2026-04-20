# QuickButton — Improvement Plan V3 (профессиональный уровень)

Цель Plan-3: довести продукт и кодовую базу до уровня **production-grade desktop app** — предсказуемое состояние, безопасный релизный контур, наблюдаемость, расширяемость и UX без «магии».

Plan-2 закрыл зрелость P1 и часть P2. Plan-3 фокусируется на **архитектуре состояния**, **релизах/обновлениях**, **качестве и тестах**, **безопасности и операционке**.

---

## Принципы (неготовые компромиссы)

1. **Single source of truth** — все изменения preset/UI проходят через явный слой (команды/mutations), а не разрозненные прямые мутации.
2. **Deterministic undo/redo** — история строится на **операциях** или **JSON Patch / inverse patch**, а не на полных снимках всего дерева на каждый `input`.
3. **Release as code** — версия, подпись, notarization, `latest.yml`/feed, changelog — воспроизводимы из CI и документированы.
4. **Defense in depth** — CSP, sandbox, минимизация `innerHTML`, строгая валидация IPC, безопасные пути к файлам.
5. **Observable** — структурированные логи, корреляция main/renderer, метрики ошибок (хотя бы счётчики + экспорт).

---

## Фаза A — Архитектура состояния и undo (критично)

### A1. Ядро состояния (Command / Reducer)

**Проблема.** Сейчас модули мутируют `state` напрямую; `store.commit` существует, но не является единственным входом. Это усложняет undo, тесты и параллельные фичи.

**Решение.**

- Ввести слой `applyCommand(state, command)` (или `dispatch(action)`), где `command` — сериализуемая операция с именем и payload.
- Постепенно перевести `events`, `grid`, `editor`, `preset` на вызовы этого слоя (по одному домену за PR).
- `markDirty` / `markClean` вызываются только из reducer-обёртки или явных use-case (save/load).

**Критерий готовности.**

- Нет новых прямых мутаций `state.preset` вне reducer (ESLint rule / codemod / grep в CI).
- Все пользовательские изменения preset покрыты хотя бы одним unit-тестом на команду (минимальный набор).

### A2. Undo/redo v2 (операции, не снимки)

**Проблема.** Full `JSON.parse(JSON.stringify)` на каждый шаг не масштабируется и давит GC.

**Решение.**

- Хранить стек **inverse-операций** (или RFC 6902 JSON Patch + обратный patch).
- Группировать «шаг»: например, drag end = один шаг; bulk color change = один шаг.
- Ограничение истории (50) сохранить, но размер шага — O(изменённых узлов).

**Критерий готовности.**

- Бенчмарк: 100 быстрых изменений подряд (slider) без заметных фризов на типичном preset (например, 20 кнопок × 5 команд).
- Undo восстанавливает и preset, и `selectedButtonIds`, и табы редактора предсказуемо.

### A3. Типы домена (Preset/Button/Command/Contact)

**Решение.**

- Вынести типы в `src/shared/types` (или `src/renderer/domain`) и использовать в TS-модулях; для JS-модулей — JSDoc typedef или постепенная миграция `composer` в TS.

**Критерий готовности.**

- `any` в `events/render/editor` сокращён до точечных мест (границы IPC/legacy), не «везде».

---

## Фаза B — Релизы, подпись, автообновления (критично для доверия)

### B1. Публикация артефактов под electron-updater

**Решение.**

- Настроить `electron-builder` `publish` (GitHub Releases или S3 + публичный URL).
- Генерировать `latest.yml` / blockmap как часть CI.
- Вынести URL релизов из хардкода в **env при сборке** (`QB_RELEASES_URL`) + дефолт в README.

**Критерий готовности.**

- На чистой машине packaged build проверяет обновления и показывает корректный статус (есть / нет / ошибка сети).

### B2. macOS: Developer ID + notarization

**Решение.**

- Apple Developer Program, `notarize: true`, корректные entitlements (минимально необходимые), hardened runtime.
- Документировать локальные переменные (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, team id).

**Критерий готовности.**

- Gatekeeper: «Open» без обходных путей на свежей macOS для подписанного DMG.

### B3. Windows: подпись (по мере необходимости)

**Решение.**

- EV-сертификат или облачное подписание; интеграция в CI.

**Критерий готовности.**

- SmartScreen/репутация: снижение предупреждений для установщика.

---

## Фаза C — Качество: тесты и регрессии

### C1. Расширить E2E

**Минимальный набор.**

- Undo/redo после изменения цвета и после drag кнопки.
- Multi-select + bulk bg + сохранение preset + reload.
- «Грязное» закрытие окна (если есть confirm) — smoke.

### C2. Контрактные тесты IPC

- Таблица каналов ↔ схемы в `src/shared/ipc.cjs` + тесты на invalid payload.

### C3. Property-based / fuzz для preset schema

- Случайные объекты → `sanitizePreset` не кидает, всегда валидный выход или явная ошибка версии.

---

## Фаза D — Безопасность и устойчивость

### D1. Renderer: снизить XSS-поверхность

- Аудит `innerHTML`; где возможно — `textContent` + `createElement`.
- CSP уже есть — периодически проверять на новые `connect-src` при фичах.

### D2. Лимиты и защита от злоупотреблений

- Лимиты на размер preset, число кнопок/команд, размер payload — с понятными ошибками в UI.

### D3. Диагностика

- Корреляционный `sessionId` в логах main/renderer.
- Опционально: экспорт «diagnostics bundle» (preset metadata без секретов, версия, лог tail).

---

## Фаза E — UX профессионального инструмента

### E1. Редактор без «сюрпризов»

- Явный индикатор режима edit/use, bulk-режима, несохранённых изменений (уже частично есть — довести до консистентности).
- Клавиатурная навигация по табам (роли `tablist` / стрелки) — из Plan-2 B15, если ещё не закрыто полностью.

### E2. Онбординг и empty states

- Первый запуск: мини-чеклист (создать contact → кнопку → test send).

---

## Порядок работ (рекомендуемый)

1. **A1 → A2** (иначе undo останется хрупким и дорогим).
2. **B1** (иначе auto-update останется декоративным).
3. **B2** (mac доверие пользователей).
4. **C1–C3** параллельно с B3 по необходимости.
5. **D/E** как непрерывный слой улучшений между фазами.

---

## Определение «мы на профессиональном уровне» (exit criteria)

- Состояние: **один** вход для мутаций + **операционный** undo.
- Релиз: **подписанный** mac build + **работающий** update channel + автоматическая сборка в CI.
- Качество: E2E покрывает критические user journeys; регрессии ловятся до релиза.
- Безопасность: нет известных high-risk XSS/IPC bypass; CSP соблюдается.
- Операционка: пользователь может собрать диагностический пакет за 1 клик.

---

## Связь с Plan-2

Plan-2 дал фундамент (модули, shared, тесты, e2e scaffold). Plan-3 — это **слой зрелости продукта**: state architecture, release trust, и расширение тестовой матрицы под реальные сценарии power users.

---

## Прогресс (живое)

- **A1 (завершено):** `applyAppCommand` + `dispatch` покрывают основные пользовательские мутации `preset` в `events`, `grid`, `editor`, `connections`, `preset`, `shortcuts`, `service`, `startup`; добавлены команды `contacts.*`, `preset.replace`, `preset.set*`, `preset.toggleMode`, `service.setShowInGrid`; `dispatch(..., { render: false, skipMarkDirty: true })` для live-input/load paths; тесты `tests/appCommands.test.ts`.
- **A2 (завершено):** `history.ts` переведён с full-snapshot на operation-based стек (`forward/backward` команды + `uiBefore/uiAfter`), `dispatch` пишет дельты через `deriveCommandHistoryDelta`, добавлен grouping шагов истории (`historyGroup`) для input/slider, покрыты edge-cases (`contacts.deleteContact`, bulk-style inverse без fallback).
- **B1 (завершено):** настроен `electron-builder.publish` на GitHub Releases; добавлены publish-скрипты (`dist:mac:publish`, `dist:win:publish`), release workflow `.github/workflows/release.yml` (tag/dispatch) с публикацией артефактов и update metadata (`latest.yml`/`latest-mac.yml` + blockmaps); README дополнен про `QB_RELEASES_URL` и дефолтный feed URL.
- **B2 (в работе):** включён `build.mac.notarize = true`, release workflow проверяет наличие signing/notarization secrets (`CSC_*` + `APPLE_API_*` или `APPLE_ID`-пакет), README дополнен переменными и локальным check-командой.
- **B2 (в работе):** добавлен пошаговый runbook `docs/RELEASE-B2-CHECKLIST.md` (secrets, tag release, проверка notarize/staple, clean-machine команды `spctl`/`codesign`/`stapler`, smoke update-check).
- **C1 (завершено):** E2E расширены до 6 сценариев: undo/redo после color+drag, multi-select bulk bg + save/reload, dirty-close confirm smoke; вместе с существующими UDP/hotkeys/migration сценариями.
- **C2 (завершено):** добавлены контрактные проверки каналов IPC↔schemas и negative-тесты invalid payload в `tests/ipc.test.js`.
- **C3 (завершено):** добавлены property/fuzz тесты `sanitizePreset` в `tests/presetSchema.fuzz.test.js` (500 случайных входов, инварианты санитизированного выхода, явная ошибка `PresetVersionError` для future schema version).
- **D1 (завершено):** убраны `innerHTML`-вставки из renderer-модулей (`editor`, `connections`, `grid`/`service`) в пользу `createElement`/`textContent`/`replaceChildren`; сервис-кнопки и иконки теперь собираются через DOM API.
- **D2 (завершено):** добавлены явные защитные лимиты и ошибки: размер preset при open/save в `electron/main.cjs` (лимит 2 MiB), лимит размера командного payload (64 KiB) в main/runner, ужесточены IPC-ограничения (`runtimeExecuteChain.chain` как массив с лимитом, max-length для `buttonId/currentPath`), расширены тесты `tests/ipc.test.js`.
- **E1 (завершено):** правая панель переведена на доступный `tablist`/`tabpanel` с `aria-selected`/`aria-controls` и клавиатурной навигацией (`ArrowLeft/ArrowRight/Home/End`) в `events.ts`.
- **E2 (завершено):** onboarding дополнен first-run чеклистом (`contact → button → test send`) с прогрессом и автопометкой шагов из реальных действий пользователя (`onboarding.ts`, `events/grid/connections/editor/runner`).
- **D3 (завершено):** добавлен корреляционный `sessionId` в `app:getInfo` и лог-префиксы (`logger.cjs`), renderer-ошибки передают `sessionId` в `diagnostics:reportError`, а в меню Help добавлен one-click экспорт `diagnostics bundle` (app/platform info, preset summary без payload/секретов, tail логов).
- **Следующий шаг:** возврат к **B2** release-прогону с реальными Apple secrets; детализированный backlog после Plan-3 зафиксирован в `docs/POST-PLAN-3-BACKLOG.md`.
