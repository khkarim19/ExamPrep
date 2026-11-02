"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// единый рендер markdown с LaTeX-формулами: $...$ инлайн, $$...$$ блоком
export function MD({ children }) {
  return (
    <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {children}
    </Markdown>
  );
}

// progress = {theory, problems, practice} — три булевых флага
export const doneCount = (p) => Object.values(p).filter(Boolean).length;

export function Ring({ progress, hole }) {
  const n = doneCount(progress);
  if (n === 3) return <span className="tick">✓</span>;
  const deg = (n / 3) * 360;
  return (
    <span className="ring" style={{
      background: n ? `conic-gradient(var(--accent) 0deg ${deg}deg, var(--track) ${deg}deg 360deg)` : "var(--track)",
      "--hole": hole,
    }} />
  );
}

export function ThemeToggle() {
  const [theme, setThemeState] = useState("dark");
  useEffect(() => { setThemeState(document.documentElement.dataset.theme || "dark"); }, []);
  const setTheme = (t) => {
    try { localStorage.setItem("examTheme", t); } catch {}
    document.documentElement.dataset.theme = t;
    setThemeState(t);
  };
  return (
    <div className="theme-toggle">
      <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")} title="Светлая тема">☀</button>
      <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")} title="Тёмная тема">☾</button>
    </div>
  );
}

export const percentOf = (done, total) => (total ? Math.round((done / total) * 100) : 0);

// свёрнутость меню живёт в <html data-sidebar> (его выставляет layout.js до отрисовки);
// состояние React нужно только для подписи и aria-expanded кнопки
function useSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setCollapsed(document.documentElement.dataset.sidebar === "collapsed"); }, []);
  const toggle = () => {
    const next = !collapsed;
    document.documentElement.dataset.sidebar = next ? "collapsed" : "open";
    try { localStorage.setItem("sidebar", next ? "collapsed" : "open"); } catch {}
    setCollapsed(next);
  };
  return [collapsed, toggle];
}

// project = {id, title, tasks[]} из /api/projects/{id}; пока грузится — null
export function Shell({ project, activeId, kicker, title, children }) {
  const tasks = project?.tasks || [];
  const percent = percentOf(tasks.reduce((n, t) => n + doneCount(t.progress), 0), tasks.length * 3);
  const [collapsed, toggleSidebar] = useSidebar();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-head">
          <Link href="/" className="brand" title="Все проекты">
            <span className="brand-mark" /><span className="brand-text">Подготовка</span>
          </Link>
          {project && (
            <Link href={`/projects/${project.id}`} title="Главная проекта"
              className={"project-link" + (activeId == null ? " active" : "")}>{project.title}</Link>
          )}
          <div className="overall"><span>Прогресс проекта</span><b>{percent}%</b></div>
          <div className="bar"><div style={{ width: percent + "%" }} /></div>
        </div>
        <nav className="task-nav">
          {tasks.map((t, i) => (
            <Link key={t.id} href={`/tasks/${t.id}`} className={t.id === activeId ? "active" : ""}
              title={`Задание ${i + 1}. ${t.title}`}>
              <span className="nav-text">
                <span className="nav-num">Задание {i + 1}</span>
                <span className="nav-title">{t.title}</span>
              </span>
              <span className="nav-idx">{i + 1}</span>
              <Ring progress={t.progress} hole="var(--sidebar-bg)" />
            </Link>
          ))}
        </nav>
        <button className="sidebar-toggle" onClick={toggleSidebar} aria-expanded={!collapsed}
          title={collapsed ? "Развернуть меню" : "Свернуть меню"}
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}>
          <span className="chev">‹</span>
        </button>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            <div className="kicker">{kicker}</div>
            <div className="topbar-title">{title}</div>
          </div>
          <ThemeToggle />
        </header>
        <div className="scroll">{children}</div>
      </div>
    </div>
  );
}
