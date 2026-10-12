// Coach: chat con un asistente experto en fitness y nutrición. En cada mensaje recibe todos los datos
// de la app (perfil, sesiones, cardio, medidas, Fitia, catálogo). Las conversaciones se guardan en `chats`.
import { useStore, saveDoc, deleteDoc, newId } from '../store.js';
import { askCoach, getSample, imageLimits, errorCopy } from '../ai.js';
import { isWeekly } from '../fields.js';
import { completedSessions, fmtShort } from '../stats.js';
import { Icon, Thinking, Confirm, toast, copyText } from '../ui.js';
const { html, useState, useEffect, useRef } = window.htmPreact;

const SUGGESTIONS = [
  '¿Cómo voy con la recomposición: ganar músculo sin subir de peso?',
  'Revisa mi proteína y mis calorías de las últimas semanas.',
  '¿Cómo encaja la natación con mis sesiones en Forus?',
  '¿Qué debería comer antes y después de entrenar?',
  '¿Qué músculos tengo atrasados esta semana?',
];

/* ---------- markdown mínimo: párrafos, listas y **negrita** ---------- */
function inline(t) {
  return t.split(/(\*\*[^*]+\*\*)/g).map((p) => (p.startsWith('**') && p.endsWith('**') && p.length > 4 ? html`<b>${p.slice(2, -2)}</b>` : p));
}
function Md({ text }) {
  const out = []; let list = null;
  const flush = () => { if (list) { out.push(list.ordered ? html`<ol>${list.items}</ol>` : html`<ul>${list.items}</ul>`); list = null; } };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/); const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push(html`<li>${inline((bullet || numbered)[1])}</li>`);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    out.push(h ? html`<p><b>${inline(h[1].replace(/\*\*/g, ''))}</b></p>` : html`<p>${inline(line)}</p>`);
  }
  flush();
  return out;
}

