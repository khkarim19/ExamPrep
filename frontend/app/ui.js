"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { GlossaryDrawer } from "./glossary";

// единый рендер markdown с LaTeX-формулами: $...$ инлайн, $$...$$ блоком
export function MD({ children }) {
  return (
    <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {children}
    </Markdown>
  );
}

// один набор линейных иконок (контуры lucide), один размер и толщина линии — вместо символов ✓ ← ▾ ☀
const ICONS = {
  check: <path d="M20 6 9 17l-5-5" />,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  "chevron-left": <path d="m15 18-6-6 6-6" />,
  "chevron-right": <path d="m9 18 6-6-6-6" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "arrow-left": <><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>,
  "arrow-right": <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  "arrow-up": <><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></>,
  "arrow-down": <><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>,
  plus: <><path d="M5 12h14" /><path d="M12 5v14" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" /></>,
  moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  book: <><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></>,
};

export function Icon({ name, size = 16, label }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined}>
      {ICONS[name]}
    </svg>
  );
}

// progress = {theory, problems, practice} — три булевых флага
export const doneCount = (p) => Object.values(p).filter(Boolean).length;

export function Ring({ progress, hole }) {
  const n = doneCount(progress);
  if (n === 3) return <span className="tick"><Icon name="check" size={18} label="Пройдено" /></span>;
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
      <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")} title="Светлая тема"
        aria-label="Светлая тема" aria-pressed={theme === "light"}><Icon name="sun" /></button>
      <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")} title="Тёмная тема"
        aria-label="Тёмная тема" aria-pressed={theme === "dark"}><Icon name="moon" /></button>
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
  const [glossaryOpen, setGlossaryOpen] = useState(false);

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
          <Icon name="chevron-left" />
        </button>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            <div className="kicker">{kicker}</div>
            <div className="topbar-title">{title}</div>
          </div>
          <div className="topbar-actions">
            {project && (
              <button className="topbar-btn" onClick={() => setGlossaryOpen(true)}><Icon name="book" />Словарь</button>
            )}
            <ThemeToggle />
          </div>
        </header>
        <div className="scroll">{children}</div>
        {glossaryOpen && project && <GlossaryDrawer projectId={project.id} onClose={() => setGlossaryOpen(false)} />}
      </div>
    </div>
  );
}
