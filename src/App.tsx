import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowRight, Atom, Check, ChevronDown, CircleHelp, Compass, Copy,
  Download, ExternalLink, Gamepad2, Image as ImageIcon, MessageSquare, MoreHorizontal,
  Package, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Settings, Shield,
  Trash2, WandSparkles, X, Zap, Heart, Coins
} from 'lucide-react';
import type { Chat, Message, RPState } from './types';

const CHAT_KEY = 'chaos-ai-v02-chats';
const RP_KEY = 'chaos-ai-v02-rp';
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const welcome: Message = { id: 'welcome', role: 'assistant', content: 'Я CHAOS AI. Могу помочь с идеями, кодом, вопросами или отправить тебя в интерактивную историю.\\n\\nПодключи локальную модель Ollama — и мы начнём по-настоящему.' };
const starterChat = (): Chat => ({ id: makeId(), title: 'Новый разговор', mode: 'chat', messages: [welcome], updatedAt: Date.now() });
const initialRP: RPState = { inventory: ['Старый фонарь', 'Потрёпанная карта'], location: 'Заброшенная станция', health: 100, gold: 12 };
const getChats = (): Chat[] => {
  try { const value = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]'); return Array.isArray(value) && value.length ? value : [starterChat()]; }
  catch { return [starterChat()]; }
};
const getRP = (): RPState => { try { return { ...initialRP, ...JSON.parse(localStorage.getItem(RP_KEY) || '{}') }; } catch { return initialRP; } };
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function MarkdownText({ text }: { text: string }) {
  const html = useMemo(() => escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>'), [text]);
  return <div className="message-text" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function App() {
  const [chats, setChats] = useState<Chat[]>(getChats);
  const [activeId, setActiveId] = useState(() => getChats()[0]?.id || '');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [view, setView] = useState<'chat' | 'roleplay' | 'settings'>('chat');
  const [rp] = useState<RPState>(getRP);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [model, setModel] = useState(localStorage.getItem('chaos-ai-model') || 'qwen2.5:3b');
  const [health, setHealth] = useState<{ollama:boolean;models:string[]}|null>(null);
  const [toast, setToast] = useState('');
  const [settingsTab, setSettingsTab] = useState('Общие');
  const [showScroll, setShowScroll] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeChat = chats.find(c => c.id === activeId) || chats[0];

  useEffect(() => { localStorage.setItem(CHAT_KEY, JSON.stringify(chats)); }, [chats]);
  useEffect(() => { localStorage.setItem(RP_KEY, JSON.stringify(rp)); }, [rp]);
  useEffect(() => { localStorage.setItem('chaos-ai-model', model); }, [model]);
  useEffect(() => {
    let alive = true;
    const check = async () => { try { const r = await fetch('http://127.0.0.1:8787/api/health'); const d = await r.json(); if (alive) setHealth(d); } catch { if (alive) setHealth({ollama:false,models:[]}); } };
    check(); const timer = window.setInterval(check, 12000); return () => { alive = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => { if (feedRef.current) { feedRef.current.scrollTop = feedRef.current.scrollHeight; setShowScroll(false); } }, [activeId, activeChat?.messages.length, busy, view]);
  useEffect(() => { const el = feedRef.current; if (!el) return; const onScroll = () => setShowScroll(el.scrollHeight - el.scrollTop - el.clientHeight > 250); el.addEventListener('scroll', onScroll); return () => el.removeEventListener('scroll', onScroll); }, [view, activeId]);
  useEffect(() => { if (toast) { const t = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(t); } }, [toast]);

  const updateChat = (id: string, update: (chat: Chat) => Chat) => setChats(prev => prev.map(c => c.id === id ? update(c) : c));
  const createChat = (mode: 'chat'|'roleplay' = 'chat') => {
    const c: Chat = { id: makeId(), title: mode === 'roleplay' ? 'Новая история' : 'Новый разговор', mode, messages: mode === 'chat' ? [welcome] : [{ id: makeId(), role: 'assistant', content: 'Ночь. Дождь стучит по ржавой крыше заброшенной станции. Вдалеке вспыхивает фиолетовый свет.\\n\\nТы находишь старый фонарь и карту. За дверью слышны шаги. Что будешь делать?', image: `https://image.pollinations.ai/prompt/${encodeURIComponent('cinematic dark abandoned train station at night rain purple cosmic glow atmospheric game concept art no text')}`, actions: ['Осмотреть станцию', 'Проверить инвентарь', 'Открыть дверь'] }], updatedAt: Date.now() };
    setChats(prev => [c, ...prev]); setActiveId(c.id); setView(mode); setInput('');
  };
  const deleteChat = (id: string) => {
    const remaining = chats.filter(c => c.id !== id);
    if (!remaining.length) { const fresh = starterChat(); setChats([fresh]); setActiveId(fresh.id); }
    else { setChats(remaining); if (id === activeId) setActiveId(remaining[0].id); }
    setToast('Чат удалён');
  };
  const send = async (forced?: string) => {
    const content = (forced ?? input).trim();
    if (!content || busy || !activeChat) return;
    const isRP = view === 'roleplay' || activeChat.mode === 'roleplay';
    const userMessage: Message = { id: makeId(), role: 'user', content };
    const previous = activeChat.messages.filter(m => m.id !== 'welcome').map(m => ({ role: m.role, content: m.content }));
    const updatedMessages = [...activeChat.messages, userMessage];
    updateChat(activeChat.id, c => ({ ...c, title: c.messages.length <= 1 ? content.slice(0, 34) : c.title, messages: updatedMessages, updatedAt: Date.now() }));
    setInput(''); setBusy(true);
    try {
      const system = isRP
        ? `Ты — ведущий интерактивной ролевой игры. Отвечай по-русски, описывай атмосферные сцены, последствия действий и предлагай 2-3 выбора в конце. Ты можешь включать в ответ отдельной строкой IMAGE_PROMPT: краткий английский промпт для иллюстрации сцены. Не меняй состояние инвентаря самовольно. Текущее состояние: локация ${rp.location}; здоровье ${rp.health}/100; золото ${rp.gold}; инвентарь: ${rp.inventory.join(', ')}.`
        : 'Ты — CHAOS AI, умный и дружелюбный помощник. Отвечай на русском, если пользователь пишет по-русски. Будь полезным и честным.';
      const r = await fetch('http://127.0.0.1:8787/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, system, messages: [...previous, { role: 'user', content }] })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Не удалось получить ответ');
      let reply = String(data.content || '');
      let image: string | undefined;
      const match = reply.match(/IMAGE_PROMPT:\s*(.+)/i);
      if (match && isRP) { image = `https://image.pollinations.ai/prompt/${encodeURIComponent(match[1].trim())}?width=1024&height=640&nologo=true`; reply = reply.replace(match[0], '').trim(); }
      const actions = isRP ? (reply.match(/(?:^|\n)(?:[-•]\s*)?(?:\d+[.)]\s*)?(.{3,60}\?)\s*(?=\n|$)/g) || []).slice(-3).map(s => s.replace(/^[\n\-•\s\d.)]+/, '').trim()) : [];
      const aiMessage: Message = { id: makeId(), role: 'assistant', content: reply, ...(image ? { image } : {}), ...(actions.length ? { actions } : {}) };
      updateChat(activeChat.id, c => ({ ...c, messages: [...c.messages, aiMessage], updatedAt: Date.now() }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Неизвестная ошибка';
      updateChat(activeChat.id, c => ({ ...c, messages: [...c.messages, { id: makeId(), role: 'assistant', content: `⚠ ${msg}` }], updatedAt: Date.now() }));
    } finally { setBusy(false); }
  };
  const useAction = (action: string) => {
    if (action.toLowerCase().includes('инвентар')) { setInventoryOpen(true); return; }
    void send(action);
  };
  const copyMessage = async (text: string) => { try { await navigator.clipboard.writeText(text); setToast('Скопировано'); } catch { setToast('Не удалось скопировать'); } };
  const exportChats = () => { const blob = new Blob([JSON.stringify({ chats, rp }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'chaos-ai-backup.json'; a.click(); URL.revokeObjectURL(url); setToast('Резервная копия сохранена'); };
  const status = health?.ollama ? 'МОДЕЛЬ ГОТОВА' : 'НЕТ СОЕДИНЕНИЯ';
  const visibleChats = chats.filter(c => c.mode === (view === 'roleplay' ? 'roleplay' : 'chat'));

  return <div className={`app-shell ${busy ? 'is-thinking' : ''} ${view === 'roleplay' ? 'roleplay-view' : ''}`}>
    <div className="cosmic-noise" aria-hidden="true" />
    <aside className={`sidebar ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <div className="brand-row"><button className="icon-button" onClick={() => setSidebarOpen(!sidebarOpen)} title="Свернуть панель">{sidebarOpen ? <PanelLeftClose/> : <PanelLeftOpen/>}</button>{sidebarOpen && <div className="brand"><span className="brand-mark"><Atom size={19}/></span><span>CHAOS<span className="brand-ai"> AI</span><small>ENTER THE UNKNOWN</small></span></div>}</div>
      {sidebarOpen && <>
        <button className="new-chat" onClick={() => createChat('chat')}><Plus size={17}/> <span>Новый чат</span><kbd>Ctrl K</kbd></button>
        <div className="nav-label">ПРОСТРАНСТВО</div>
        <button className={`nav-item ${view === 'chat' ? 'selected' : ''}`} onClick={() => { setView('chat'); if (activeChat?.mode !== 'chat') { const c = chats.find(x => x.mode === 'chat'); if (c) setActiveId(c.id); } }}><MessageSquare size={17}/><span>Общение</span></button>
        <button className={`nav-item ${view === 'roleplay' ? 'selected' : ''}`} onClick={() => { const c = chats.find(x => x.mode === 'roleplay'); if (c) setActiveId(c.id); else createChat('roleplay'); setView('roleplay'); }}><Gamepad2 size={17}/><span>Ролевые игры</span><span className="nav-tag">BETA</span></button>
        <div className="sidebar-section"><div className="nav-label">{view === 'roleplay' ? 'ИСТОРИИ' : 'ИСТОРИЯ ЧАТОВ'} <span>{visibleChats.length}</span></div>
          <div className="chat-list">{visibleChats.map(c => <div key={c.id} className={`chat-list-item ${c.id === activeId ? 'active' : ''}`}><button onClick={() => setActiveId(c.id)} title={c.title}><span className="chat-dot"/><span className="chat-title">{c.title}</span></button><button className="delete-chat" title="Удалить чат" onClick={() => deleteChat(c.id)}><Trash2 size={13}/></button></div>)}</div>
        </div>
        <div className="sidebar-bottom"><div className="model-pill"><span className={`status-dot ${health?.ollama ? 'online' : ''}`}/><span>{status}</span><button onClick={() => setView('settings')} title="Настройки модели"><Settings size={14}/></button></div><div className="profile-row"><div className="avatar">C</div><div className="profile-info"><b>Оператор</b><small>ЛОКАЛЬНЫЙ РЕЖИМ</small></div><button className="icon-button small" onClick={() => setView('settings')}><MoreHorizontal size={17}/></button></div></div>
      </>}
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left">{!sidebarOpen && <button className="icon-button" onClick={() => setSidebarOpen(true)}><PanelLeftOpen size={18}/></button>}<div className="crumb">{view === 'settings' ? 'Настройки' : view === 'roleplay' ? 'Ролевые игры' : 'Чат'}<ChevronDown size={14}/></div><span className="top-separator">/</span><span className="muted">{view === 'settings' ? settingsTab : activeChat?.title || 'Новый разговор'}</span></div>
        <div className="topbar-right"><span className={`status-label ${health?.ollama ? 'connected' : ''}`}><span className="status-dot"/> {health?.ollama ? 'LOCAL ENGINE ONLINE' : 'LOCAL ENGINE OFFLINE'}</span><button className="icon-button" onClick={() => setView('settings')} title="Настройки"><Settings size={17}/></button></div>
      </header>

      {view === 'settings' ? <section className="settings-layout"><aside className="settings-menu"><div className="settings-heading">ПРЕДПОЧТЕНИЯ</div>{['Общие','Модель ИИ','Ролевые игры','Данные и приватность','О CHAOS AI'].map((s,i) => <button key={s} className={`settings-nav ${settingsTab === s ? 'active' : ''}`} onClick={() => { setSettingsTab(s); if (s === 'Ролевые игры') { let c = chats.find(x => x.mode === 'roleplay'); if (!c) { createChat('roleplay'); } else { setActiveId(c.id); setView('roleplay'); } } }}><span>{[<Settings size={16}/>,<Atom size={16}/>,<Gamepad2 size={16}/>,<Shield size={16}/>,<CircleHelp size={16}/>][i]}</span>{s}</button>)}</aside>
        <div className="settings-content"><div className="eyebrow">CONFIGURATION / {settingsTab.toUpperCase()}</div><h1>{settingsTab}</h1>
          {settingsTab === 'Общие' && <><p className="settings-lead">Настрой CHAOS AI под себя. Все локальные настройки хранятся в этом браузере.</p><div className="setting-card"><div><b>Космические эффекты</b><p>Мягкое свечение и вспышки при генерации.</p></div><span className="toggle on"><span/></span></div><div className="setting-card"><div><b>Сохранять историю</b><p>Чаты остаются на этом устройстве.</p></div><span className="toggle on"><span/></span></div><div className="setting-card"><div><b>Уменьшить анимации</b><p>Учитывается системная настройка уменьшения движения.</p></div><span className="setting-chip">Автоматически</span></div></>}
          {settingsTab === 'Модель ИИ' && <><p className="settings-lead">CHAOS AI использует Ollama — локальный движок без API-ключей.</p><div className="setting-card column"><label htmlFor="model">Название модели Ollama</label><input id="model" className="field" value={model} onChange={e => setModel(e.target.value)} placeholder="qwen2.5:3b"/><small>Модель должна быть предварительно скачана через Ollama.</small><button className="primary-button" onClick={async () => { try { const r = await fetch('http://127.0.0.1:8787/api/health'); const d = await r.json(); setHealth(d); setToast(d.ollama ? `Ollama найдена: ${d.models.join(', ') || 'модели не найдены'}` : 'Ollama не запущена'); } catch { setToast('Сервер CHAOS AI не запущен'); } }}><RefreshCw size={15}/> Проверить подключение</button></div><div className="setting-card"><div><b>Состояние движка</b><p>{health?.ollama ? `Ollama доступна. Модели: ${health.models.join(', ') || 'не обнаружены'}` : 'Оффлайн. Установи Ollama, затем запусти локальный сервер CHAOS AI.'}</p></div><span className={`setting-chip ${health?.ollama ? 'good' : 'bad'}`}>{health?.ollama ? 'ONLINE' : 'OFFLINE'}</span></div><a className="external-link" href="https://ollama.com/download/windows" target="_blank" rel="noreferrer"><ExternalLink size={15}/> Скачать Ollama</a></>}
          {settingsTab === 'Ролевые игры' && <><p className="settings-lead">Создавай истории, выбирай действия и собирай предметы. Изображения сцен используют внешний бесплатный сервис и требуют интернет.</p><button className="primary-button" onClick={() => createChat('roleplay')}><Gamepad2 size={16}/> Начать новую историю</button><div className="setting-card"><div><b>Инвентарь и прогресс</b><p>Хранятся локально в браузере.</p></div><Package size={19}/></div></>}
          {settingsTab === 'Данные и приватность' && <><p className="settings-lead">История хранится локально в браузере. При очистке данных сайта она может исчезнуть.</p><button className="primary-button" onClick={exportChats}><Download size={16}/> Экспортировать резервную копию</button><button className="danger-button" onClick={() => { if (confirm('Удалить все локальные чаты? Сначала сделай резервную копию.')) { localStorage.removeItem(CHAT_KEY); const fresh = starterChat(); setChats([fresh]); setActiveId(fresh.id); setToast('История очищена'); } }}><Trash2 size={15}/> Удалить историю чатов</button></>}
          {settingsTab === 'О CHAOS AI' && <><p className="settings-lead">CHAOS AI v0.2 — экспериментальный локальный чат с космическим интерфейсом.</p><div className="setting-card"><div><b>Версия</b><p>0.2.0 · Preview build</p></div><span className="setting-chip">BETA</span></div><div className="setting-card"><div><b>Технологии</b><p>React · TypeScript · Vite · Express · Ollama</p></div></div></>}
        </div></section> : <div className="chat-layout">
        <section className="chat-feed" ref={feedRef}>
          {activeChat?.messages.map((m, index) => <article key={m.id} className={`message-row ${m.role} ${m.id === 'welcome' ? 'welcome-row' : ''}`}>
            {m.role === 'assistant' && <div className="message-avatar"><Atom size={17}/></div>}
            <div className="message-body">{m.id === 'welcome' && <div className="assistant-name">CHAOS <span>AI</span><small> · локальный интеллект</small></div>}
              {m.role === 'user' ? <div className="user-bubble"><MarkdownText text={m.content}/></div> : <MarkdownText text={m.content}/>}
              {m.image && <div className="scene-image-wrap"><img className="scene-image" src={m.image} alt="Иллюстрация сцены" loading="lazy" onError={e => { e.currentTarget.style.display='none'; }}/><span className="image-caption"><ImageIcon size={12}/> SCENE VISUALIZATION</span></div>}
              {!!m.actions?.length && <div className="action-row">{m.actions.map((a,i) => <button key={i} className="choice-button" onClick={() => useAction(a)}>{a.toLowerCase().includes('инвентар') ? <Package size={14}/> : <ArrowRight size={14}/>} {a}</button>)}</div>}
              {m.role === 'assistant' && m.id !== 'welcome' && <div className="message-tools"><button onClick={() => copyMessage(m.content)} title="Копировать"><Copy size={13}/></button>{index === activeChat.messages.length - 1 && <button onClick={() => setToast('Чтобы повторить ответ, отправь запрос ещё раз')} title="Дополнительно"><MoreHorizontal size={14}/></button>}</div>}
            </div>
          </article>)}
          {busy && <div className="thinking-row"><div className="message-avatar"><Atom size={17}/></div><div><span className="thinking-label">CHAOS AI думает</span><div className="thinking-dots"><i/><i/><i/></div></div></div>}
          {!health?.ollama && <div className="offline-hint"><Zap size={14}/><span>Локальный движок не подключён. <button onClick={() => { setView('settings'); setSettingsTab('Модель ИИ'); }}>Настроить Ollama</button></span></div>}
          {showScroll && <button className="scroll-bottom" onClick={() => feedRef.current?.scrollTo({top: feedRef.current.scrollHeight, behavior:'smooth'})}><ArrowDown size={15}/></button>}
        </section>
        <footer className="composer-wrap"><div className="composer"><textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder={view === 'roleplay' ? 'Что будешь делать дальше?' : 'Спроси что угодно…'} rows={1} aria-label="Сообщение" /><div className="composer-bottom"><div className="composer-tools"><button title="Новая ролевая игра" onClick={() => createChat('roleplay')}><Gamepad2 size={16}/></button><span className="composer-note">Shift + Enter — новая строка</span></div><button className="send-button" onClick={() => void send()} disabled={!input.trim() || busy} aria-label="Отправить"><ArrowRight size={21}/></button></div></div><div className="composer-disclaimer">CHAOS AI может ошибаться. Проверяй важную информацию.</div></footer>
      </div>}
    </main>
    {inventoryOpen && <div className="modal-backdrop" onClick={() => setInventoryOpen(false)}><section className="inventory-modal" onClick={e => e.stopPropagation()}><header><div><span className="eyebrow">ROLEPLAY / STATUS</span><h2>Инвентарь</h2></div><button className="icon-button" onClick={() => setInventoryOpen(false)}><X size={18}/></button></header><div className="stats-grid"><div><Heart size={16}/><small>Здоровье</small><b>{rp.health}/100</b></div><div><Coins size={16}/><small>Золото</small><b>{rp.gold}</b></div><div><Compass size={16}/><small>Локация</small><b>{rp.location}</b></div></div><div className="inventory-items">{rp.inventory.map((item,i)=><div key={`${item}-${i}`} className="inventory-item"><Package size={16}/><span>{item}</span></div>)}</div><button className="primary-button full" onClick={() => { setInventoryOpen(false); void send('Покажи мой инвентарь и опиши, что я могу с ним сделать.'); }}><WandSparkles size={15}/> Обсудить с ведущим</button></section></div>}
    {toast && <div className="toast"><Check size={15}/>{toast}</div>}
  </div>;
}