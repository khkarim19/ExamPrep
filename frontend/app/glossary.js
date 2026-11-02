"use client";
import { useEffect, useRef, useState } from "react";
import { Icon, MD as Markdown } from "./ui";

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

// словарь проекта: выезжающая панель справа, доступна на любой странице проекта.
// Список с поиском, добавление, правка, удаление и режим карточек для заучивания.
export function GlossaryDrawer({ projectId, onClose }) {
  const [entries, setEntries] = useState(null); // null — загружается
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState("list"); // list | cards
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // {id, term, definition, error}
  const searchRef = useRef(null);
  const submitOnCmdEnter = (e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && e.currentTarget.form.requestSubmit();

  useEffect(() => {
    jsonFetch(`/api/projects/${projectId}/glossary`).then(setEntries).catch(() => setLoadError(true));
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { entries && mode === "list" && searchRef.current?.focus(); }, [entries === null, mode]);

  const needle = q.trim().toLowerCase();
  const shown = [...(entries || [])]
    .filter((g) => !needle || g.term.toLowerCase().includes(needle) || g.definition.toLowerCase().includes(needle))
    .sort((a, b) => a.term.localeCompare(b.term, "ru", { sensitivity: "base" }));

  async function add(e) {
    e.preventDefault();
    try {
      const created = await jsonFetch(`/api/projects/${projectId}/glossary`, "POST", { term, definition });
      setEntries([...entries, created]);
      setTerm(""); setDefinition(""); setError(null); setAdding(false); setQ("");
    } catch (err) { setError(err.message); }
  }

  async function save(e) {
    e.preventDefault();
    try {
      const updated = await jsonFetch(`/api/glossary/${editing.id}`, "PUT",
        { term: editing.term, definition: editing.definition });
      setEntries(entries.map((x) => (x.id === updated.id ? updated : x)));
      setEditing(null);
    } catch (err) { setEditing({ ...editing, error: err.message }); }
  }

  async function remove(entry) {
    if (!confirm(`Удалить «${entry.term}» из словаря?`)) return;
    try {
      await jsonFetch(`/api/glossary/${entry.id}`, "DELETE");
      setEntries(entries.filter((x) => x.id !== entry.id));
    } catch (err) { alert(err.message); }
  }

  const cards = mode === "cards" && entries?.length > 0;

  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label="Словарь" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2 className="modal-title">Словарь</h2>
          <span className="drill-score">{entries?.length ?? ""}</span>
          <span className="spacer" />
          {entries?.length > 0 && (
            <div className="mode-toggle" role="group" aria-label="Режим словаря">
              {[["list", "Список"], ["cards", "Карточки"]].map(([m, label]) => (
                <button key={m} className={mode === m ? "on" : ""} aria-pressed={mode === m}
                  onClick={() => setMode(m)}>{label}</button>
              ))}
            </div>
          )}
          <button className="modal-x" onClick={onClose} aria-label="Закрыть"><Icon name="x" /></button>
        </div>
        <div className="drawer-body">
          {loadError && <p className="empty">Не удалось загрузить словарь</p>}
          {entries === null && !loadError && <p className="empty">Загрузка…</p>}
          {cards && <Flashcards entries={entries} />}
          {entries && !cards && <>
            <input ref={searchRef} className="field" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск" aria-label="Поиск по словарю" />
            {adding ? (
              <form className="gloss-form" onSubmit={add}>
                <input className="field" value={term} autoFocus maxLength={200} aria-label="Выражение"
                  placeholder="Выражение" onChange={(e) => { setTerm(e.target.value); setError(null); }} />
                <textarea className="field" value={definition} maxLength={5000} aria-label="Значение"
                  placeholder="Значение (markdown, формулы)" onChange={(e) => setDefinition(e.target.value)}
                  onKeyDown={submitOnCmdEnter} />
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
                    {g.definition && <div className="md gloss-def"><Markdown>{g.definition}</Markdown></div>}
                  </>
                )}
              </div>
            ))}
          </>}
        </div>
      </aside>
    </div>
  );
}
