document.getElementById("jscheck").textContent = "JS: 已运行";
alert("app.js 已运行");
window.addEventListener("error", (e) => {
  const s = document.getElementById("status");
  if (s) s.textContent = "JS错误: " + (e.message || "未知错误");
});
window.addEventListener("unhandledrejection", (e) => {
  const s = document.getElementById("status");
  if (s) s.textContent = "Promise错误: " + (e.reason?.message || String(e.reason));
});


const DATA_URL = "./data_zh.json";
const STORAGE_KEYS = {
  cache: "asakusa_omikuji_data_cache_v1",
  hist: "asakusa_omikuji_history_v1",
  noReplacePool: "asakusa_omikuji_pool_v1",
};

// 若你想“100 天不重复”，把这个改为 true（无放回抽样，抽完会自动重置池）
const NO_REPLACEMENT_MODE = false;

const el = (id) => document.getElementById(id);

const statusEl = el("status");
const drawBtn = el("drawBtn");
const copyBtn = el("copyBtn");
const shareBtn = el("shareBtn");
const resetBtn = el("resetBtn");

const ftitle = el("ftitle");
const fmeta = el("fmeta");
const fpoem = el("fpoem");
const fexp  = el("fexp");

const histEl = el("hist");
const hcountEl = el("hcount");
const toastEl = el("toast");

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 1600);
}

function safeJsonParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function getCryptoInt(maxExclusive) {
  if (!(maxExclusive > 0)) throw new Error("maxExclusive must be > 0");
  // rejection sampling to avoid modulo bias
  const max = 0xFFFFFFFF;
  const limit = Math.floor((max + 1) / maxExclusive) * maxExclusive;
  const u32 = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(u32);
    const x = u32[0];
    if (x < limit) return x % maxExclusive;
  }
}

