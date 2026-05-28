## Запуск проекта

### Сервер

1. Создайте локальный файл окружения:

```bash
copy server\.env.example server\.env
```

2. Заполните в `server/.env` данные PostgreSQL и `SECRET_KEY`.

3. Запустите сервер:

```bash
cd server
npm run dev
```

По умолчанию сервер стартует на `http://localhost:5000`.

### Клиент

При необходимости создайте `client/.env`:

```bash
copy client\.env.example client\.env
```

Запуск клиента:

```bash
cd client
npm start
```
