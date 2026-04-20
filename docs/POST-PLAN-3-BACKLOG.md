# QuickButton — Post-Plan-3 Backlog

Цель этого backlog: зафиксировать следующие итерации после закрытия Plan-3, чтобы продолжать развитие без потери качества и фокуса.

---

## Правила приоритизации

- **P0** — блокирует доверие/дистрибуцию или несёт высокий риск для пользователей.
- **P1** — заметно улучшает продукт и стабильность, но не блокирует выпуск.
- **P2** — улучшения удобства, производительности и масштаба.

---

## P0 (сделать в первую очередь)

### 1) B2 Final: реальный notarized mac release

**Зачем:** закрыть последний критичный пункт доверия к релизам.

**Задачи:**
- Заполнить реальные `CSC_*` и `APPLE_*` secrets в GitHub.
- Сделать tag release и прогнать `.github/workflows/release.yml`.
- Подтвердить в логах CI этапы signing + notarization + staple.
- Проверить на «чистой» macOS (`spctl`, `codesign`, `stapler`, запуск app).

**Критерий готовности:**
- Gatekeeper открывает DMG/App без обходных сценариев.
- Артефакты и update metadata опубликованы и валидны.

### 2) B3 Bootstrap: стратегия подписи Windows

**Зачем:** снизить SmartScreen friction и подготовить production-дистрибуцию для Windows.

**Задачи:**
- Выбрать подход (EV cert / cloud signing).
- Описать CI шаги и secret-модель.
- Прогнать пилотный signed build.

**Критерий готовности:**
- Документирован и воспроизводим signed Windows pipeline.

---

## P1 (следующий слой зрелости)

### 3) State typing hardening (A3 follow-up) — completed

**Зачем:** снизить регрессии при дальнейших фичах и рефакторинге.

**Сделано:**
- Введены доменные типы renderer (`src/renderer/modules/domainTypes.ts`) для UI/preset/button/command.
- Сужены типы в критичных модулях `events`, `render`, `runner` (убраны широкие `any` в ключевых местах потока).
- Сохранена совместимость с текущим command-layer и e2e/unit тестами.

**Критерий готовности:**
- Типизация покрывает core UI-flow без широких `any` в критичных модулях.

### 4) Diagnostics bundle v2 (D3 follow-up) — completed

**Зачем:** ускорить triage сложных багов без ручного сбора контекста.

**Сделано:**
- Добавлены anonymized runtime counters в main-процессе (`runtimeTestSend`/`runtimeExecuteChain`) и включены в diagnostics bundle.
- Добавлен быстрый пункт `Help -> Copy support summary` для копирования краткого отчёта в буфер обмена.
- Экспорт diagnostics bundle расширен runtime-метриками для более быстрого triage.

**Критерий готовности:**
- Один export даёт достаточно данных для первичной диагностики.

### 5) E2 UX polish: empty states + onboarding lifecycle

**Зачем:** снизить порог входа для новых пользователей.

**Задачи:**
- Ясные empty states для сетки/команд/контактов.
- Кнопка “Reset onboarding” в Help или Settings.
- Смоук E2E для first-run чеклиста и reset flow.

**Критерий готовности:**
- Новый пользователь проходит first-run без внешних инструкций.

---

## P2 (улучшения эффективности и масштаба)

### 6) Performance budget + benchmark suite

**Зачем:** контролировать деградации при росте функциональности.

**Задачи:**
- Зафиксировать бенч-сценарии (большой preset, массовые edits, run-chain).
- Добавить пороговые метрики в CI (warning/fail threshold).

**Критерий готовности:**
- Любая деградация выше порога видна до релиза.

### 7) Import/Export utilities

**Зачем:** улучшить переносимость конфигураций между машинами и окружениями.

**Задачи:**
- Экспорт/импорт отдельных buttons/contacts.
- Conflict resolution при merge импортируемых сущностей.

**Критерий готовности:**
- Пользователь может безопасно переносить части preset между устройствами.

### 8) Extended protocol quality

**Зачем:** повысить надёжность интеграций с внешними устройствами.

**Задачи:**
- Расширить тест-матрицу TCP persistent/retry edge-cases.
- Добавить дополнительные отрицательные тесты OSC payload validation.

**Критерий готовности:**
- Покрыты самые частые production edge-cases сети/протоколов.

---

## Предлагаемый порядок итераций

1. **Sprint 1:** B2 Final.
2. **Sprint 2:** B3 Bootstrap + A3 typing hardening (частично).
3. **Sprint 3:** Diagnostics bundle v2 + E2 polish.
4. **Sprint 4+:** Performance budget + import/export + protocol quality.

---

## Definition of Done для пункта backlog

- Есть код + обновлённая документация.
- Есть тесты/смоук на критический сценарий.
- Нет новых lint/typecheck ошибок.
- Нет регрессий в `npm test` и `npm run test:e2e`.
