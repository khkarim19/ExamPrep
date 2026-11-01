"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Shell, MD as Markdown } from "../../ui";

const TABS = [
  ["theory", "Теория"],
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
        fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.5" />
      <text x={pos.get(0).x} y={pos.get(0).y + 4.5} textAnchor="middle" fontSize="13" fontWeight="700"
        fill="var(--text)">{centerLabel}</text>
      {placed.map(({ s }) => {
        const p = pos.get(s.id);
        return (
          <g key={s.id} className="mm-node" onClick={() => onPick(s)}>
            <rect x={p.x - p.w / 2} y={p.y - 16} width={p.w} height={32} rx={16}
              fill={s.read ? "var(--accent-soft)" : "var(--card-bg)"}
              stroke={s.read ? "var(--accent)" : "var(--border-strong)"} strokeWidth="1.5" />
            <text x={p.x} y={p.y + 4.5} textAnchor="middle" fontSize="12.5" fontWeight="600"
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
      <summary>{label}</summary>
      <div className="md"><Markdown>{md}</Markdown></div>
    </details>
  );
}

// тело главы: текст + кнопка «Прочитал» (используется и в аккордеоне, и в модалке карты)
function ChapterBody({ s, onRead }) {
  return (
    <>
      <div className="md"><Markdown>{s.content_md}</Markdown></div>
      <button className="check-btn read-btn" onClick={() => onRead(s)}>
        {s.read ? "✓ Прочитано" : "Прочитал"}
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
      {a.result != null && <span className={"verdict " + (a.result ? "ok" : "bad")}>{a.result ? "✓" : "✕"}</span>}
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

  const loadProject = (pid) => fetch(`/api/projects/${pid}`).then((r) => r.json()).then(setProject);
  const loadAll = () => task && loadProject(task.project_id);
  useEffect(() => {
    setTab("theory");
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
    <Shell project={project} activeId={Number(id)} kicker={kicker} title={task.title}>
      <div className="task-view">
        <div className="tabs">
          {TABS.map(([key, label]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
              {task.progress[key] && <span className="t">✓</span>}{label}
            </button>
          ))}
        </div>

        <h1 className="task-h">Задание {num || ""}</h1>
        <div className="task-sub">{task.title}</div>

        {tab === "theory" && (
          <div className="pane">
            {task.sections.length === 0 && <p className="empty">Теория пока не добавлена.</p>}
            {task.sections.length > 1 && (
              <>
                <span className="drill-score">Главы теории · прочитано {readCount} из {task.sections.length} · нажми на блок, чтобы открыть</span>
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
                    <span className={"read-dot" + (s.read ? " on" : "")}>{s.read ? "✓" : i + 1}</span>
                    <span className="chapter-title">{s.title}</span>
                    <span className={"chevron" + (open ? " up" : "")}>▾</span>
                  </button>
                  {open && (
                    <div className="chapter-body"><ChapterBody s={s} onRead={toggleRead} /></div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "problems" && (
          <div className="pane">
            {task.examples.length === 0 && <p className="empty">Пока пусто.</p>}
            {task.examples.map((p, i) => (
              <div className="card" key={p.id}>
                <div className="prob-num">Задача {i + 1}</div>
                <div className="prob-q md"><Markdown>{p.statement_md}</Markdown></div>
                {p.explanation_md
                  ? <Cut md={p.explanation_md} label="Показать решение" />
                  : <p className="empty">Разбор решения пока не добавлен.</p>}
              </div>
            ))}
            <DoneBtn section="problems" />
          </div>
        )}

        {tab === "practice" && (
          <div className="pane">
            <span className="drill-score">Быстрая тренировка · решено {solvedCount} из {required.length}</span>
            {drills.length === 0 && <p className="empty">Пока пусто.</p>}
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
                  <button className="modal-x" onClick={() => setModal(null)}>✕</button>
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
