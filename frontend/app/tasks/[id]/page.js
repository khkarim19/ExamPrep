"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Shell, Icon, MD as Markdown } from "../../ui";

const TABS = [
  ["theory", "Теория"],
  ["glossary", "Словарь"],
  ["problems", "Задачи"],
  ["practice", "Тренировка"],
];
const DONE_LABELS = {
  problems: ["Разобрал", "Разобрано"],
  practice: ["Завершить тренировку", "Тренировка пройдена"],
};

const norm = (s) => (s || "").trim().toLowerCase().replace(",", ".");
const clip = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

// дерево связей: parent_id указывает на главу-родителя, NULL — ветка от центра (задания)
function MindMap({ title, sections, onPick }) {
  const byParent = new Map();
  sections.forEach((s) => {
    const k = s.parent_id ?? 0;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(s);
  });

  let leaf = 0;
  const placed = [];
  const place = (s, depth) => {
    const kids = byParent.get(s.id) || [];
    const ys = kids.map((k) => place(k, depth + 1));
    const y = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : leaf++;
    placed.push({ s, depth, y });
    return y;
  };
  const rootYs = (byParent.get(0) || []).map((r) => place(r, 1));
  const rootY = rootYs.length ? (Math.min(...rootYs) + Math.max(...rootYs)) / 2 : 0;

  const ROW = 46, COL = 205, PAD = 18;
  const centerLabel = clip(title, 20);
  const centerW = centerLabel.length * 7.5 + 40;
  const X = (d) => PAD + centerW / 2 + d * COL;
  const Y = (y) => PAD + 17 + y * ROW;

  const pos = new Map([[0, { x: X(0), y: Y(rootY), w: centerW }]]);
  placed.forEach(({ s, depth, y }) => {
    const label = (s.read ? "✓ " : "") + clip(s.title, 24);
    pos.set(s.id, { x: X(depth), y: Y(y), w: label.length * 7.2 + 26, label });
  });
  const W = Math.max(...[...pos.values()].map((p) => p.x + p.w / 2)) + PAD;
  const H = PAD * 2 + Math.max(leaf - 1, 0) * ROW + 34;

  return (
    <svg className="mindmap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Карта глав теории">
      {sections.map((s) => {
        const a = pos.get(s.parent_id ?? 0), b = pos.get(s.id);
        if (!a || !b) return null;
        const x1 = a.x + a.w / 2, x2 = b.x - b.w / 2;
        return (
          <path key={s.id} fill="none" stroke="var(--border-strong)" strokeWidth="1.5"
            d={`M ${x1} ${a.y} C ${x1 + 45} ${a.y}, ${x2 - 45} ${b.y}, ${x2} ${b.y}`} />
        );
      })}
      <rect x={pos.get(0).x - centerW / 2} y={pos.get(0).y - 17} width={centerW} height={34} rx={17}
        fill="var(--raised)" stroke="var(--border-strong)" strokeWidth="1" />
      <text x={pos.get(0).x} y={pos.get(0).y + 4.5} textAnchor="middle" fontSize="13" fontWeight="600"
        fill="var(--text)">{centerLabel}</text>
      {placed.map(({ s }) => {
        const p = pos.get(s.id);
        return (
          <g key={s.id} className="mm-node" onClick={() => onPick(s)}>
            <rect x={p.x - p.w / 2} y={p.y - 16} width={p.w} height={32} rx={16}
              fill={s.read ? "var(--accent-soft)" : "var(--card-bg)"}
              stroke={s.read ? "var(--accent)" : "var(--border-strong)"} strokeWidth="1" />
            <text x={p.x} y={p.y + 4.5} textAnchor="middle" fontSize="12" fontWeight="500"
              fill={s.read ? "var(--accent)" : "var(--text)"}>{p.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// кат: объяснение решения свёрнуто, пока пользователь сам его не откроет
function Cut({ md, label }) {
  if (!md) return null;
  return (
    <details className="cut">
      <summary><Icon name="chevron-right" />{label}</summary>
      <div className="md"><Markdown>{md}</Markdown></div>
    </details>
  );
}

// поле для собственного решения справа от задачи; «Зафиксировать» (или ⌘/Ctrl+Enter) сохраняет на сервер
function NoteBox({ problem, num }) {
  const [text, setText] = useState(problem.user_note || "");
  const [saved, setSaved] = useState(problem.user_note || "");
  const [state, setState] = useState("idle"); // idle | saving | error
  const dirty = text !== saved;

  async function save() {
    if (!dirty || state === "saving") return;
    setState("saving");
    const res = await fetch(`/api/problems/${problem.id}/note`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(() => null);
    if (res?.ok) { setSaved(text); setState("idle"); } else setState("error");
  }

  return (
    <div className="note">
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); if (state === "error") setState("idle"); }}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && save()}
        placeholder="Ваше решение"
        aria-label={`Ваше решение задачи ${num}`}
        maxLength={20000}
      />
      <div className="note-bar">
        <button className="check-btn" onClick={save} disabled={!dirty || state === "saving"}>
          {state === "saving" ? "Сохраняю…" : "Зафиксировать"}
        </button>
        {state === "error" && <span className="note-status bad">Не сохранилось, попробуйте ещё раз</span>}
        {state === "idle" && !dirty && saved && <span className="note-status ok"><Icon name="check" size={14} />Зафиксировано</span>}
        {state === "idle" && dirty && saved && <span className="note-status">есть несохранённые правки</span>}
      </div>
    </div>
  );
}

async function jsonFetch(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  }).catch(() => null);
  if (!res) throw new Error("Нет связи с сервером");
  const data = await res.json().catch(() => ({}));
  // 409/404 приходят строкой в detail, ошибки валидации — списком
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Проверьте заполнение полей");
  return data;
}

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// режим карточек: выражение → «Показать значение» → «Знаю» (убрать) или «Повторить» (в конец очереди).
// Клавиатура: пробел нажимает кнопку в фокусе (показать, затем «Знаю»), ← повторить, → знаю.
function Flashcards({ entries }) {
  const [queue, setQueue] = useState(() => shuffle(entries.map((e) => e.id)));
  const [revealed, setRevealed] = useState(false);
  const [known, setKnown] = useState(0);
  const [repeats, setRepeats] = useState(0);
  const revealRef = useRef(null);
  const knowRef = useRef(null);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const live = queue.filter((id) => byId.has(id)); // запись могли удалить в режиме списка
  const card = byId.get(live[0]);

  useEffect(() => { (revealed ? knowRef : revealRef).current?.focus(); }, [card?.id, revealed]);

  const answer = (isKnown) => {
    setQueue(isKnown ? live.slice(1) : [...live.slice(1), live[0]]);
    isKnown ? setKnown((k) => k + 1) : setRepeats((r) => r + 1);
    setRevealed(false);
  };
  const restart = () => {
    setQueue(shuffle(entries.map((e) => e.id)));
    setKnown(0); setRepeats(0); setRevealed(false);
  };
  const onKey = (e) => {
    if (!revealed || !card) return;
    if (e.key === "ArrowRight") answer(true);
    if (e.key === "ArrowLeft") answer(false);
  };

  if (!card) {
    return (
      <div className="card flash-card">
        <div className="flash-term">Колода пройдена</div>
        <div className="flash-hint">Выражений: {entries.length} · повторов понадобилось: {repeats}</div>
        <button className="check-btn" ref={revealRef} onClick={restart}>Ещё раз</button>
      </div>
    );
  }

  return (
    <div className="flash" onKeyDown={onKey}>
      <div className="flash-meta">
        <span>Осталось: {live.length}</span>
        <span>Знаю: {known} из {entries.length}</span>
      </div>
      <div className="card flash-card" onClick={() => !revealed && setRevealed(true)}>
        <div className="flash-term">{card.term}</div>
        {revealed ? (
          card.definition
            ? <div className="md flash-def"><Markdown>{card.definition}</Markdown></div>
            : <p className="empty">Значение не задано</p>
        ) : (
          <button className="check-btn" ref={revealRef} onClick={() => setRevealed(true)}>Показать значение</button>
        )}
      </div>
      {revealed && (
        <div className="flash-actions">
          <button className="done-btn" onClick={() => answer(false)}><Icon name="arrow-left" />Повторить</button>
          <button className="done-btn done" ref={knowRef} onClick={() => answer(true)}>Знаю<Icon name="arrow-right" /></button>
        </div>
      )}
      <div className="flash-keys" aria-hidden="true">
        <span><kbd>Пробел</kbd> {revealed ? "знаю" : "показать"}</span>
        <span><kbd>←</kbd> повторить</span>
        <span><kbd>→</kbd> знаю</span>
      </div>
    </div>
  );
}

// словарь задания: выражение → значение (markdown и формулы), по алфавиту
function Glossary({ taskId, entries, onChange }) {
  const [mode, setMode] = useState("list"); // list | cards
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // {id, term, definition, error}
  const sorted = [...entries].sort((a, b) => a.term.localeCompare(b.term, "ru", { sensitivity: "base" }));
  const submitOnCmdEnter = (e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && e.currentTarget.form.requestSubmit();

  async function add(e) {
    e.preventDefault();
    try {
      const created = await jsonFetch(`/api/tasks/${taskId}/glossary`, "POST", { term, definition });
      onChange([...entries, created]);
      setTerm(""); setDefinition(""); setError(null);
    } catch (err) { setError(err.message); }
  }

  async function save(e) {
    e.preventDefault();
    try {
      const updated = await jsonFetch(`/api/glossary/${editing.id}`, "PUT",
        { term: editing.term, definition: editing.definition });
      onChange(entries.map((x) => (x.id === updated.id ? updated : x)));
      setEditing(null);
    } catch (err) { setEditing({ ...editing, error: err.message }); }
  }

  async function remove(entry) {
    if (!confirm(`Удалить «${entry.term}» из словаря?`)) return;
    try {
      await jsonFetch(`/api/glossary/${entry.id}`, "DELETE");
      onChange(entries.filter((x) => x.id !== entry.id));
    } catch (err) { alert(err.message); }
  }

  const cards = mode === "cards" && entries.length > 0;

  return (
    <>
      <div className="gloss-top">
        <span className="drill-score">Словарь · {entries.length ? `выражений: ${entries.length}` : "пока пусто"}</span>
        {entries.length > 0 && (
          <div className="mode-toggle" role="group" aria-label="Режим словаря">
            {[["list", "Список"], ["cards", "Карточки"]].map(([m, label]) => (
              <button key={m} className={mode === m ? "on" : ""} aria-pressed={mode === m}
                onClick={() => setMode(m)}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {cards && <Flashcards entries={entries} />}

      {!cards && <>
      <form className="card gloss-form" onSubmit={add}>
        <input className="field" value={term} onChange={(e) => { setTerm(e.target.value); setError(null); }}
          placeholder="Выражение" aria-label="Выражение" maxLength={200} />
        <textarea className="field" value={definition} onChange={(e) => setDefinition(e.target.value)}
          onKeyDown={submitOnCmdEnter} placeholder="Значение (markdown, формулы)"
          aria-label="Значение" maxLength={5000} />
        <div className="note-bar">
          <button className="check-btn" disabled={!term.trim()}>Добавить</button>
          {error && <span className="note-status bad">{error}</span>}
        </div>
      </form>

      {sorted.map((g) => (
        <div className="card gloss-item" key={g.id}>
          {editing?.id === g.id ? (
            <form className="gloss-form" onSubmit={save}>
              <input className="field" value={editing.term} aria-label="Выражение" maxLength={200} autoFocus
                onChange={(e) => setEditing({ ...editing, term: e.target.value, error: null })} />
              <textarea className="field" value={editing.definition} aria-label="Значение" maxLength={5000}
                onKeyDown={submitOnCmdEnter}
                onChange={(e) => setEditing({ ...editing, definition: e.target.value })} />
              <div className="note-bar">
                <button className="check-btn" disabled={!editing.term.trim()}>Сохранить</button>
                <button type="button" className="link-btn" onClick={() => setEditing(null)}>Отмена</button>
                {editing.error && <span className="note-status bad">{editing.error}</span>}
              </div>
            </form>
          ) : (
            <>
              <div className="gloss-head">
                <span className="gloss-term">{g.term}</span>
                <span className="spacer" />
                <button className="link-btn" onClick={() => setEditing({ ...g, error: null })}
                  aria-label={`Изменить «${g.term}»`}>изменить</button>
                <button className="link-btn danger" onClick={() => remove(g)}
                  aria-label={`Удалить «${g.term}»`}>удалить</button>
              </div>
              {g.definition
                ? <div className="md gloss-def"><Markdown>{g.definition}</Markdown></div>
                : <p className="empty">Значение не задано</p>}
            </>
          )}
        </div>
      ))}
      </>}
    </>
  );
}

// словарь поверх любой вкладки: быстро найти выражение или добавить новое, не уходя из задачи
function GlossaryDrawer({ taskId, entries, onChange, onClose }) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [error, setError] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const needle = q.trim().toLowerCase();
  const shown = [...entries]
    .filter((g) => !needle || g.term.toLowerCase().includes(needle) || g.definition.toLowerCase().includes(needle))
    .sort((a, b) => a.term.localeCompare(b.term, "ru", { sensitivity: "base" }));

  async function add(e) {
    e.preventDefault();
    try {
      const created = await jsonFetch(`/api/tasks/${taskId}/glossary`, "POST", { term, definition });
      onChange([...entries, created]);
      setTerm(""); setDefinition(""); setError(null); setAdding(false); setQ("");
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label="Словарь" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2 className="modal-title">Словарь</h2>
          <span className="drill-score">{entries.length}</span>
          <span className="spacer" />
          <button className="modal-x" onClick={onClose} aria-label="Закрыть"><Icon name="x" /></button>
        </div>
        <div className="drawer-body">
          <input ref={searchRef} className="field" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск" aria-label="Поиск по словарю" />
          {adding ? (
            <form className="gloss-form" onSubmit={add}>
              <input className="field" value={term} autoFocus maxLength={200} aria-label="Выражение"
                placeholder="Выражение" onChange={(e) => { setTerm(e.target.value); setError(null); }} />
              <textarea className="field" value={definition} maxLength={5000} aria-label="Значение"
                placeholder="Значение (markdown, формулы)" onChange={(e) => setDefinition(e.target.value)}
                onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && e.currentTarget.form.requestSubmit()} />
              <div className="note-bar">
                <button className="check-btn" disabled={!term.trim()}>Добавить</button>
                <button type="button" className="link-btn" onClick={() => setAdding(false)}>Отмена</button>
                {error && <span className="note-status bad">{error}</span>}
              </div>
            </form>
          ) : (
            <button className="add-btn" onClick={() => { setTerm(shown.length ? "" : q.trim()); setAdding(true); }}>
              <Icon name="plus" />Добавить выражение
            </button>
          )}
          {shown.length === 0 && <p className="empty">{entries.length ? "Ничего не найдено" : "Словарь пока пуст"}</p>}
          {shown.map((g) => (
            <div className="drawer-item" key={g.id}>
              <div className="gloss-term">{g.term}</div>
              {g.definition && <div className="md gloss-def"><Markdown>{g.definition}</Markdown></div>}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

// тело главы: текст + кнопка «Прочитал» (используется и в аккордеоне, и в модалке карты)
function ChapterBody({ s, onRead }) {
  return (
    <>
      <div className="md"><Markdown>{s.content_md}</Markdown></div>
      <button className="check-btn read-btn" onClick={() => onRead(s)}>
        {s.read ? <><Icon name="check" />Прочитано</> : "Прочитал"}
      </button>
    </>
  );
}

function AnswerRow({ problem, answers, setAnswers, onSolved }) {
  const a = answers[problem.id] || { value: "", result: null };
  const set = (patch) => setAnswers((prev) => ({
    ...prev,
    [problem.id]: { value: "", result: null, ...prev[problem.id], ...patch },
  }));
  const check = () => {
    const ok = norm(a.value) === norm(problem.solution_md);
    set({ result: ok });
    if (ok && !problem.solved) onSolved(problem.id); // верный ответ фиксируется на сервере
  };
  return (
    <div className="answer-row">
      <input
        className={a.result == null ? "" : a.result ? "ok" : "bad"}
        value={a.value}
        placeholder="Ответ"
        onChange={(e) => set({ value: e.target.value, result: null })}
        onKeyDown={(e) => e.key === "Enter" && check()}
      />
      <button className="check-btn" onClick={check}>Ок</button>
      {a.result != null && (
        <span className={"verdict " + (a.result ? "ok" : "bad")}>
          <Icon name={a.result ? "check" : "x"} size={18} label={a.result ? "Верно" : "Неверно"} />
        </span>
      )}
    </div>
  );
}

export default function TaskPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null); // проект задания: заголовок + список заданий для сайдбара
  const [task, setTask] = useState(null);
  const [tab, setTab] = useState("theory");
  const [answers, setAnswers] = useState({});
  // главы раскрываются независимо: если открытие одной сворачивало бы другую выше,
  // страница уезжала бы вверх вместе с нажатым заголовком
  const [openSections, setOpenSections] = useState(new Set());
  const toggleSection = (sid) => setOpenSections((prev) => {
    const next = new Set(prev);
    next.has(sid) ? next.delete(sid) : next.add(sid);
    return next;
  });
  const [modal, setModal] = useState(null); // id главы, открытой поверх карты
  const [drawer, setDrawer] = useState(false); // словарь справа

  const loadProject = (pid) => fetch(`/api/projects/${pid}`).then((r) => r.json()).then(setProject);
  const loadAll = () => task && loadProject(task.project_id);
  useEffect(() => {
    setTab("theory");
    setDrawer(false);
    setAnswers({});
    fetch(`/api/tasks/${id}`).then((r) => (r.ok ? r.json() : null)).then((t) => {
      setTask(t);
      if (t) loadProject(t.project_id);
      const firstUnread = t?.sections?.find((s) => !s.read);
      setOpenSections(new Set(firstUnread ? [firstUnread.id] : []));
      // уже решённые задачи показываем решёнными (ответ подставляем в поле)
      setAnswers(Object.fromEntries((t?.practice || []).filter((p) => p.solved)
        .map((p) => [p.id, { value: p.solution_md, result: true }])));
    });
  }, [id]);

  async function toggle(section) {
    const done = !task.progress[section];
    const res = await fetch(`/api/tasks/${id}/progress`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section, done }),
    });
    if (!res.ok) return; // например 409: тренировка ещё не решена
    setTask({ ...task, progress: { ...task.progress, [section]: done } });
    loadAll();
  }

  async function markSolved(pid) {
    const res = await fetch(`/api/problems/${pid}/solved`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    if (!res.ok) return;
    setTask((t) => ({ ...t, practice: t.practice.map((p) => (p.id === pid ? { ...p, solved: 1 } : p)) }));
  }

  async function toggleRead(s) {
    const done = !s.read;
    await fetch(`/api/theory/${s.id}/read`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    const sections = task.sections.map((x) => (x.id === s.id ? { ...x, read: done ? 1 : 0 } : x));
    const theory = sections.length > 0 && sections.every((x) => x.read);
    setTask({ ...task, sections, progress: { ...task.progress, theory } });
    loadAll();
  }

  const tasks = project?.tasks || [];
  const num = tasks.findIndex((t) => t.id === Number(id)) + 1;
  const kicker = num ? `Задание ${num} из ${tasks.length}` : "";

  if (!task) {
    return <Shell project={project} activeId={Number(id)} kicker={kicker} title="…">
      <div className="task-view"><p className="empty">Загрузка…</p></div>
    </Shell>;
  }

  const drills = task.practice;
  // проверяемые задачи — те, у которых задан правильный ответ
  const required = drills.filter((d) => d.solution_md);
  const solvedCount = required.filter((d) => d.solved).length;
  const left = required.length - solvedCount;
  const readCount = task.sections.filter((s) => s.read).length;

  const DoneBtn = ({ section, blocked }) => (
    <>
      <button className={"done-btn" + (task.progress[section] ? " done" : "")}
        disabled={blocked} onClick={() => toggle(section)}>
        {DONE_LABELS[section][task.progress[section] ? 1 : 0]}
      </button>
      {blocked && <span className="done-hint">Чтобы завершить, решите верно все задачи: осталось {left}</span>}
    </>
  );

  return (
    <Shell project={project} activeId={Number(id)} kicker={kicker} title={task.title}
      actions={<button className="topbar-btn" onClick={() => setDrawer(true)}><Icon name="book" />Словарь</button>}>
      <div className="task-view">
        <div className="tabs">
          {TABS.map(([key, label]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
              {task.progress[key] && <span className="t"><Icon name="check" size={14} label="Пройдено" /></span>}{label}
            </button>
          ))}
        </div>

        <h1 className="task-h">Задание {num || ""}</h1>
        <div className="task-sub">{task.title}</div>

        {/* все три вкладки остаются на странице, неактивные скрыты: так при переключении
            не теряются черновики решений, ответы тренировки и раскрытые каты */}
        <div className="pane" hidden={tab !== "theory"}>
            {task.sections.length === 0 && <p className="empty">Теория пока не добавлена</p>}
            {task.sections.length > 1 && (
              <>
                <span className="drill-score">Прочитано глав: {readCount} из {task.sections.length} · нажмите на блок карты, чтобы открыть главу</span>
                <div className="card mindmap-card">
                  <MindMap title={task.title} sections={task.sections} onPick={(s) => setModal(s.id)} />
                </div>
              </>
            )}
            {task.sections.map((s, i) => {
              const open = openSections.has(s.id);
              return (
                <div className="card chapter" key={s.id}>
                  <button className="chapter-head" onClick={() => toggleSection(s.id)}>
                    <span className={"read-dot" + (s.read ? " on" : "")}>
                      {s.read ? <Icon name="check" size={14} label="Прочитано" /> : i + 1}
                    </span>
                    <span className="chapter-title">{s.title}</span>
                    <span className={"chevron" + (open ? " up" : "")}><Icon name="chevron-down" /></span>
                  </button>
                  {open && (
                    <div className="chapter-body"><ChapterBody s={s} onRead={toggleRead} /></div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pane" hidden={tab !== "glossary"}>
            <Glossary key={task.id} taskId={task.id} entries={task.glossary}
              onChange={(glossary) => setTask((t) => ({ ...t, glossary }))} />
          </div>

          <div className="pane wide" hidden={tab !== "problems"}>
            {task.examples.length === 0 && <p className="empty">Пока пусто</p>}
            {task.examples.map((p, i) => (
              <div className="problem-row" key={p.id}>
                <div className="card">
                  <div className="prob-num">Задача {i + 1}</div>
                  <div className="prob-q md"><Markdown>{p.statement_md}</Markdown></div>
                  {p.explanation_md
                    ? <Cut md={p.explanation_md} label="Показать решение" />
                    : <p className="empty">Разбор решения пока не добавлен</p>}
                </div>
                <NoteBox problem={p} num={i + 1} />
              </div>
            ))}
            <DoneBtn section="problems" />
          </div>

          <div className="pane" hidden={tab !== "practice"}>
            <span className="drill-score">Быстрая тренировка · решено {solvedCount} из {required.length}</span>
            {drills.length === 0 && <p className="empty">Пока пусто</p>}
            {drills.map((p) => (
              <div className="card" key={p.id}>
                <div className="prob-q md"><Markdown>{p.statement_md}</Markdown></div>
                {p.solution_md && (
                  <AnswerRow problem={p} answers={answers} setAnswers={setAnswers} onSolved={markSolved} />
                )}
                <Cut md={p.explanation_md} label="Показать объяснение" />
              </div>
            ))}
            <DoneBtn section="practice" blocked={!task.progress.practice && left > 0} />
          </div>

        {drawer && (
          <GlossaryDrawer taskId={task.id} entries={task.glossary}
            onChange={(glossary) => setTask((t) => ({ ...t, glossary }))} onClose={() => setDrawer(false)} />
        )}

        {modal != null && (() => {
          const s = task.sections.find((x) => x.id === modal);
          if (!s) return null;
          return (
            <div className="modal-back" onClick={() => setModal(null)}>
              <div className="card modal" onClick={(e) => e.stopPropagation()}>
                <div className="row">
                  <h3 className="modal-title">{s.title}</h3>
                  <span className="spacer" />
                  <button className="modal-x" onClick={() => setModal(null)} aria-label="Закрыть"><Icon name="x" /></button>
                </div>
                <ChapterBody s={s} onRead={toggleRead} />
              </div>
            </div>
          );
        })()}
      </div>
    </Shell>
  );
}
