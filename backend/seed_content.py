# Загрузчик учебных проектов из content/<префикс>*.py (по файлу на тему, порядок — по имени файла).
# Заполняет проект с указанным названием (создаёт, если его нет): задания проекта заменяются,
# их прогресс сбрасывается; id и место проекта в реестре сохраняются, другие проекты не трогает.
# Запуск:  venv/bin/python seed_content.py <проект> [--check]
# Docker:  docker compose up -d --build backend && docker compose exec backend python seed_content.py <проект>
import importlib
import sys
from contextlib import closing
from pathlib import Path

from app import db

try:
    # ключ → (название проекта, префикс файлов в content/, разрешены ли LaTeX-формулы);
    # файл локальный, в git не входит
    from content.projects import PROJECTS
except ImportError:
    sys.exit("нет backend/content/projects.py с реестром PROJECTS")


def load_topics(prefix):
    files = sorted((Path(__file__).parent / "content").glob(f"{prefix}*.py"))
    return [importlib.import_module(f"content.{p.stem}").TOPIC for p in files]


def check(topics, latex):
    """Самопроверка контента до записи в БД: структура, связи mind map, формат ответов, формулы."""
    assert topics, "нет файлов с темами"
    for t in topics:
        name, secs = t["title"], t["sections"]
        assert secs and t["examples"] and t["practice"], f"{name}: нужны теория, задачи и тренировка"
        for i, (title, _, parent) in enumerate(secs):
            # родитель — только более ранняя глава: так связи гарантированно без циклов
            assert parent is None or 0 <= parent < i, f"{name} / {title}: родитель {parent}"
        texts = [s[1] for s in secs] + [x for e in t["examples"] for x in e] + [x for p in t["practice"] for x in p]
        for x in texts:
            if latex:  # непарный $ «съест» текст до следующего $
                assert x.count("$") % 2 == 0, f"{name}: непарный $ в «{x.strip()[:50]}…»"
            else:
                assert "$" not in x, f"{name}: символ $ включит LaTeX-разметку"
        for q, answer, _ in t["practice"]:
            # фронтенд сравнивает trim().toLowerCase() с заменой первой запятой — держим ответы простыми
            assert answer and answer == answer.strip().lower() and not any(c in answer for c in " ,"), \
                f"{name}: ответ «{answer}» на «{q.strip()[:40]}…»"


def seed(title, topics):
    with closing(db()) as c, c:
        row = c.execute("SELECT id FROM projects WHERE title = ?", (title,)).fetchone()
        if row:  # проект уже заведён — сохраняем его id и место в реестре, заменяем только задания
            pid = row[0]
            c.execute("DELETE FROM tasks WHERE project_id = ?", (pid,))  # каскадом — главы, задачи, прогресс
        else:
            order = c.execute("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM projects").fetchone()[0]
            pid = c.execute("INSERT INTO projects (title, sort_order) VALUES (?, ?)", (title, order)).lastrowid
        for i, t in enumerate(topics, 1):
            tid = c.execute("INSERT INTO tasks (project_id, title, sort_order) VALUES (?, ?, ?)",
                            (pid, t["title"], i)).lastrowid
            ids = []
            for n, (sec_title, md, parent) in enumerate(t["sections"], 1):
                ids.append(c.execute(
                    "INSERT INTO theory_sections (task_id, title, content_md, sort_order, parent_id) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (tid, sec_title, md.strip(), n, None if parent is None else ids[parent])).lastrowid)
            c.executemany(
                "INSERT INTO problems (task_id, kind, statement_md, explanation_md, sort_order) "
                "VALUES (?, 'example', ?, ?, ?)",
                [(tid, q.strip(), e.strip(), n) for n, (q, e) in enumerate(t["examples"], 1)])
            c.executemany(
                "INSERT INTO problems (task_id, kind, statement_md, solution_md, explanation_md, sort_order) "
                "VALUES (?, 'practice', ?, ?, ?, ?)",
                [(tid, q.strip(), a, e.strip(), n) for n, (q, a, e) in enumerate(t["practice"], 1)])
    print(f"«{title}»: {len(topics)} тем, "
          f"{sum(len(t['sections']) for t in topics)} глав, "
          f"{sum(len(t['examples']) for t in topics)} задач, "
          f"{sum(len(t['practice']) for t in topics)} вопросов тренировки")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--check"]
    if len(args) != 1 or args[0] not in PROJECTS:
        sys.exit(f"использование: seed_content.py <{'|'.join(PROJECTS)}> [--check]")
    title, prefix, latex = PROJECTS[args[0]]
    topics = load_topics(prefix)
    check(topics, latex)
    if "--check" in sys.argv:
        print(f"content ok: «{title}», тем: {len(topics)}")
    else:
        seed(title, topics)
