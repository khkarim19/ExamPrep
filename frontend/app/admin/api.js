function authHeader() {
  let pw = sessionStorage.getItem("adminpw");
  if (pw === null) {
    pw = prompt("Пароль админки:") || "";
    sessionStorage.setItem("adminpw", pw);
  }
  return { Authorization: "Basic " + btoa("admin:" + pw) };
}

export async function adminFetch(url, opts = {}) {
  const headers = { ...authHeader(), ...opts.headers };
  if (typeof opts.body === "string") headers["Content-Type"] = "application/json";
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    sessionStorage.removeItem("adminpw");
    alert("Неверный пароль");
    throw new Error("unauthorized");
  }
  if (res.status === 503) {
    alert("Админка выключена: задайте пароль ADMIN_PASSWORD (см. README)");
    throw new Error("admin disabled");
  }
  if (!res.ok) {
    alert("Ошибка: " + res.status);
    throw new Error(String(res.status));
  }
  return res.json();
}

// переставляет элемент массива и шлёт новый порядок на сервер
export async function move(list, index, delta, reorderUrl) {
  const j = index + delta;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  await adminFetch(reorderUrl, { method: "PUT", body: JSON.stringify({ ids: next.map((x) => x.id) }) });
  return next;
}

// пропсы для textarea: картинку из буфера или перетаскиванием грузим и подставляем ![](url) в место курсора
export function imageProps(setValue) {
  async function insert(e, files) {
    const file = [...files].find((f) => f.type.startsWith("image/"));
    if (!file) return;
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b } = e.currentTarget;
    const form = new FormData();
    form.append("file", file);
    const { url } = await adminFetch("/api/admin/upload", { method: "POST", body: form });
    setValue((v) => v.slice(0, a) + `![](${url})` + v.slice(b));
  }
  return {
    onPaste: (e) => insert(e, e.clipboardData.files),
    onDrop: (e) => insert(e, e.dataTransfer.files),
  };
}
