# corede Systems

Модульная система для управления своими проектами и серверами. Первый модуль — **мониторинг**:
сайты, API, порты и cron-задачи под наблюдением, статистика доступности, инциденты и уведомления,
чтобы о падении вы узнавали раньше клиента.

- **Backend:** Python 3.14, FastAPI (async), SQLAlchemy 2 (async), Alembic. SQLite для разработки, PostgreSQL в продакшене.
- **Frontend:** Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS 4, Radix UI, lucide, SWR.
- **iOS-виджет:** скрипт для Scriptable генерируется прямо в панели.

## Возможности

**Система**
- Аккаунты с одобрением: заявка на доступ → администратор одобряет в «Администрировании». Первый зарегистрированный пользователь автоматически становится администратором.
- Пространства (workspaces) — изолированные наборы данных; основа под будущий SaaS. Переключатель в сайдбаре.
- Проекты и теги — общие сущности для всех модулей: сортировка по клиентам, окружениям, хостингам.
- API-токены (`cds_…`, только чтение или запись), сессии с отзывом, смена пароля.
- Палитра команд `Ctrl/⌘ + K`, светлая и тёмная темы.

**Мониторинг**
- Типы: **HTTP(S)** (коды ответа, ключевое слово «есть / нет на странице», заголовки, метод), **TCP-порт**, **Heartbeat/push** (сервер или cron сам стучится по URL — для бэкапов и серверов за NAT).
- Защита от ложных тревог: монитор падает только после N ошибок подряд, повторная проверка через 15 с.
- Инцидент начинается с *первой* неудачной проверки — видно точно, сколько сайт лежит.
- SSL: срок сертификата, предупреждения за 14/7/3/1 день.
- Статистика: uptime за 24 ч / 7 / 30 / 90 дней, график отклика, полоса доступности за 90 дней, журнал проверок.
- Список: поиск, фильтры по статусу, проекту и тегам, группировка (проект / тег / статус), сортировка, массовые действия (пауза, проверка, перенос в проект, теги, удаление), добавление **списком** — вставили 20 адресов, получили 20 мониторов.
- Уведомления: **Telegram**, Discord, Slack, произвольный webhook (JSON). События: упал, восстановился (с длительностью простоя), истекает SSL.

## Быстрый старт (разработка)

Нужны Python 3.14 и Node.js 20.9+ с pnpm.

```bash
# backend — http://127.0.0.1:8000, документация API: /api/docs
cd backend
python -m venv .venv
.venv/Scripts/activate            # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --reload-dir app
```

```bash
# frontend — http://localhost:3000 (проксирует /api на backend)
cd frontend
pnpm install
pnpm dev
```

Откройте http://localhost:3000 → «Запросить доступ». Первый аккаунт сразу становится администратором,
остальные ждут одобрения. База SQLite создаётся в `backend/data/`, миграции применяются при старте.

## Тест на телефоне и iOS-виджета локально

Телефону нужен адрес, по которому он достучится до ПК. Бэкенд трогать не надо — телефон ходит только во фронтенд (порт 3000), а тот проксирует `/api`.

**Вариант А — туннель (проще всего, работает и по мобильному интернету, HTTPS):**

```bash
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3000     # выдаст https://<случайное-имя>.trycloudflare.com
```

**Вариант Б — та же Wi-Fi-сеть:** откройте `http://<IP-компьютера>:3000` (IP — `ipconfig`). Если не открывается,
Windows блокирует входящие: в PowerShell от администратора пометьте домашнюю сеть как частную и разрешите порт:

```powershell
Set-NetConnectionProfile -InterfaceAlias Ethernet -NetworkCategory Private
New-NetFirewallRule -DisplayName "corede dev 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

(убрать правило: `Remove-NetFirewallRule -DisplayName "corede dev 3000"`)

Dev-сервер Next уже разрешает такие адреса (`allowedDevOrigins` в `frontend/next.config.ts`).

**Виджет:** откройте панель *на телефоне* по этому адресу → Настройки → Виджет iOS → «Создать» → «Скопировать»
→ Scriptable → «+» → вставить → добавить виджет Scriptable на экран. Адрес сервера в скрипт подставится сам.
Чтобы нажатие на виджет открывало панель, а не `localhost`, задайте `CDS_PUBLIC_URL=<тот же адрес>` в `backend/.env`
и перезапустите бэкенд. При первом запросе по локальной сети iOS спросит разрешение «Локальная сеть» — разрешите.

## Продакшен (Docker)

Перед запуском: A/AAAA-запись домена указывает на сервер, порты 80 и 443 открыты и свободны.

```bash
cp .env.example .env              # задайте CDS_DOMAIN и POSTGRES_PASSWORD (openssl rand -hex 24)
docker compose up -d --build
```

Поднимутся Caddy, PostgreSQL, API (с планировщиком проверок) и панель. Caddy сам выпускает и продлевает
сертификат Let's Encrypt для `CDS_DOMAIN` (хранится в томе `caddy_data`), HTTP перенаправляется на HTTPS.
Панель и API наружу не публикуются — только через Caddy. `CDS_PUBLIC_URL` по умолчанию `https://<CDS_DOMAIN>`.

Сразу после запуска зарегистрируйтесь — первый аккаунт становится администратором. Либо создайте его заранее:
`docker compose exec backend python -m app.cli create-admin you@mail.com Имя`.

Логи: `docker compose logs -f caddy backend`. Бэкап БД:
`docker compose exec -T db pg_dump -U corede corede | gzip > corede-$(date +%F).sql.gz`.

