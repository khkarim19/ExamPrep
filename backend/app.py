import os
import secrets
import sqlite3
import uuid
from contextlib import closing
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, UploadFile
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).parent
DB_PATH = Path(os.environ.get("EGE_DB", ROOT / "ege.db"))
UPLOADS = ROOT / "static" / "uploads"
# ponytail: дефолт для локальной разработки, в проде задать ADMIN_PASSWORD
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin")


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def q(sql, args=()):
    """SELECT: список строк."""
    with closing(db()) as c:
        return c.execute(sql, args).fetchall()


def w(sql, args=(), many=False):
    """Запись в своей транзакции; возвращает курсор (rowcount, lastrowid)."""
    with closing(db()) as c, c:  # closing закрывает соединение, `with c` коммитит/откатывает
        return (c.executemany if many else c.execute)(sql, args)


def init_db():
    with closing(db()) as c:
        c.executescript((ROOT / "schema.sql").read_text())
    # ponytail: миграция БД, созданных до поля user_note.
    # Удалить, когда локальная БД и docker-том хотя бы раз стартовали с этим кодом.
    if "user_note" not in [r["name"] for r in q("PRAGMA table_info(problems)")]:
        w("ALTER TABLE problems ADD COLUMN user_note TEXT NOT NULL DEFAULT ''")


init_db()
UPLOADS.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="EGE prep")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")

security = HTTPBasic()


def admin(creds: HTTPBasicCredentials = Depends(security)):
    if not secrets.compare_digest(creds.password.encode(), ADMIN_PASSWORD.encode()):
        raise HTTPException(401, "Неверный пароль", headers={"WWW-Authenticate": "Basic"})


def progress_of():
    """Прогресс заданий: функция task_id -> {theory, problems, practice}.
    Теория зачтена, когда прочитаны все её главы (без глав — не зачтена)."""
    done = {}
    for r in q("SELECT task_id, section FROM progress WHERE done = 1"):
        done.setdefault(r["task_id"], set()).add(r["section"])
    theory = {r["task_id"]: r["r"] == r["c"] for r in q(
        "SELECT task_id, COUNT(*) c, SUM(read) r FROM theory_sections GROUP BY task_id")}
    return lambda tid: {"theory": theory.get(tid, False),
                        "problems": "problems" in done.get(tid, ()),
                        "practice": "practice" in done.get(tid, ())}


def reorder(table, ids):
    w(f"UPDATE {table} SET sort_order = ? WHERE id = ?", [(i, x) for i, x in enumerate(ids, 1)], many=True)
    return {"ok": True}


def delete(table, row_id):
    w(f"DELETE FROM {table} WHERE id = ?", (row_id,))
    return {"ok": True}


# ---------- публичное API ----------

@app.get("/api/projects")
def list_projects():
    """Реестр проектов: число заданий и пройденных пунктов (по 3 на задание)."""
    progress = progress_of()
    stats = {}
    for t in q("SELECT id, project_id FROM tasks"):
        s = stats.setdefault(t["project_id"], {"tasks": 0, "done": 0})
        s["tasks"] += 1
        s["done"] += sum(progress(t["id"]).values())
    return [{**dict(p), **stats.get(p["id"], {"tasks": 0, "done": 0})}
            for p in q("SELECT * FROM projects ORDER BY sort_order")]


@app.get("/api/projects/{project_id}")
def get_project(project_id: int):
    rows = q("SELECT * FROM projects WHERE id = ?", (project_id,))
    if not rows:
        raise HTTPException(404)
    progress = progress_of()
    return {**dict(rows[0]),
            "tasks": [{**dict(t), "progress": progress(t["id"])} for t in q(
                "SELECT id, title, sort_order FROM tasks WHERE project_id = ? ORDER BY sort_order",
                (project_id,))]}


