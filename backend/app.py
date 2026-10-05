import os
import secrets
import sqlite3
import uuid
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, UploadFile
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).parent
DB_PATH = Path(os.environ.get("EGE_DB", ROOT / "ege.db"))
UPLOADS = ROOT / "static" / "uploads"
# ponytail: дефолт для локальной разработки, в проде задать ADMIN_PASSWORD
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin")

Kind = Literal["example", "practice"]


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = db()
    conn.executescript((ROOT / "schema.sql").read_text())
    # миграция для БД, созданных до появления parent_id
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(theory_sections)")]
    if "parent_id" not in cols:
        conn.execute("ALTER TABLE theory_sections ADD COLUMN parent_id INTEGER "
                     "REFERENCES theory_sections(id) ON DELETE SET NULL")
    if conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 0:
        conn.executemany(
            "INSERT INTO tasks (title, sort_order) VALUES (?, ?)",
            [(f"Задание {i}", i) for i in range(1, 20)],
        )
    conn.commit()
    conn.close()


init_db()
UPLOADS.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="EGE prep")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")

security = HTTPBasic()


def admin(creds: HTTPBasicCredentials = Depends(security)):
    if not secrets.compare_digest(creds.password.encode(), ADMIN_PASSWORD.encode()):
        raise HTTPException(401, "Неверный пароль", headers={"WWW-Authenticate": "Basic"})


def progress_map(conn, task_id=None):
    q = "SELECT task_id, section FROM progress WHERE done = 1"
    rows = conn.execute(q + (" AND task_id = ?" if task_id else ""),
                        (task_id,) if task_id else ()).fetchall()
    done = {}
    for r in rows:
        done.setdefault(r["task_id"], set()).add(r["section"])
    return done


def theory_map(conn):
    # теория зачтена, когда прочитаны все её главы; без глав — не зачтена
    return {r["task_id"]: r["r"] == r["c"] for r in conn.execute(
        "SELECT task_id, COUNT(*) c, SUM(read) r FROM theory_sections GROUP BY task_id")}


def full_progress(done_sections, theory_done):
    return {"theory": theory_done,
            "problems": "problems" in done_sections,
            "practice": "practice" in done_sections}


# ---------- публичное API ----------

@app.get("/api/tasks")
def list_tasks():
    conn = db()
    tasks = conn.execute("SELECT id, title, sort_order FROM tasks ORDER BY sort_order").fetchall()
    done = progress_map(conn)
    tmap = theory_map(conn)
    conn.close()
    return [{**dict(t), "progress": full_progress(done.get(t["id"], ()), tmap.get(t["id"], False))}
            for t in tasks]


@app.get("/api/tasks/{task_id}")
def get_task(task_id: int):
    conn = db()
    t = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not t:
        conn.close()
        raise HTTPException(404)
    probs = [dict(p) for p in conn.execute(
        "SELECT * FROM problems WHERE task_id = ? ORDER BY sort_order", (task_id,))]
    sections = [dict(s) for s in conn.execute(
        "SELECT * FROM theory_sections WHERE task_id = ? ORDER BY sort_order", (task_id,))]
    done = progress_map(conn, task_id).get(task_id, ())
    conn.close()
    theory_done = bool(sections) and all(s["read"] for s in sections)
    return {**dict(t),
            "progress": full_progress(done, theory_done),
            "sections": sections,
            "examples": [p for p in probs if p["kind"] == "example"],
            "practice": [p for p in probs if p["kind"] == "practice"]}


class ProgressIn(BaseModel):
    # теория зачитывается автоматически по главам, вручную двигаются только эти две
    section: Literal["problems", "practice"]
    done: bool


@app.put("/api/tasks/{task_id}/progress")
def set_progress(task_id: int, p: ProgressIn):
    conn = db()
    try:
        conn.execute(
            """INSERT INTO progress (task_id, section, done) VALUES (?, ?, ?)
               ON CONFLICT(task_id, section) DO UPDATE SET done = excluded.done""",
            (task_id, p.section, int(p.done)))
        conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(404, "Нет такого задания")
    finally:
        conn.close()
    return {"ok": True}


class ReadIn(BaseModel):
    done: bool


@app.put("/api/theory/{section_id}/read")
def set_section_read(section_id: int, r: ReadIn):
    conn = db()
    cur = conn.execute("UPDATE theory_sections SET read = ? WHERE id = ?",
                       (int(r.done), section_id))
    conn.commit()
    conn.close()
    if not cur.rowcount:
        raise HTTPException(404)
    return {"ok": True}


# ---------- админка ----------

class TaskIn(BaseModel):
    title: str | None = None
    theory_md: str | None = None


class ProblemCreate(BaseModel):
    task_id: int
    kind: Kind
    statement_md: str = ""
    solution_md: str = ""


class ProblemIn(BaseModel):
    statement_md: str | None = None
    solution_md: str | None = None


class Ids(BaseModel):
    ids: list[int]


# reorder-роуты объявлены раньше роутов с {id}, чтобы литерал матчился первым
@app.put("/api/admin/tasks/reorder", dependencies=[Depends(admin)])
def reorder_tasks(body: Ids):
    conn = db()
    conn.executemany("UPDATE tasks SET sort_order = ? WHERE id = ?",
                     [(i, tid) for i, tid in enumerate(body.ids, 1)])
    conn.commit()
    conn.close()
    return {"ok": True}