async function fetchJsonWithTimeout(url, ms=12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function normalizeData(data) {
  // 兼容可能的字段差异
  if (!Array.isArray(data)) throw new Error("Data must be an array");
  const out = data.map((it) => {
    const no = Number(it.no ?? it.number ?? it.id);
    const luck = String(it.luck ?? it.level ?? it.result ?? "");
    const poem = String(it.poem ?? it.oracle ?? it.text ?? "");
    const explain = String(it.explain ?? it.explanation ?? it.commentary ?? "");
    const items = it.items ?? it.detail ?? it.details ?? null; // 可选：愿望/疾病/旅行等
    return {
      no,
      luck,
      poem,
      explain,
      items: items && typeof items === "object" ? items : null,
      raw: it,
    };
  }).filter(x => Number.isFinite(x.no) && x.no >= 1 && x.no <= 100);
  if (out.length < 100) {
    // 不强制，但提示
    console.warn("Data length < 100:", out.length);
  }
  out.sort((a,b) => a.no - b.no);
  return out;
}

function loadCache() {
  return safeJsonParse(localStorage.getItem(STORAGE_KEYS.cache), null);
}

function saveCache(data) {
  localStorage.setItem(STORAGE_KEYS.cache, JSON.stringify(data));
}

function loadHistory() {
  return safeJsonParse(localStorage.getItem(STORAGE_KEYS.hist), []);
}

function saveHistory(hist) {
  localStorage.setItem(STORAGE_KEYS.hist, JSON.stringify(hist));
}

function initPoolIfNeeded(dataLen) {
  if (!NO_REPLACEMENT_MODE) return;
  const pool = safeJsonParse(localStorage.getItem(STORAGE_KEYS.noReplacePool), null);
  if (!Array.isArray(pool) || pool.length === 0) {
    const newPool = Array.from({length: dataLen}, (_, i) => i);
    localStorage.setItem(STORAGE_KEYS.noReplacePool, JSON.stringify(newPool));
  }
}

function drawIndex(dataLen) {
  if (!NO_REPLACEMENT_MODE) {
    return getCryptoInt(dataLen);
  }
  let pool = safeJsonParse(localStorage.getItem(STORAGE_KEYS.noReplacePool), []);
  if (!Array.isArray(pool) || pool.length === 0) {
    pool = Array.from({length: dataLen}, (_, i) => i);
  }
  const k = getCryptoInt(pool.length);
  const idx = pool[k];
  pool.splice(k, 1);
  localStorage.setItem(STORAGE_KEYS.noReplacePool, JSON.stringify(pool));
  return idx;
}

function formatFortune(f) {
  const header = `第${f.no}签 · ${f.luck || "—"}`;
  const poem = f.poem?.trim() ? f.poem.trim() : "（无诗文）";
  const exp = f.explain?.trim() ? f.explain.trim() : "";
  const extra = f.items ? Object.entries(f.items).map(([k,v])=>`${k}：${v}`).join("\n") : "";
  return [header, "", poem, exp ? "\n" + exp : "", extra ? "\n\n" + extra : ""].join("\n").trim();
}

function renderFortune(f) {
  ftitle.textContent = f.luck ? `${f.luck}` : "—";
  fmeta.innerHTML = `第 <strong>${f.no}</strong> 签`;
  fpoem.textContent = f.poem?.trim() || "（无诗文）";

  const parts = [];
  if (f.explain?.trim()) parts.push(f.explain.trim());
  if (f.items) {
    parts.push(Object.entries(f.items).map(([k,v])=>`${k}：${v}`).join("\n"));
  }
  fexp.textContent = parts.join("\n\n");

  copyBtn.disabled = false;
  shareBtn.disabled = false;
  copyBtn.dataset.payload = formatFortune(f);
  shareBtn.dataset.payload = copyBtn.dataset.payload;
}

function renderHistory(hist, dataByNo) {
  const show = hist.slice(0, 20);
  hcountEl.textContent = String(hist.length);
  histEl.innerHTML = "";
  if (show.length === 0) {
    const div = document.createElement("div");
    div.className = "small";
    div.textContent = "暂无历史。";
    histEl.appendChild(div);
    return;
  }
  for (const h of show) {
    const div = document.createElement("div");
    div.className = "hist-item";
    const left = document.createElement("div");
    left.innerHTML = `<b>#${h.no}</b> ${h.luck || "—"}<div class="small">${new Date(h.ts).toLocaleString()}</div>`;
    const btn = document.createElement("button");
    btn.textContent = "查看";
    btn.style.padding = "8px 10px";
    btn.addEventListener("click", () => {
      const f = dataByNo.get(h.no);
      if (f) renderFortune(f);
      else toast("找不到该签的数据（可能未加载完整）。");
    });
    div.appendChild(left);
    div.appendChild(btn);
    histEl.appendChild(div);
  }
}

async function loadData() {
  statusEl.textContent = "加载数据…";
  // 1) 优先用缓存
  const cached = loadCache();
  if (cached && Array.isArray(cached) && cached.length >= 80) {
    statusEl.textContent = `已离线就绪（${cached.length}条）`;
    return normalizeData(cached);
  }

  // 2) 拉取远端
  try {
    const remote = await fetchJsonWithTimeout(DATA_URL);
    const normalized = normalizeData(remote);
    saveCache(remote);
    statusEl.textContent = `已加载（${normalized.length}条）`;
    return normalized;
  } catch (e) {
    console.warn(e);
    statusEl.textContent = "离线且无缓存";
    throw e;
  }
}

(async function main() {
  // 注册 Service Worker（离线）
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("sw.js");
    } catch (e) {
      console.warn("SW register failed:", e);
    }
  }

  let data = [];
  try {
    data = await loadData();
  } catch {
    fpoem.textContent = "数据未加载成功。\n\n解决办法：\n1) 确保你首次打开时有网络；\n2) 或者把 data.zh.json 内容直接内嵌到 app.js（我也可以给你内嵌版）。";
    drawBtn.disabled = true;
    return;
  }

  const dataByNo = new Map(data.map(x => [x.no, x]));
  initPoolIfNeeded(data.length);

  const hist = loadHistory();
  renderHistory(hist, dataByNo);

  drawBtn.addEventListener("click", () => {
    const idx = drawIndex(data.length);
    const f = data[idx];
    renderFortune(f);

    const newHist = [{ no: f.no, luck: f.luck, ts: Date.now() }, ...loadHistory()].slice(0, 500);
    saveHistory(newHist);
    renderHistory(newHist, dataByNo);
  });

  copyBtn.addEventListener("click", async () => {
    const text = copyBtn.dataset.payload || "";
    try {
      await navigator.clipboard.writeText(text);
      toast("已复制");
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("已复制");
    }
  });

  shareBtn.addEventListener("click", async () => {
    const text = shareBtn.dataset.payload || "";
    if (navigator.share) {
      try {
        await navigator.share({ title: "浅草寺观音百签", text });
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(text);
      toast("已复制（此浏览器不支持分享）");
    }
  });

  resetBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.hist);
    localStorage.removeItem(STORAGE_KEYS.noReplacePool);
    renderHistory([], dataByNo);
    toast("历史已清空");
  });
})();