@app.get("/api/tasks/{task_id}")
def get_task(task_id: int):
    rows = q("SELECT * FROM tasks WHERE id = ?", (task_id,))
    if not rows:
        raise HTTPException(404)
    probs = [dict(p) for p in q("SELECT * FROM problems WHERE task_id = ? ORDER BY sort_order", (task_id,))]
    return {**dict(rows[0]),
            "progress": progress_of()(task_id),
            "sections": [dict(s) for s in q(
                "SELECT * FROM theory_sections WHERE task_id = ? ORDER BY sort_order", (task_id,))],
            "examples": [p for p in probs if p["kind"] == "example"],
            "practice": [p for p in probs if p["kind"] == "practice"],
            "glossary": [dict(g) for g in q(
                "SELECT id, term, definition FROM glossary WHERE task_id = ? ORDER BY id", (task_id,))]}


class ProgressIn(BaseModel):
    # теория зачитывается автоматически по главам, вручную двигаются только эти две
    section: Literal["problems", "practice"]
    done: bool


@app.put("/api/tasks/{task_id}/progress")
def set_progress(task_id: int, p: ProgressIn):
    if p.section == "practice" and p.done:
        # тренировку нельзя завершить, пока не зафиксированы верные ответы на все задачи с ответом
        left = q("SELECT COUNT(*) FROM problems WHERE task_id = ? AND kind = 'practice' "
                 "AND solution_md != '' AND solved = 0", (task_id,))[0][0]
        if left:
            raise HTTPException(409, f"Не решено задач тренировки: {left}")
    try:
        w("""INSERT INTO progress (task_id, section, done) VALUES (?, ?, ?)
             ON CONFLICT(task_id, section) DO UPDATE SET done = excluded.done""",
          (task_id, p.section, int(p.done)))
    except sqlite3.IntegrityError:
        raise HTTPException(404, "Нет такого задания")
    return {"ok": True}


class DoneIn(BaseModel):
    done: bool


class NoteIn(BaseModel):
    text: str = Field(max_length=20000)


@app.put("/api/problems/{problem_id}/note")
def set_problem_note(problem_id: int, n: NoteIn):
    """Решение пользователя к задаче — поле справа с кнопкой «Зафиксировать»."""
    if not w("UPDATE problems SET user_note = ? WHERE id = ?", (n.text, problem_id)).rowcount:
        raise HTTPException(404)
    return {"ok": True}


@app.put("/api/problems/{problem_id}/solved")
def set_problem_solved(problem_id: int, r: DoneIn):
    # ponytail: ответ проверяет клиент (он и так получает solution_md); сервер только запоминает результат
    if not w("UPDATE problems SET solved = ? WHERE id = ? AND kind = 'practice'",
             (int(r.done), problem_id)).rowcount:
        raise HTTPException(404)
    return {"ok": True}


# ---------- словарь задания (CRUD на сайте, как и записи решений) ----------

class GlossaryIn(BaseModel):
    term: str = Field(min_length=1, max_length=200)
    definition: str = Field(default="", max_length=5000)


class GlossaryPatch(BaseModel):
    term: str | None = Field(default=None, min_length=1, max_length=200)
    definition: str | None = Field(default=None, max_length=5000)


def glossary_term(task_id, term, exclude_id=None):
    """Выражение без пробелов по краям; одно и то же выражение в задании — один раз (без учёта регистра)."""
    term = term.strip()
    if not term:
        raise HTTPException(422, "Выражение не может быть пустым")
    # ponytail: сравнение в Python — SQLite-овский NOCASE не понимает кириллицу; терминов в задании мало
    if any(r["id"] != exclude_id and r["term"].casefold() == term.casefold()
           for r in q("SELECT id, term FROM glossary WHERE task_id = ?", (task_id,))):
        raise HTTPException(409, "Такое выражение уже есть в словаре")
    return term


@app.post("/api/tasks/{task_id}/glossary", status_code=201)
def create_glossary_entry(task_id: int, g: GlossaryIn):
    term = glossary_term(task_id, g.term)
    try:
        cur = w("INSERT INTO glossary (task_id, term, definition) VALUES (?, ?, ?)",
                (task_id, term, g.definition.strip()))
    except sqlite3.IntegrityError:
        raise HTTPException(404, "Нет такого задания")
    return {"id": cur.lastrowid, "term": term, "definition": g.definition.strip()}


