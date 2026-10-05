import base64
import os
import tempfile

os.environ["EGE_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["ADMIN_PASSWORD"] = "test-pw"

from fastapi.testclient import TestClient  # noqa: E402
import app  # noqa: E402

c = TestClient(app.app)
AUTH = {"Authorization": "Basic " + base64.b64encode(b"admin:test-pw").decode()}


def test_flow():
    # сид: 19 заданий, прогресс пустой
    tasks = c.get("/api/tasks").json()
    assert len(tasks) == 19
    assert tasks[0]["progress"] == {"theory": False, "problems": False, "practice": False}

    # прогресс задач/тренировки — вручную
    assert c.put("/api/tasks/1/progress", json={"section": "problems", "done": True}).status_code == 200
    assert c.get("/api/tasks/1").json()["progress"]["problems"] is True
    assert c.put("/api/tasks/999/progress", json={"section": "problems", "done": True}).status_code == 404
    # теорию вручную двигать нельзя
    assert c.put("/api/tasks/1/progress", json={"section": "theory", "done": True}).status_code == 422

    # админка: без пароля нельзя
    assert c.post("/api/admin/tasks", json={}).status_code == 401
    assert c.post("/api/admin/tasks", json={}, headers={
        "Authorization": "Basic " + base64.b64encode(b"admin:wrong").decode()}).status_code == 401

    # CRUD задач и проблем
    tid = c.post("/api/admin/tasks", json={"title": "Тест"}, headers=AUTH).json()["id"]

    # теория по главам: автозачёт когда прочитаны все
    s1 = c.post("/api/admin/theory", json={"task_id": tid, "title": "Глава 1", "content_md": "a"}, headers=AUTH).json()["id"]
    s2 = c.post("/api/admin/theory", json={"task_id": tid, "title": "Глава 2", "content_md": "b"}, headers=AUTH).json()["id"]
    assert c.get(f"/api/tasks/{tid}").json()["progress"]["theory"] is False
    assert c.put(f"/api/theory/{s1}/read", json={"done": True}).status_code == 200
    assert c.get(f"/api/tasks/{tid}").json()["progress"]["theory"] is False
    assert c.put(f"/api/theory/{s2}/read", json={"done": True}).status_code == 200
    detail = c.get(f"/api/tasks/{tid}").json()
    assert detail["progress"]["theory"] is True
    assert [s["title"] for s in detail["sections"]] == ["Глава 1", "Глава 2"]
    assert c.put("/api/admin/theory/reorder", json={"ids": [s2, s1]}, headers=AUTH).status_code == 200
    assert [s["id"] for s in c.get(f"/api/tasks/{tid}").json()["sections"]] == [s2, s1]
    assert c.put("/api/theory/999/read", json={"done": True}).status_code == 404

    # связи на mind map: родитель, запрет цикла, сброс в корень
    assert c.put(f"/api/admin/theory/{s2}", json={"parent_id": s1}, headers=AUTH).status_code == 200
    assert c.put(f"/api/admin/theory/{s1}", json={"parent_id": s2}, headers=AUTH).status_code == 400  # цикл
    assert c.put(f"/api/admin/theory/{s1}", json={"parent_id": s1}, headers=AUTH).status_code == 400  # сам себе
    secs = {s["id"]: s["parent_id"] for s in c.get(f"/api/tasks/{tid}").json()["sections"]}
    assert secs[s2] == s1 and secs[s1] is None
    assert c.put(f"/api/admin/theory/{s2}", json={"parent_id": None}, headers=AUTH).status_code == 200
    assert all(s["parent_id"] is None for s in c.get(f"/api/tasks/{tid}").json()["sections"])
    assert c.put(f"/api/admin/theory/{s2}", json={"parent_id": s1}, headers=AUTH).status_code == 200
    # удаление родителя делает ребёнка корнем, а не удаляет его
    assert c.delete(f"/api/admin/theory/{s1}", headers=AUTH).status_code == 200
    left = c.get(f"/api/tasks/{tid}").json()["sections"]
    assert [s["id"] for s in left] == [s2] and left[0]["parent_id"] is None
    p1 = c.post("/api/admin/problems", json={"task_id": tid, "kind": "example", "statement_md": "a",
                                             "explanation_md": "разбор"}, headers=AUTH).json()["id"]
    p2 = c.post("/api/admin/problems", json={"task_id": tid, "kind": "practice", "statement_md": "b",
                                             "solution_md": "42"}, headers=AUTH).json()["id"]

    detail = c.get(f"/api/tasks/{tid}").json()
    assert [p["id"] for p in detail["examples"]] == [p1]
    assert detail["examples"][0]["explanation_md"] == "разбор"
    assert detail["practice"][0]["solution_md"] == "42" and detail["practice"][0]["explanation_md"] == ""
    # частичный апдейт не затирает соседние поля
    assert c.put(f"/api/admin/problems/{p2}", json={"explanation_md": "e"}, headers=AUTH).status_code == 200
    got = c.get(f"/api/tasks/{tid}").json()["practice"][0]
    assert got["explanation_md"] == "e" and got["solution_md"] == "42" and got["statement_md"] == "b"

    # тренировку нельзя завершить, пока верные ответы не зафиксированы
    done = lambda: c.put(f"/api/tasks/{tid}/progress", json={"section": "practice", "done": True})
    assert done().status_code == 409
    assert c.put(f"/api/problems/{p2}/solved", json={"done": True}).status_code == 200
    assert c.get(f"/api/tasks/{tid}").json()["practice"][0]["solved"] == 1
    assert done().status_code == 200
    # смена правильного ответа обнуляет зафиксированное решение; правка условия — нет
    assert c.put(f"/api/admin/problems/{p2}", json={"statement_md": "b2"}, headers=AUTH).status_code == 200
    assert c.get(f"/api/tasks/{tid}").json()["practice"][0]["solved"] == 1
    assert c.put(f"/api/admin/problems/{p2}", json={"solution_md": "43"}, headers=AUTH).status_code == 200
    assert c.get(f"/api/tasks/{tid}").json()["practice"][0]["solved"] == 0
    # задача без правильного ответа не мешает завершению; solved есть только у тренировки
    assert c.put(f"/api/admin/problems/{p2}", json={"solution_md": ""}, headers=AUTH).status_code == 200
    assert c.put(f"/api/tasks/{tid}/progress", json={"section": "practice", "done": False}).status_code == 200
    assert done().status_code == 200
    assert c.put(f"/api/problems/{p1}/solved", json={"done": True}).status_code == 404  # p1 — пример
    c.put(f"/api/admin/problems/{p2}", json={"solution_md": "42"}, headers=AUTH)  # вернуть для дальнейших проверок
    assert [p["id"] for p in detail["practice"]] == [p2]

    # reorder
    assert c.put("/api/admin/problems/reorder", json={"ids": [p2, p1]}, headers=AUTH).status_code == 200
    detail = c.get(f"/api/tasks/{tid}").json()
    assert detail["practice"][0]["sort_order"] < detail["examples"][0]["sort_order"]

    # удаление задания каскадом чистит проблемы и прогресс
    assert c.delete(f"/api/admin/tasks/{tid}", headers=AUTH).status_code == 200
    assert c.get(f"/api/tasks/{tid}").status_code == 404


if __name__ == "__main__":
    test_flow()
    print("ok")
