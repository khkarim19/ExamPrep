"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch, move } from "./api";

export default function AdminHome() {
  const [tasks, setTasks] = useState([]);

  const load = () => fetch("/api/tasks").then((r) => r.json()).then(setTasks);
  useEffect(() => { load(); }, []);

  async function addTask() {
    const title = prompt("Название задания:", `Задание ${tasks.length + 1}`);
    if (!title) return;
    await adminFetch("/api/admin/tasks", { method: "POST", body: JSON.stringify({ title }) });
    load();
  }

  async function rename(t) {
    const title = prompt("Новое название:", t.title);
    if (!title || title === t.title) return;
    await adminFetch(`/api/admin/tasks/${t.id}`, { method: "PUT", body: JSON.stringify({ title }) });
    load();
  }

  async function remove(t) {
    if (!confirm(`Удалить «${t.title}» со всеми задачами и прогрессом?`)) return;
    await adminFetch(`/api/admin/tasks/${t.id}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="admin-page">
      <h1>Админка</h1>
      <p><Link href="/">← на сайт</Link></p>
      <ul className="admin-list">
        {tasks.map((t, i) => (
          <li key={t.id}>
            <button onClick={() => move(tasks, i, -1, "/api/admin/tasks/reorder").then(setTasks)}>↑</button>
            <button onClick={() => move(tasks, i, 1, "/api/admin/tasks/reorder").then(setTasks)}>↓</button>
            <Link href={`/admin/tasks/${t.id}`}>{i + 1}. {t.title}</Link>
            <span className="spacer" />
            <button onClick={() => rename(t)}>переименовать</button>
            <button onClick={() => remove(t)}>удалить</button>
          </li>
        ))}
      </ul>
      <button className="done-btn" onClick={addTask}>+ Добавить задание</button>
    </main>
  );
}