export function CoachView({ go }) {
  const st = useStore();
  const chats = [...(st.chats || [])].sort((a, b) => ((a.updatedAt || '') < (b.updatedAt || '') ? 1 : -1));
  const [chatId, setChatId] = useState(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(null); // {text} mientras responde
  const [err, setErr] = useState('');
  const [hasAI, setHasAI] = useState(true);
  const [imgCaps, setImgCaps] = useState(null);
  const [files, setFiles] = useState([]);
  const [confirmDel, setConfirmDel] = useState(false);
  const ctl = useRef(null);
  const endRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => { getSample().then((s) => setHasAI(!!s)); imageLimits().then(setImgCaps); }, []);
  const chat = chats.find((c) => c.id === chatId) || (chatId === null ? null : { id: chatId, messages: [] });
  const messages = chat?.messages || [];
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [messages.length, !!pending]);

  async function send(textArg, prior = messages) {
    const text = (textArg ?? draft).trim();
    if (!text || pending) return;
    const id = chat?.id || newId('c');
    const imgs = files;
    const userMsg = { role: 'user', content: text, at: new Date().toISOString(), ...(imgs.length ? { adjuntos: imgs.length } : {}) };
    const base = { ...(chat || {}), title: chat?.title || text.slice(0, 60), createdAt: chat?.createdAt || new Date().toISOString() };
    delete base.id;
    const msgs = [...prior, userMsg];
    setChatId(id); setDraft(''); setFiles([]); setErr('');
    await saveDoc('chats', id, { ...base, messages: msgs });
    setPending({ text: '' });
    ctl.current = new AbortController();
    try {
      const turns = msgs.map((m) => ({ role: m.role, content: m.adjuntos ? `${m.content}\n[Adjuntó ${m.adjuntos} imagen${m.adjuntos > 1 ? 'es' : ''}]` : m.content }));
      const { text: answer } = await askCoach(st, turns, { signal: ctl.current.signal, images: imgs, onText: ({ text: t }) => setPending({ text: t }) });
      await saveDoc('chats', id, { ...base, messages: [...msgs, { role: 'assistant', content: answer, at: new Date().toISOString() }] });
    } catch (e) {
      if (e?.text) await saveDoc('chats', id, { ...base, messages: [...msgs, { role: 'assistant', content: `${e.text}\n\n(Respuesta interrumpida)`, at: new Date().toISOString() }] });
      if (e?.code !== 'cancelled') setErr(errorCopy(e));
    } finally { setPending(null); }
  }

  // Reintenta el último mensaje si quedó sin respuesta.
  const last = messages[messages.length - 1];
  async function retry() {
    if (!last || last.role !== 'user') return;
    send(last.content, messages.slice(0, -1));
  }

  const nSessions = completedSessions(st.sessions).filter((s) => s.status === 'guardada').length;
  const nDays = (st.nutrition || []).filter((n) => !isWeekly(n)).length;
  const seen = [`${nSessions} sesiones`, `${(st.activities || []).length} de cardio`, `${(st.measurements || []).length} medidas`, `${nDays} días de Fitia`].join(' · ');

  return html`
    <div class="stack coach">
      <header class="hello">
        <span class="eyebrow">Fitness y nutrición</span>
        <h1>Coach</h1>
        <p class="muted small">Pregúntale lo que quieras. Ve todo lo que tienes en la app: ${seen}.</p>
      </header>

      <div class="row">
        ${chats.length ? html`<select id="chat-pick" class="select grow" aria-label="Conversaciones" value=${chat?.id || ''} onChange=${(e) => { setChatId(e.target.value || null); setErr(''); }}>
          <option value="">Nueva conversación</option>
          ${chats.map((c) => html`<option value=${c.id}>${fmtShort((c.updatedAt || c.createdAt || '').slice(0, 10) || '2026-01-01')} · ${c.title || 'Conversación'}</option>`)}
        </select>` : null}
        ${chat && html`<button class="btn btn-sm" onClick=${() => { setChatId(null); setErr(''); }}><${Icon} name="plus" size="16" /> Nueva</button>
          <button class="icon-btn" aria-label="Eliminar conversación" onClick=${() => setConfirmDel(true)}><${Icon} name="trash" /></button>`}
      </div>

      ${!hasAI && html`<div class="panel small">Claude no está disponible en esta vista. Abre la app desde claude.ai para usar el chat.</div>`}

      <div class="chat-log" aria-live="polite">
        ${!messages.length && !pending && html`
          <div class="stack-sm">
            <span class="eyebrow">Para empezar</span>
            <div class="chips">${SUGGESTIONS.map((q) => html`<button class="chip" disabled=${!hasAI} onClick=${() => send(q)}>${q}</button>`)}</div>
          </div>`}
        ${messages.map((m) => html`
          <div class=${'bubble ' + (m.role === 'user' ? 'me' : 'ai')}>
            ${m.role === 'user' ? html`<p>${m.content}</p>${m.adjuntos ? html`<span class="xs muted"><${Icon} name="image" size="12" /> ${m.adjuntos} imagen${m.adjuntos > 1 ? 'es' : ''}</span>` : null}` : html`<${Md} text=${m.content} />
              <button class="btn btn-ghost btn-sm copy" onClick=${() => copyText(m.content)}><${Icon} name="copy" size="14" /> Copiar</button>`}
          </div>`)}
        ${pending && html`<div class="bubble ai">${pending.text ? html`<${Md} text=${pending.text} />` : html`<${Thinking} text="Revisando tus datos…" />`}</div>`}
        ${err && html`<div class="panel small row-between"><span style="color:var(--bad)">${err}</span>${last?.role === 'user' && html`<button class="btn btn-sm" onClick=${retry}>Reintentar</button>`}</div>`}
        <div ref=${endRef}></div>
      </div>

      <div class="composer">
        ${files.length ? html`<div class="row small"><${Icon} name="image" size="16" /> ${files.length} imagen${files.length > 1 ? 'es' : ''} adjunta${files.length > 1 ? 's' : ''}<button class="btn btn-ghost btn-sm" onClick=${() => setFiles([])}>Quitar</button></div>` : null}
        <div class="composer-row">
          ${imgCaps && html`<button class="icon-btn" aria-label="Adjuntar foto" disabled=${!!pending} onClick=${() => fileRef.current?.click()}><${Icon} name="camera" /></button>
            <input ref=${fileRef} type="file" accept="image/*" multiple hidden onChange=${(e) => { setFiles([...(e.target.files || [])].slice(0, imgCaps?.maxCount || 4)); e.target.value = ''; }} />`}
          <textarea id="chat-input" class="textarea" rows="1" placeholder="Escribe tu pregunta…" value=${draft} disabled=${!hasAI}
            onInput=${(e) => setDraft(e.target.value)}
            onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(pointer:fine)').matches) { e.preventDefault(); send(); } }}></textarea>
          ${pending
            ? html`<button class="btn btn-primary" aria-label="Detener" onClick=${() => ctl.current?.abort()}><${Icon} name="stop" /></button>`
            : html`<button class="btn btn-primary" aria-label="Enviar" disabled=${!draft.trim() || !hasAI} onClick=${() => send()}><${Icon} name="send" /></button>`}
        </div>
        <p class="xs muted">Orientación general basada en tus registros; no reemplaza a tu médico ni a tu nutricionista.</p>
      </div>

      ${confirmDel && chat && html`<${Confirm} title="Eliminar conversación" text="Se borra esta conversación con el coach." onConfirm=${async () => { await deleteDoc('chats', chat.id); setChatId(null); toast('Conversación eliminada'); }} onClose=${() => setConfirmDel(false)} />`}
    </div>`;
}
