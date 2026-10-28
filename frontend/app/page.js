"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeToggle, percentOf } from "./ui";

// реестр проектов
export default function Projects() {
  const [projects, setProjects] = useState(null);

  useEffect(() => {
    fetch("/api/projects").then((r) => r.json()).then(setProjects);
  }, []);

  return (
    <div className="registry">
      <header className="topbar">
        <div>
          <div className="kicker">Подготовка</div>
          <div className="topbar-title">Проекты</div>
        </div>
        <ThemeToggle />
      </header>
      <div className="home-view">
        {projects?.length === 0 && (
          <p className="empty">Проектов пока нет — создайте первый в <Link href="/admin">админке</Link>.</p>
        )}
        <div className="card-grid">
          {projects?.map((p) => {
            const percent = percentOf(p.done, p.tasks * 3);
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="stat-card project-card">
                <div className="project-title">{p.title}</div>
                <div className="stat-row">
                  <span className="stat-big accent">{percent}%</span>
                  <span className="stat-sub">заданий: {p.tasks}</span>
                </div>
                <div className="bar"><div style={{ width: percent + "%" }} /></div>
              </Link>
            );
          })}
        </div>
        <p><Link className="admin-link" href="/admin">админка</Link></p>
      </div>
    </div>
  );
}
