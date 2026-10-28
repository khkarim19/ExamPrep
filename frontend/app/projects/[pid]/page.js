"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Shell, Ring, doneCount, percentOf } from "../../ui";

// главная проекта: статистика и все задания
export default function ProjectHome() {
  const { pid } = useParams();
  const [project, setProject] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${pid}`).then((r) => (r.ok ? r.json() : null))
      .then((p) => (p ? setProject(p) : setMissing(true)));
  }, [pid]);

  if (missing) {
    return <main className="admin-page"><p>Проект не найден. <Link href="/">← ко всем проектам</Link></p></main>;
  }

  const tasks = project?.tasks || [];
  const total = tasks.length * 3;
  const done = tasks.reduce((n, t) => n + doneCount(t.progress), 0);
  const percent = percentOf(done, total);
  const fullyDone = tasks.filter((t) => doneCount(t.progress) === 3).length;

  return (
    <Shell project={project} activeId={null} kicker="Проект" title={project?.title || "…"}>
      <div className="home-view">
        <div className="stats">
          <div className="stat-card">
            <div className="stat-label">Готовность</div>
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
        {project && tasks.length === 0 && (
          <p className="empty">В проекте пока нет заданий — добавьте их в <Link href={`/admin/projects/${pid}`}>админке</Link>.</p>
        )}
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
        <p><Link className="admin-link" href={`/admin/projects/${pid}`}>редактировать проект</Link></p>
      </div>
    </Shell>
  );
}
