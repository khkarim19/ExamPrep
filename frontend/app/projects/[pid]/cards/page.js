"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Shell, Icon, MD as Markdown } from "../../../ui";
import { jsonFetch } from "../../../glossary";

const GRADES = [["again", "Снова"], ["hard", "Трудно"], ["good", "Хорошо"], ["easy", "Легко"]];

const fmtDays = (d) => (d === 0 ? "сегодня" : d < 30 ? `${d} дн.` : d < 365 ? `${Math.round(d / 30)} мес.` : `${(d / 365).toFixed(1)} г.`);
const fmtDate = (iso) => new Date(iso + "T00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

// повторение: вопрос → «Показать ответ» → оценка. «Снова» возвращает карточку в конец сегодняшней очереди.
// Клавиатура: пробел показывает ответ и затем ставит «Хорошо», 1–4 — оценки.
function Study({ cards, queue, setQueue, replace, onAdd }) {
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const revealRef = useRef(null);
  const goodRef = useRef(null);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const live = queue.filter((id) => byId.has(id)); // карточку могли удалить в колоде
  const card = byId.get(live[0]);

  useEffect(() => { (revealed ? goodRef : revealRef).current?.focus(); }, [card?.id, revealed]);

  async function grade(g) {
    if (busy) return;
    setBusy(true);
    try {
      replace(await jsonFetch(`/api/cards/${card.id}/review`, "POST", { grade: g }));
      setQueue(g === "again" ? [...live.slice(1), card.id] : live.slice(1));
      setRevealed(false);
    } catch (err) { alert(err.message); }
    setBusy(false);
  }
  const onKey = (e) => {
    const g = GRADES[Number(e.key) - 1];
    if (revealed && g) grade(g[0]);
  };

  if (!card) {
    const next = cards.map((c) => c.due).sort()[0];
    return (
      <div className="card flash-card" style={{ cursor: "default" }}>
        <div className="flash-term">{cards.length ? "На сегодня всё" : "Карточек пока нет"}</div>
        <div className="flash-hint">
          {cards.length ? `Следующее повторение: ${fmtDate(next)}` : "Добавьте первую карточку в колоде"}
        </div>
        {!cards.length && <button className="check-btn" onClick={onAdd}>Перейти к колоде</button>}
      </div>
    );
  }

  return (
    <div className="flash" onKeyDown={onKey}>
      <div className="flash-meta"><span>К повторению: {live.length}</span><span>Интервал: {fmtDays(card.interval)}</span></div>
      <div className="card flash-card" onClick={() => !revealed && setRevealed(true)}>
        <div className="md flash-front"><Markdown>{card.front}</Markdown></div>
        {revealed ? (
          card.back
            ? <div className="md flash-def"><Markdown>{card.back}</Markdown></div>
            : <p className="empty">Ответ не задан</p>
        ) : (
          <button className="check-btn" ref={revealRef} onClick={() => setRevealed(true)}>Показать ответ</button>
        )}
      </div>
      {revealed && (
        <div className="grades">
          {GRADES.map(([g, label]) => (
            <button key={g} className="grade-btn" disabled={busy} ref={g === "good" ? goodRef : null}
              onClick={() => grade(g)}>{label}<small>{fmtDays(card.next[g])}</small></button>
          ))}
        </div>
      )}
      <div className="flash-keys" aria-hidden="true">
        <span><kbd>Пробел</kbd> {revealed ? "хорошо" : "показать"}</span>
        <span><kbd>1</kbd>–<kbd>4</kbd> оценка</span>
      </div>
    </div>
  );
}

function CardForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [front, setFront] = useState(initial.front);
  const [back, setBack] = useState(initial.back);
  const [error, setError] = useState(null);
  async function submit(e) {
    e.preventDefault();
    try { await onSubmit({ front, back }); setFront(""); setBack(""); setError(null); }
    catch (err) { setError(err.message); }
  }
  return (
    <form className="gloss-form" onSubmit={submit}>
      <textarea className="field" value={front} autoFocus maxLength={5000} aria-label="Вопрос"
        placeholder="Вопрос (markdown, формулы)" onChange={(e) => setFront(e.target.value)} />
      <textarea className="field" value={back} maxLength={5000} aria-label="Ответ" placeholder="Ответ"
        onChange={(e) => setBack(e.target.value)}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && e.currentTarget.form.requestSubmit()} />
      <div className="note-bar">
        <button className="check-btn" disabled={!front.trim()}>{submitLabel}</button>
        {onCancel && <button type="button" className="link-btn" onClick={onCancel}>Отмена</button>}
        {error && <span className="note-status bad">{error}</span>}
      </div>
    </form>
  );
}

