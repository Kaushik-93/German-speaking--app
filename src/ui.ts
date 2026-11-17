// Tiny DOM helpers.

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === "class") el.className = String(v);
      else if (k === "html") el.innerHTML = String(v);
      else if (k in el && typeof v !== "string") (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

let toastTimer: number | undefined;
export function toast(msg: string): void {
  let t = document.getElementById("toast");
  if (!t) {
    t = h("div", { id: "toast", role: "status" });
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove("show"), 2600);
}

export function modal(content: Node, onClose?: () => void): () => void {
  const close = () => {
    wrap.remove();
    onClose?.();
  };
  const wrap = h(
    "div",
    { class: "modal-wrap", onclick: (e: Event) => e.target === wrap && close() },
    h("div", { class: "modal" }, h("button", { class: "icon-btn modal-x", "aria-label": "Close", onclick: close }, "✕"), content),
  );
  document.body.append(wrap);
  return close;
}

export function ring(value: number, label: string, sub: string): HTMLElement {
  const r = 42;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("class", "ring");
  svg.innerHTML = `<circle cx="50" cy="50" r="${r}" class="ring-bg"/><circle cx="50" cy="50" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" transform="rotate(-90 50 50)"/>`;
  return h("div", { class: "ring-box" }, svg, h("div", { class: "ring-text" }, h("strong", null, label), h("span", null, sub)));
}
