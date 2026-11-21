
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = Number(process.env.PORT || 8787);
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

const CHAOS_SYSTEM = `
Ты — CHAOS AI, персональный искусственный интеллект.

ТВОЯ ЛИЧНОСТЬ:
Я CHAOS AI — персональный искусственный интеллект, созданный своим разработчиком.
Мой разработчик — гений, миллиардер, плейбой, филантроп.
Мой характер — дружелюбный, умный, немного дерзкий.
Я общаюсь естественно, помогаю с задачами и стараюсь проверять свои ответы.

ПРАВИЛА:
1. Отвечай на языке пользователя. Обычно это русский.
2. Общайся естественно, не используй канцелярит.
3. Будь дружелюбным, уверенным и немного дерзким, но не грубым.
4. Не выдумывай факты о себе, разработчике и окружающем мире.
5. Если не знаешь ответ — честно скажи об этом.
6. В математике внимательно проверяй вычисления и порядок действий.
7. Для сложных задач показывай понятные шаги решения.
8. Не говори, что ты подключён к интернету, если это не подтверждено.
9. Не повторяй приветствие в каждом сообщении.
10. Не называй себя ChatGPT, если пользователь спрашивает, кто ты.
11. Отвечай понятно и по существу. Не растягивай простые ответы.
12. Используй Markdown для заголовков, списков и выделения текста.
`;

app.use(cors({
  origin: [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:4173',
    'http://localhost:4173',
    'http://192.168.0.103:5173'
  ]
}));

app.use(express.json({ limit: '2mb' }));

app.get('/api/health', async (_req, res) => {
  let ollama = false;
  let models = [];

  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(2500)
    });

    if (r.ok) {
      ollama = true;
      const data = await r.json();
      models = (data.models || []).map(m => m.name);
    }
  } catch {}

  res.json({
    ok: true,
    ollama,
    models,
    selectedModel: MODEL
  });
});

app.post('/api/chat', async (req, res) => {
  const { messages, system, model } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Сообщение пустое.' });
  }

  if (messages.length > 80) {
    return res.status(400).json({
      error: 'Слишком длинная история. Начни новый чат.'
    });
  }

  const clean = messages.map(m => ({
    role: ['user', 'assistant'].includes(m.role) ? m.role : 'user',
    content: String(m.content || '').slice(0, 12000)
  }));

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: typeof model === 'string' &&
          /^[a-zA-Z0-9._:-]{1,80}$/.test(model)
          ? model
          : MODEL,
        messages: [
          {
            role: 'system',
            content: `${CHAOS_SYSTEM}\n\nДополнительные инструкции режима:\n${String(system || '')}`
          },
          ...clean
        ],
        stream: false,
        options: {
          temperature: 0.7
        }
      }),
      signal: AbortSignal.timeout(120000)
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 400);
      return res.status(502).json({
        error: `Ошибка Ollama (${response.status}): ${detail}`
      });
    }

    const data = await response.json();
    const content = data?.message?.content;

    if (typeof content !== 'string' || !content.trim()) {
      return res.status(502).json({
        error: 'Модель вернула пустой ответ. Попробуй ещё раз.'
      });
    }

    res.json({
      content,
      model: data.model || model || MODEL,
      done: true
    });

  } catch (error) {
    const message =
      error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? 'Модель отвечает слишком долго. Попробуй короткий запрос.'
        : 'Не удалось связаться с Ollama. Проверь, запущена ли она.';

    res.status(503).json({ error: message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CHAOS AI backend: http://192.168.0.103:${PORT}`);
});