@app.post("/api/admin/tasks", dependencies=[Depends(admin)])
def create_task(t: TaskIn):
    conn = db()
    order = conn.execute("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks").fetchone()[0]
    cur = conn.execute("INSERT INTO tasks (title, theory_md, sort_order) VALUES (?, ?, ?)",
                       (t.title or "Новое задание", t.theory_md or "", order))
    conn.commit()
    conn.close()
    return {"id": cur.lastrowid}


@app.put("/api/admin/tasks/{task_id}", dependencies=[Depends(admin)])
def update_task(task_id: int, t: TaskIn):
    conn = db()
    cur = conn.execute(
        "UPDATE tasks SET title = COALESCE(?, title), theory_md = COALESCE(?, theory_md) WHERE id = ?",
        (t.title, t.theory_md, task_id))
    conn.commit()
    conn.close()
    if not cur.rowcount:
        raise HTTPException(404)
    return {"ok": True}


@app.delete("/api/admin/tasks/{task_id}", dependencies=[Depends(admin)])
def delete_task(task_id: int):
    conn = db()
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


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
    conn = db()
    conn.executemany("UPDATE theory_sections SET sort_order = ? WHERE id = ?",
                     [(i, sid) for i, sid in enumerate(body.ids, 1)])
    conn.commit()
    conn.close()
    return {"ok": True}


@app.post("/api/admin/theory", dependencies=[Depends(admin)])
def create_section(s: SectionCreate):
    conn = db()
    order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM theory_sections WHERE task_id = ?",
        (s.task_id,)).fetchone()[0]
    try:
        cur = conn.execute(
            "INSERT INTO theory_sections (task_id, title, content_md, sort_order) VALUES (?, ?, ?, ?)",
            (s.task_id, s.title, s.content_md, order))
        conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(404, "Нет такого задания")
    finally:
        conn.close()
    return {"id": cur.lastrowid}


@app.put("/api/admin/theory/{section_id}", dependencies=[Depends(admin)])
def update_section(section_id: int, s: SectionIn):
    conn = db()
    try:
        if "parent_id" in s.model_fields_set and s.parent_id is not None:
            me = conn.execute("SELECT task_id FROM theory_sections WHERE id = ?",
                              (section_id,)).fetchone()
            parent = conn.execute("SELECT task_id FROM theory_sections WHERE id = ?",
                                  (s.parent_id,)).fetchone()
            if not me or not parent or me["task_id"] != parent["task_id"]:
                raise HTTPException(400, "Родитель должен быть главой того же задания")
            cur_id = s.parent_id
            for _ in range(100):  # защита от цикла в связях
                if cur_id == section_id:
                    raise HTTPException(400, "Связь создаёт цикл")
                row = conn.execute("SELECT parent_id FROM theory_sections WHERE id = ?",
                                   (cur_id,)).fetchone()
                cur_id = row["parent_id"] if row else None
                if cur_id is None:
                    break
        if "parent_id" in s.model_fields_set:
            conn.execute("UPDATE theory_sections SET parent_id = ? WHERE id = ?",
                         (s.parent_id, section_id))
        cur = conn.execute(
            "UPDATE theory_sections SET title = COALESCE(?, title), content_md = COALESCE(?, content_md) WHERE id = ?",
            (s.title, s.content_md, section_id))
        conn.commit()
    finally:
        conn.close()
    if not cur.rowcount:
        raise HTTPException(404)
    return {"ok": True}


@app.delete("/api/admin/theory/{section_id}", dependencies=[Depends(admin)])
def delete_section(section_id: int):
    conn = db()
    conn.execute("DELETE FROM theory_sections WHERE id = ?", (section_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.put("/api/admin/problems/reorder", dependencies=[Depends(admin)])
def reorder_problems(body: Ids):
    conn = db()
    conn.executemany("UPDATE problems SET sort_order = ? WHERE id = ?",
                     [(i, pid) for i, pid in enumerate(body.ids, 1)])
    conn.commit()
    conn.close()
    return {"ok": True}


@app.post("/api/admin/problems", dependencies=[Depends(admin)])
def create_problem(p: ProblemCreate):
    conn = db()
    order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM problems WHERE task_id = ?",
        (p.task_id,)).fetchone()[0]
    try:
        cur = conn.execute(
            "INSERT INTO problems (task_id, kind, statement_md, solution_md, sort_order) VALUES (?, ?, ?, ?, ?)",
            (p.task_id, p.kind, p.statement_md, p.solution_md, order))
        conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(404, "Нет такого задания")
    finally:
        conn.close()
    return {"id": cur.lastrowid}


@app.put("/api/admin/problems/{problem_id}", dependencies=[Depends(admin)])
def update_problem(problem_id: int, p: ProblemIn):
    conn = db()
    cur = conn.execute(
        "UPDATE problems SET statement_md = COALESCE(?, statement_md), solution_md = COALESCE(?, solution_md) WHERE id = ?",
        (p.statement_md, p.solution_md, problem_id))
    conn.commit()
    conn.close()
    if not cur.rowcount:
        raise HTTPException(404)
    return {"ok": True}


@app.delete("/api/admin/problems/{problem_id}", dependencies=[Depends(admin)])
def delete_problem(problem_id: int):
    conn = db()
    conn.execute("DELETE FROM problems WHERE id = ?", (problem_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.post("/api/admin/upload", dependencies=[Depends(admin)])
async def upload(file: UploadFile):
    ext = Path(file.filename or "").suffix[:10]  # suffix не содержит слэшей — имя безопасно
    name = uuid.uuid4().hex + ext
    (UPLOADS / name).write_bytes(await file.read())
    return {"url": f"/static/uploads/{name}", "markdown": f"![](/static/uploads/{name})"}