## Уведомления в Telegram

1. Создайте бота у [@BotFather](https://t.me/BotFather), скопируйте токен.
2. Напишите боту `/start`, узнайте свой chat id (например, у @userinfobot). Для группы — добавьте бота и используйте id вида `-100…`.
3. Настройки → Уведомления → Добавить канал → Telegram → «Тест».

Прокси для уведомлений берётся из `HTTP(S)_PROXY`, если он задан в окружении. Сами проверки мониторинга
идут напрямую (`CDS_PROBE_USE_ENV_PROXY=false`), чтобы отражать реальную доступность.

## Heartbeat / push-мониторы

Для задач, которые сами сообщают о себе (бэкап, очередь, сервер без внешнего IP):

```bash
# crontab: бэкап каждую ночь, сигнал только при успехе
0 3 * * *  /opt/backup.sh && curl -fsS -m 10 "https://status.example.com/api/push/<токен>"
```

Параметры: `status=down` (сообщить о сбое), `msg=…` (текст), `ping=120` (длительность, мс). Если сигнала
нет дольше интервала + допуска — монитор падает и приходит уведомление. Готовые сниппеты — на странице монитора.

## Виджет на iPhone (Scriptable)

Настройки → **Виджет iOS** → «Создать» токен → скопировать скрипт → вставить в [Scriptable](https://apps.apple.com/app/scriptable/id1405459188).
Поддерживаются малый, средний и большой виджеты, а также виджеты экрана блокировки. Упавшие мониторы
показываются первыми, при отсутствии сети виджет показывает последние данные. Параметр виджета
`project:Название` или `tag:prod` фильтрует мониторы. Шаблон скрипта: [integrations/scriptable/corede-widget.js](integrations/scriptable/corede-widget.js).

## API

Вся панель работает поверх REST API — им же можно пользоваться из скриптов:

```bash
curl -H "Authorization: Bearer cds_…" https://status.example.com/api/widget              # сводка
curl -H "Authorization: Bearer cds_…" https://status.example.com/api/w/<пространство>/monitors
```

Схема: `/api/docs`. Токены создаются в Настройки → API-токены (права «чтение» или «чтение и запись»).

## Архитектура

```
backend/app/
  core/            конфиг, БД (UTC-время, UUIDv7), безопасность (scrypt), зависимости авторизации
  accounts/        пользователи, сессии, вход/регистрация, админка
  workspaces/      пространства, проекты, теги, API-токены
  notifications/   каналы и отправка событий (любой модуль вызывает dispatch)
  modules/
    __init__.py    реестр модулей
    monitoring/    модели, пробы, планировщик + машина состояний, статистика, роутер
  main.py          сборка приложения из ядра и модулей
  worker.py        отдельный процесс планировщика (для нескольких воркеров API)
  cli.py           migrate / create-admin / approve
migrations/        Alembic

frontend/src/
  app/             маршруты: (auth)/login, register; (app)/[workspace]/…, account, admin
  components/      ui-примитивы (все контролы одной высоты), оболочка, палитра команд
  core/            страницы ядра: обзор, проекты, настройки, аккаунт, админка
  modules/
    registry.ts    навигация модулей
    monitoring/    страницы и компоненты мониторинга (графики — чистый SVG)
  lib/             API-клиент, хуки, форматирование, генератор Scriptable-скрипта
```

### Как добавить модуль

1. **Backend:** создайте `app/modules/<имя>/` с моделями, роутером и объектом `module = Module(...)` в `__init__.py`; добавьте его в `load_modules()` в [app/modules/__init__.py](backend/app/modules/__init__.py). Роутер пространства монтируется под `/api/w/{ws}/…`, фоновые задачи — через `worker_start` / `worker_stop`.
2. Импортируйте модели в [app/models.py](backend/app/models.py) и сгенерируйте миграцию: `alembic revision --autogenerate -m "<имя>"`.
3. **Frontend:** добавьте запись в [src/modules/registry.ts](frontend/src/modules/registry.ts) (появится в сайдбаре и палитре) и страницы в `src/app/(app)/[workspace]/<маршрут>/page.tsx`, обёрнутые в `<AppPage>`.
4. Привязывайте сущности к общим `Project` и `Tag` — сортировка и фильтры будут едиными.

## Конфигурация backend

Переменные окружения с префиксом `CDS_` (или `backend/.env`, пример — [backend/.env.example](backend/.env.example)):

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `CDS_DATABASE_URL` | SQLite в `backend/data/` | `postgresql+asyncpg://…` в продакшене |
| `CDS_PUBLIC_URL` | `http://localhost:3000` | ссылки в уведомлениях |
| `CDS_COOKIE_SECURE` | `false` | `true` за HTTPS |
| `CDS_ALLOW_REGISTRATION` | `true` | принимать заявки на доступ |
| `CDS_RUN_SCHEDULER` | `true` | планировщик в процессе API |
| `CDS_SCHEDULER_CONCURRENCY` | `50` | параллельных проверок |
| `CDS_CHECKS_RETENTION_DAYS` | `14` | хранение сырых проверок (почасовая статистика — бессрочно) |
| `CDS_PROBE_USE_ENV_PROXY` | `false` | пускать проверки через системный прокси |

Утилиты: `python -m app.cli create-admin you@mail.com Имя` (создать/повысить админа),
`python -m app.cli approve user@mail.com`, `python -m app.cli migrate`.
