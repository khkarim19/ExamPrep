"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { MD as Markdown } from "../../../ui";
import { adminFetch, move } from "../../api";

// id главы и всех её потомков — их нельзя выбирать родителем (цикл)
function withDescendants(id, all) {
  const kids = all.filter((x) => x.parent_id === id);
  return [id, ...kids.flatMap((k) => withDescendants(k.id, all))];
}

function SectionEditor({ s, index, list, setList, reload }) {
  const [title, setTitle] = useState(s.title);
  const [content, setContent] = useState(s.content_md);
  const dirty = title !== s.title || content !== s.content_md;
  const excluded = withDescendants(s.id, list);
  const parentOptions = list.filter((x) => !excluded.includes(x.id));

  async function setParent(e) {
    await adminFetch(`/api/admin/theory/${s.id}`, {
      method: "PUT",
      body: JSON.stringify({ parent_id: Number(e.target.value) || null }),
    });
    reload();
  }

  async function save() {
    await adminFetch(`/api/admin/theory/${s.id}`, {
      method: "PUT",
      body: JSON.stringify({ title, content_md: content }),
    });
    reload();
  }

  async function remove() {
    if (!confirm(`Удалить главу «${s.title}»?`)) return;
    await adminFetch(`/api/admin/theory/${s.id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="problem editor">
      <div className="row">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название главы" />
        <label className="parent-pick">
          связь:
          <select value={s.parent_id ?? 0} onChange={setParent}>
            <option value={0}>центр (задание)</option>
            {parentOptions.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        </label>
        <button onClick={() => move(list, index, -1, "/api/admin/theory/reorder").then(setList)}>↑</button>
        <button onClick={() => move(list, index, 1, "/api/admin/theory/reorder").then(setList)}>↓</button>
        <button onClick={remove}>удалить</button>
      </div>
      <div className="theory-edit">
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Текст главы (markdown)" />
        <div className="md preview"><Markdown>{content}</Markdown></div>
      </div>
      {dirty && <button className="done-btn" onClick={save}>Сохранить главу</button>}
    </div>
  );
}

// kind: example — условие + разбор (без проверки ответа); practice — условие + ответ + необязательный разбор
function ProblemEditor({ p, index, list, setList, reload }) {
  const [statement, setStatement] = useState(p.statement_md);
  const [solution, setSolution] = useState(p.solution_md);
  const [explanation, setExplanation] = useState(p.explanation_md);
  const isPractice = p.kind === "practice";
  const dirty = statement !== p.statement_md || explanation !== p.explanation_md
    || (isPractice && solution !== p.solution_md);

  async function save() {
    await adminFetch(`/api/admin/problems/${p.id}`, {
      method: "PUT",
      body: JSON.stringify({
        statement_md: statement,
        explanation_md: explanation,
        ...(isPractice && { solution_md: solution }),
      }),
    });
    reload();
  }

  async function remove() {
    if (!confirm("Удалить задачу?")) return;
    await adminFetch(`/api/admin/problems/${p.id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="problem editor">
      <div className="row">
        <h3>Задача {index + 1}</h3>
        <span className="spacer" />
        <button onClick={() => move(list, index, -1, "/api/admin/problems/reorder").then(setList)}>↑</button>
        <button onClick={() => move(list, index, 1, "/api/admin/problems/reorder").then(setList)}>↓</button>
        <button onClick={remove}>удалить</button>
      </div>
      <textarea value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="Условие (markdown, LaTeX)" />
      {isPractice && (
        <textarea value={solution} onChange={(e) => setSolution(e.target.value)}
          placeholder="Правильный ответ (для проверки)" style={{ minHeight: 44 }} />
      )}
      <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)}
        placeholder={isPractice ? "Объяснение решения (необязательно, будет под катом)" : "Объяснение решения (будет под катом)"} />
      {dirty && <button className="done-btn" onClick={save}>Сохранить</button>}
    </div>
  );
}

export default function AdminTask() {
  const { id } = useParams();
  const [task, setTask] = useState(null);

  const reload = () =>
    fetch(`/api/tasks/${id}`).then((r) => r.json()).then(setTask);
  useEffect(() => { reload(); }, [id]);

  if (!task) return <main className="admin-page"><p>Загрузка…</p></main>;

  async function addSection() {
    await adminFetch("/api/admin/theory", {
      method: "POST",
      body: JSON.stringify({ task_id: Number(id) }),
    });
    reload();
  }

  async function addProblem(kind) {
    await adminFetch("/api/admin/problems", {
      method: "POST",
      body: JSON.stringify({ task_id: Number(id), kind }),
    });
    reload();
  }

  async function uploadImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const { url } = await adminFetch("/api/admin/upload", { method: "POST", body: form });
    prompt("Вставь это в markdown:", `![](${url})`);
    e.target.value = "";
  }

  return (
    <main className="admin-page">
      <h1>{task.title} — редактирование</h1>
      <p><Link href={`/admin/projects/${task.project_id}`}>← к заданиям проекта</Link></p>
      <p>
        Картинка: <input type="file" accept="image/*" onChange={uploadImage} />
      </p>

      <h2>Теория — главы</h2>
      {task.sections.map((s, i) => (
        <SectionEditor key={s.id} s={s} index={i} list={task.sections}
          setList={(next) => setTask({ ...task, sections: next })} reload={reload} />
      ))}
      <button onClick={addSection}>+ добавить главу</button>

      {[["example", "Задачи (с разбором решения)"], ["practice", "Тренировка (с проверкой ответа)"]].map(
        ([kind, title]) => {
          const list = kind === "example" ? task.examples : task.practice;
          const setList = (next) =>
            setTask({ ...task, [kind === "example" ? "examples" : "practice"]: next });
          return (
            <section key={kind}>
              <h2>{title}</h2>
              {list.map((p, i) => (
                <ProblemEditor key={p.id} p={p} index={i} list={list} setList={setList} reload={reload} />
              ))}
              <button onClick={() => addProblem(kind)}>+ добавить</button>
            </section>
          );
        }
      )}
    </main>
  );
}