@app.put("/api/glossary/{entry_id}")
def update_glossary_entry(entry_id: int, g: GlossaryPatch):
    rows = q("SELECT task_id FROM glossary WHERE id = ?", (entry_id,))
    if not rows:
        raise HTTPException(404)
    term = None if g.term is None else glossary_term(rows[0]["task_id"], g.term, exclude_id=entry_id)
    definition = None if g.definition is None else g.definition.strip()
    w("UPDATE glossary SET term = COALESCE(?, term), definition = COALESCE(?, definition) WHERE id = ?",
      (term, definition, entry_id))
    return dict(q("SELECT id, term, definition FROM glossary WHERE id = ?", (entry_id,))[0])


@app.delete("/api/glossary/{entry_id}")
def delete_glossary_entry(entry_id: int):
    return delete("glossary", entry_id)


@app.put("/api/theory/{section_id}/read")
def set_section_read(section_id: int, r: DoneIn):
    if not w("UPDATE theory_sections SET read = ? WHERE id = ?", (int(r.done), section_id)).rowcount:
        raise HTTPException(404)
    return {"ok": True}


# ---------- админка ----------

class TitleIn(BaseModel):
    title: str | None = None


class TaskCreate(BaseModel):
    project_id: int
    title: str | None = None


class ProblemCreate(BaseModel):
    task_id: int
    kind: Literal["example", "practice"]
    statement_md: str = ""
    solution_md: str = ""
    explanation_md: str = ""


class ProblemIn(BaseModel):
    statement_md: str | None = None
    solution_md: str | None = None
    explanation_md: str | None = None


class Ids(BaseModel):
    ids: list[int]


# reorder-роуты объявлены раньше роутов с {id}, чтобы литерал матчился первым
@app.put("/api/admin/projects/reorder", dependencies=[Depends(admin)])
def reorder_projects(body: Ids):
    return reorder("projects", body.ids)


@app.post("/api/admin/projects", dependencies=[Depends(admin)])
def create_project(p: TitleIn):
    order = q("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM projects")[0][0]
    cur = w("INSERT INTO projects (title, sort_order) VALUES (?, ?)", (p.title or "Новый проект", order))
    return {"id": cur.lastrowid}


@app.put("/api/admin/projects/{project_id}", dependencies=[Depends(admin)])
def update_project(project_id: int, p: TitleIn):
    if not w("UPDATE projects SET title = COALESCE(?, title) WHERE id = ?", (p.title, project_id)).rowcount:
        raise HTTPException(404)
    return {"ok": True}


@app.delete("/api/admin/projects/{project_id}", dependencies=[Depends(admin)])
def delete_project(project_id: int):
    return delete("projects", project_id)  # каскадом: задания → главы, задачи, прогресс


@app.put("/api/admin/tasks/reorder", dependencies=[Depends(admin)])
def reorder_tasks(body: Ids):
    return reorder("tasks", body.ids)


@app.post("/api/admin/tasks", dependencies=[Depends(admin)])
def create_task(t: TaskCreate):
    order = q("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks WHERE project_id = ?",
              (t.project_id,))[0][0]
    try:
        cur = w("INSERT INTO tasks (project_id, title, sort_order) VALUES (?, ?, ?)",
                (t.project_id, t.title or "Новое задание", order))
    except sqlite3.IntegrityError:
        raise HTTPException(404, "Нет такого проекта")
    return {"id": cur.lastrowid}


@app.put("/api/admin/tasks/{task_id}", dependencies=[Depends(admin)])
def update_task(task_id: int, t: TitleIn):
    if not w("UPDATE tasks SET title = COALESCE(?, title) WHERE id = ?", (t.title, task_id)).rowcount:
        raise HTTPException(404)
    return {"ok": True}


@app.delete("/api/admin/tasks/{task_id}", dependencies=[Depends(admin)])
def delete_task(task_id: int):
    return delete("tasks", task_id)


class SectionCreate(BaseModel):
    task_id: int
    title: str = "Новая глава"
    content_md: str = ""


class SectionIn(BaseModel):
    title: str | None = None
    content_md: str | None = None
    parent_id: int | None = None  # None в fields_set = «сделать корнем»


