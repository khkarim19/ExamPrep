"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell, Ring, doneCount } from "./ui";

export default function Home() {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    fetch("/api/tasks").then((r) => r.json()).then(setTasks);
  }, []);

  const total = tasks.length * 3;
  const done = tasks.reduce((n, t) => n + doneCount(t.progress), 0);
  const percent = total ? Math.round((done / total) * 100) : 0;
  const fullyDone = tasks.filter((t) => doneCount(t.progress) === 3).length;

  return (
    <Shell tasks={tasks} activeId={null} kicker="Обзор" title="Главная">
      <div className="home-view">
        <div className="stats">
          <div className="stat-card">
            <div className="stat-label">Готовность к экзамену</div>
            <div className="stat-row">
              <span className="stat-big accent">{percent}%</span>
              <span className="stat-sub">{done} из {total} пунктов</span>
            </div>
            <div className="bar big"><div style={{ width: percent + "%" }} /></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Полностью пройдено</div>
            <div className="stat-big">{fullyDone}<span className="stat-frac"> / {tasks.length} заданий</span></div>
          </div>
        </div>

        <div className="section-label">Все задания</div>
        <div className="card-grid">
          {tasks.map((t, i) => (
            <Link key={t.id} href={`/tasks/${t.id}`} className="task-card">
              <span className="nav-text">
                <span className="card-num">Задание {i + 1}</span>
                <span className="nav-title">{t.title}</span>
              </span>
              <Ring progress={t.progress} hole="var(--card-bg)" />
            </Link>
          ))}
        </div>
        <p><Link className="admin-link" href="/admin">админка</Link></p>
      </div>
    </Shell>
  );
}
