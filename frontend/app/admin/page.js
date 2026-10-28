"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch, move } from "./api";

// реестр проектов: создание, переименование, порядок, удаление
export default function AdminProjects() {
  const [projects, setProjects] = useState([]);

  const load = () => fetch("/api/projects").then((r) => r.json()).then(setProjects);
  useEffect(() => { load(); }, []);

  async function addProject() {
    const title = prompt("Название проекта:", "Новый проект");
    if (!title) return;
    await adminFetch("/api/admin/projects", { method: "POST", body: JSON.stringify({ title }) });
    load();
  }

  async function rename(p) {
    const title = prompt("Новое название:", p.title);
    if (!title || title === p.title) return;
    await adminFetch(`/api/admin/projects/${p.id}`, { method: "PUT", body: JSON.stringify({ title }) });
    load();
  }

  async function remove(p) {
    if (!confirm(`Удалить проект «${p.title}» вместе с заданиями (${p.tasks}), теорией, задачами и прогрессом?`)) return;
    await adminFetch(`/api/admin/projects/${p.id}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="admin-page">
      <h1>Админка — проекты</h1>
      <p><Link href="/">← на сайт</Link></p>
      {projects.length === 0 && <p className="empty">Проектов пока нет.</p>}
      <ul className="admin-list">
        {projects.map((p, i) => (
          <li key={p.id}>
            <button onClick={() => move(projects, i, -1, "/api/admin/projects/reorder").then(setProjects)}>↑</button>
            <button onClick={() => move(projects, i, 1, "/api/admin/projects/reorder").then(setProjects)}>↓</button>
            <Link href={`/admin/projects/${p.id}`}>{p.title}</Link>
            <span className="empty">заданий: {p.tasks}</span>
            <span className="spacer" />
            <button onClick={() => rename(p)}>переименовать</button>
            <button onClick={() => remove(p)}>удалить</button>
          </li>
        ))}
      </ul>
      <button className="done-btn" onClick={addProject}>+ Добавить проект</button>
    </main>
  );
}