@app.put("/api/admin/theory/reorder", dependencies=[Depends(admin)])
def reorder_sections(body: Ids):
    return reorder("theory_sections", body.ids)


@app.post("/api/admin/theory", dependencies=[Depends(admin)])
def create_section(s: SectionCreate):
    order = q("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM theory_sections WHERE task_id = ?",
              (s.task_id,))[0][0]
    try:
        cur = w("INSERT INTO theory_sections (task_id, title, content_md, sort_order) VALUES (?, ?, ?, ?)",
                (s.task_id, s.title, s.content_md, order))
    except sqlite3.IntegrityError:
        raise HTTPException(404, "Нет такого задания")
    return {"id": cur.lastrowid}


@app.put("/api/admin/theory/{section_id}", dependencies=[Depends(admin)])
def update_section(section_id: int, s: SectionIn):
    set_parent = "parent_id" in s.model_fields_set
    if set_parent and s.parent_id is not None:
        me = q("SELECT task_id FROM theory_sections WHERE id = ?", (section_id,))
        parent = q("SELECT task_id FROM theory_sections WHERE id = ?", (s.parent_id,))
        if not me or not parent or me[0]["task_id"] != parent[0]["task_id"]:
            raise HTTPException(400, "Родитель должен быть главой того же задания")
        cur_id = s.parent_id
        for _ in range(100):  # защита от цикла в связях
            if cur_id == section_id:
                raise HTTPException(400, "Связь создаёт цикл")
            row = q("SELECT parent_id FROM theory_sections WHERE id = ?", (cur_id,))
            cur_id = row[0]["parent_id"] if row else None
            if cur_id is None:
                break
    if not w("UPDATE theory_sections SET title = COALESCE(?, title), content_md = COALESCE(?, content_md), "
             "parent_id = CASE WHEN ? THEN ? ELSE parent_id END WHERE id = ?",
             (s.title, s.content_md, set_parent, s.parent_id, section_id)).rowcount:
        raise HTTPException(404)
    return {"ok": True}


@app.delete("/api/admin/theory/{section_id}", dependencies=[Depends(admin)])
def delete_section(section_id: int):
    return delete("theory_sections", section_id)


@app.put("/api/admin/problems/reorder", dependencies=[Depends(admin)])
def reorder_problems(body: Ids):
    return reorder("problems", body.ids)


@app.post("/api/admin/problems", dependencies=[Depends(admin)])
def create_problem(p: ProblemCreate):
    order = q("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM problems WHERE task_id = ?",
              (p.task_id,))[0][0]
    try:
        cur = w("INSERT INTO problems (task_id, kind, statement_md, solution_md, explanation_md, sort_order) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (p.task_id, p.kind, p.statement_md, p.solution_md, p.explanation_md, order))
    except sqlite3.IntegrityError:
        raise HTTPException(404, "Нет такого задания")
    return {"id": cur.lastrowid}


@app.put("/api/admin/problems/{problem_id}", dependencies=[Depends(admin)])
def update_problem(problem_id: int, p: ProblemIn):
    if not w(
        # смена правильного ответа обнуляет зафиксированное решение
        "UPDATE problems SET solved = CASE WHEN ?1 IS NOT NULL AND ?1 != solution_md THEN 0 ELSE solved END, "
        "statement_md = COALESCE(?2, statement_md), solution_md = COALESCE(?1, solution_md), "
        "explanation_md = COALESCE(?3, explanation_md) WHERE id = ?4",
        (p.solution_md, p.statement_md, p.explanation_md, problem_id)).rowcount:
        raise HTTPException(404)
    return {"ok": True}


@app.delete("/api/admin/problems/{problem_id}", dependencies=[Depends(admin)])
def delete_problem(problem_id: int):
    return delete("problems", problem_id)


@app.post("/api/admin/upload", dependencies=[Depends(admin)])
async def upload(file: UploadFile):
    ext = Path(file.filename or "").suffix[:10]  # suffix не содержит слэшей — имя безопасно
    name = uuid.uuid4().hex + ext
    (UPLOADS / name).write_bytes(await file.read())
    return {"url": f"/static/uploads/{name}"}