// колода: добавление, правка и удаление карточек
function Deck({ pid, cards: list, setCards: setList, replace, setQueue }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // id

  async function add(data) {
    const created = await jsonFetch(`/api/projects/${pid}/cards`, "POST", data);
    setList([...list, created]);
    setQueue((q) => [...q, created.id]); // новая карточка сразу в сегодняшней очереди
  }
  async function save(id, data) {
    replace(await jsonFetch(`/api/cards/${id}`, "PUT", data));
    setEditing(null);
  }
  async function remove(c) {
    if (!confirm("Удалить карточку вместе с её расписанием?")) return;
    try {
      await jsonFetch(`/api/cards/${c.id}`, "DELETE");
      setList(list.filter((x) => x.id !== c.id));
    } catch (err) { alert(err.message); }
  }

  return (
    <>
      {adding ? (
        <CardForm initial={{ front: "", back: "" }} submitLabel="Добавить" onSubmit={add} onCancel={() => setAdding(false)} />
      ) : (
        <button className="add-btn" style={{ alignSelf: "flex-start", marginTop: 0 }} onClick={() => setAdding(true)}>
          <Icon name="plus" />Добавить карточку
        </button>
      )}
      {list.length === 0 && <p className="empty">Колода пока пуста</p>}
      {list.map((c) => (
        <div className="deck-item" key={c.id}>
          {editing === c.id ? (
            <CardForm initial={c} submitLabel="Сохранить" onSubmit={(d) => save(c.id, d)} onCancel={() => setEditing(null)} />
          ) : (
            <>
              <div className="gloss-head">
                <span className="deck-meta">{c.is_due ? "к повторению" : `повтор ${fmtDate(c.due)}`}</span>
                <span className="spacer" />
                <button className="link-btn" onClick={() => setEditing(c.id)}>изменить</button>
                <button className="link-btn danger" onClick={() => remove(c)}>удалить</button>
              </div>
              <div className="md gloss-term"><Markdown>{c.front}</Markdown></div>
              {c.back && <div className="md gloss-def"><Markdown>{c.back}</Markdown></div>}
            </>
          )}
        </div>
      ))}
    </>
  );
}

export default function Cards() {
  const { pid } = useParams();
  const [project, setProject] = useState(null);
  const [cards, setCards] = useState(null);
  const [queue, setQueue] = useState([]);
  const [tab, setTab] = useState("study");
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${pid}`).then((r) => (r.ok ? r.json() : null)).then(setProject);
    jsonFetch(`/api/projects/${pid}/cards`)
      .then((list) => { setCards(list); setQueue(list.filter((c) => c.is_due).map((c) => c.id)); })
      .catch(() => setLoadError(true));
  }, [pid]);
  // счётчик в верхней панели следует за колодой
  useEffect(() => {
    cards && setProject((p) => p && { ...p, cards_due: cards.filter((c) => c.is_due).length });
  }, [cards]);

  const replace = (c) => setCards((list) => list.map((x) => (x.id === c.id ? c : x)));
  const due = cards?.filter((c) => c.is_due).length ?? 0;

  return (
    <Shell project={project} activeId={null} kicker="Проект" title="Карточки">
      <div className="cards-view">
        {loadError && <p className="empty">Не удалось загрузить карточки</p>}
        {cards === null && !loadError && <p className="empty">Загрузка…</p>}
        {cards && <>
          <div className="cards-top">
            <div className="mode-toggle" role="group" aria-label="Режим карточек">
              {[["study", `Повторение · ${due}`], ["deck", `Колода · ${cards.length}`]].map(([m, label]) => (
                <button key={m} className={tab === m ? "on" : ""} aria-pressed={tab === m} onClick={() => setTab(m)}>{label}</button>
              ))}
            </div>
          </div>
          {tab === "study"
            ? <Study cards={cards} queue={queue} setQueue={setQueue} replace={replace} onAdd={() => setTab("deck")} />
            : <Deck pid={pid} cards={cards} setCards={setCards} replace={replace} setQueue={setQueue} />}
        </>}
      </div>
    </Shell>
  );
}
