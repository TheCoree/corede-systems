// corede Systems — виджет статусов для Scriptable (iOS)
//
// Размеры: малый, средний, большой, очень большой (iPad)
// и все виджеты экрана блокировки: круг, прямоугольник, строка.
//
// Параметр виджета (необязательно):
//   project:Название   — только мониторы проекта
//   tag:prod           — только мониторы с тегом
//   down               — только проблемные
//
// Запуск в самом Scriptable показывает предпросмотр любого размера.

const SERVER = "https://panel.example.com";
const TOKEN = "cds_ВСТАВЬТЕ_ТОКЕН";
const REFRESH_MINUTES = 5;

const param = (args.widgetParameter || "").trim();

// ---------- системная палитра iOS ----------
const C = {
  bg: Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E")),
  fg: Color.dynamic(new Color("#000000"), new Color("#FFFFFF")),
  secondary: Color.dynamic(new Color("#3C3C43", 0.6), new Color("#EBEBF5", 0.6)),
  tertiary: Color.dynamic(new Color("#3C3C43", 0.3), new Color("#EBEBF5", 0.3)),
  up: Color.dynamic(new Color("#34C759"), new Color("#30D158")),
  down: Color.dynamic(new Color("#FF3B30"), new Color("#FF453A")),
  pending: Color.dynamic(new Color("#FF9500"), new Color("#FF9F0A")),
  paused: new Color("#8E8E93"),
};
// DrawContext не понимает dynamic-цвета — для картинок нейтральные
const IMG = {
  up: new Color("#30D158"),
  down: new Color("#FF453A"),
  pending: new Color("#FF9F0A"),
  track: new Color("#8E8E93", 0.25),
  empty: new Color("#8E8E93", 0.22),
};

const F = {
  heavy: (s) => Font.heavyRoundedSystemFont(s),
  bold: (s) => Font.boldRoundedSystemFont(s),
  semi: (s) => Font.semiboldRoundedSystemFont(s),
  med: (s) => Font.mediumRoundedSystemFont(s),
  reg: (s) => Font.regularRoundedSystemFont(s),
  mono: (s) => Font.mediumMonospacedSystemFont(s),
};

const STATUS_ICON = {
  up: "checkmark.circle.fill",
  down: "exclamationmark.circle.fill",
  pending: "clock.fill",
  paused: "pause.circle.fill",
};

// ---------- данные ----------
async function load() {
  let url = SERVER.replace(/\/+$/, "") + "/api/widget";
  const m = param.match(/^(project|tag)\s*:\s*(.+)$/i);
  if (m) url += "?" + m[1].toLowerCase() + "=" + encodeURIComponent(m[2].trim());
  const fm = FileManager.local();
  const key = param.replace(/[^\wа-яё]+/gi, "_") || "all";
  const cache = fm.joinPath(fm.cacheDirectory(), "corede-widget-" + key + ".json");
  try {
    const req = new Request(url);
    req.headers = { Authorization: "Bearer " + TOKEN };
    req.timeoutInterval = 15;
    const data = await req.loadJSON();
    const code = req.response.statusCode;
    if (code !== 200) throw new Error((data && data.detail) || "HTTP " + code);
    fm.writeString(cache, JSON.stringify(data));
    return prepare(data, false, null);
  } catch (e) {
    const error = String(e && e.message ? e.message : e);
    if (fm.fileExists(cache)) return prepare(JSON.parse(fm.readString(cache)), true, error);
    return { data: null, stale: true, error };
  }
}

function prepare(data, stale, error) {
  if (/^(down|проблемы)$/i.test(param)) {
    data.monitors = data.monitors.filter((m) => m.status === "down" || m.status === "pending");
  }
  return { data, stale, error };
}

function summarize(d) {
  const down = d.counts.down || 0;
  const paused = d.counts.paused || 0;
  const active = Math.max(0, d.total - paused);
  const up = Math.max(0, active - down);
  return {
    down,
    paused,
    active,
    up,
    ratio: active ? up / active : 1,
    color: down ? C.down : C.up,
    img: down ? IMG.down : IMG.up,
    firstDown: d.monitors.find((m) => m.status === "down"),
  };
}

// ---------- форматирование ----------
function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}
const pct = (v) => (v == null ? "—" : v >= 100 ? "100%" : v.toFixed(2).replace(".", ",") + "%");
const ms = (v) => (v == null ? "—" : v < 1000 ? Math.round(v) + " мс" : (v / 1000).toFixed(1).replace(".", ",") + " с");
const title = (d) => (d && d.filter && (d.filter.project || d.filter.tag)) || (d && d.workspace ? d.workspace.name : "corede");
const monitorUrl = (d, m) => (d.url ? d.url + "/monitors/" + m.id : null);
const statusColor = (s) => C[s] || C.paused;

function headline(s) {
  if (s.down) return s.down + " " + plural(s.down, "недоступен", "недоступны", "недоступно");
  return s.active ? "Всё работает" : "Нет мониторов";
}

// ---------- примитивы ----------
function text(stack, str, font, color, lines) {
  const t = stack.addText(String(str));
  t.font = font;
  t.textColor = color;
  t.lineLimit = lines || 1;
  t.minimumScaleFactor = 0.7;
  return t;
}

function sym(stack, name, size, color, weight) {
  const s = SFSymbol.named(name);
  if (!s) return null;
  if (weight === "bold") s.applyBoldWeight();
  else if (weight === "semibold") s.applySemiboldWeight();
  const img = stack.addImage(s.image);
  img.imageSize = new Size(size, size);
  img.tintColor = color;
  return img;
}

// Живой таймер «сколько уже лежит» — тикает прямо на экране, без обновления виджета
function timer(stack, iso, font, color, width) {
  const box = stack.addStack();
  if (width) box.size = new Size(width, 0);
  box.addSpacer();
  const d = box.addDate(new Date(iso));
  d.applyTimerStyle();
  d.font = font;
  d.textColor = color;
  d.lineLimit = 1;
  d.rightAlignText();
  return d;
}

function updatedAt(stack, d, stale, font) {
  const row = stack.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  if (stale) {
    sym(row, "wifi.slash", 10, C.pending, "semibold");
    row.addSpacer(3);
  }
  text(row, stale ? "нет связи · " : "обновлено ", font, stale ? C.pending : C.tertiary);
  const t = row.addDate(new Date(d.generated_at));
  t.applyTimeStyle();
  t.font = font;
  t.textColor = stale ? C.pending : C.tertiary;
}

// ---------- картинки ----------
function ring(ratio, color, size, width) {
  const dc = new DrawContext();
  dc.size = new Size(size, size);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const r = (size - width) / 2;
  const c = size / 2;
  dc.setStrokeColor(IMG.track);
  dc.setLineWidth(width);
  dc.strokeEllipse(new Rect(width / 2, width / 2, size - width, size - width));
  const p = Math.max(0, Math.min(1, ratio));
  if (p > 0) {
    const path = new Path();
    const steps = Math.max(2, Math.round(160 * p));
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (2 * Math.PI * p * i) / steps;
      const pt = new Point(c + r * Math.cos(a), c + r * Math.sin(a));
      if (i === 0) path.move(pt);
      else path.addLine(pt);
    }
    dc.addPath(path);
    dc.setStrokeColor(color);
    dc.setLineWidth(width);
    dc.strokePath();
    // скруглённые концы дуги
    dc.setFillColor(color);
    for (const a of [-Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * p]) {
      dc.fillEllipse(new Rect(c + r * Math.cos(a) - width / 2, c + r * Math.sin(a) - width / 2, width, width));
    }
  }
  return dc.getImage();
}

function bars(values, w, h) {
  const dc = new DrawContext();
  dc.size = new Size(w, h);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const list = values && values.length ? values : new Array(24).fill(null);
  const gap = 1.5;
  const bw = (w - gap * (list.length - 1)) / list.length;
  list.forEach((v, i) => {
    const color = v == null ? IMG.empty : v >= 0.999 ? IMG.up : v >= 0.95 ? IMG.pending : IMG.down;
    const p = new Path();
    p.addRoundedRect(new Rect(i * (bw + gap), 0, bw, h), Math.min(bw / 2, 2), Math.min(bw / 2, 2));
    dc.addPath(p);
    dc.setFillColor(color);
    dc.fillPath();
  });
  return dc.getImage();
}

// Кольцо доступности с галочкой или числом упавших в центре
function ringBadge(stack, s, size, width, white) {
  const box = stack.addStack();
  box.size = new Size(size, size);
  box.backgroundImage = ring(s.ratio, white ? Color.white() : s.img, size, width);
  box.layoutHorizontally();
  box.centerAlignContent();
  box.addSpacer();
  if (s.down) text(box, String(s.down), F.heavy(Math.round(size * 0.4)), white ? Color.white() : C.down);
  else sym(box, "checkmark", Math.round(size * 0.36), white ? Color.white() : C.up, "bold");
  box.addSpacer();
  return box;
}

// ---------- блоки ----------
function header(stack, d, stale) {
  const row = stack.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  sym(row, "server.rack", 11, C.secondary, "semibold");
  row.addSpacer(5);
  text(row, title(d), F.semi(12), C.secondary);
  row.addSpacer();
  if (stale) sym(row, "wifi.slash", 11, C.pending, "semibold");
}

function monitorRow(stack, d, m, o) {
  const row = stack.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  const url = monitorUrl(d, m);
  if (url) row.url = url; // нажатие на строку открывает монитор
  sym(row, STATUS_ICON[m.status] || STATUS_ICON.paused, o.icon, statusColor(m.status));
  row.addSpacer(7);
  const name = row.addStack();
  name.layoutVertically();
  text(name, m.name, F.med(o.font), C.fg);
  if (o.subtitle) {
    const sub = m.status === "down" && m.error ? m.error : m.project;
    if (sub) text(name, sub, F.reg(o.font - 2.5), m.status === "down" ? C.down : C.secondary);
  }
  row.addSpacer(6);
  if (o.bars) {
    const img = row.addImage(bars(m.bars, o.bars[0], o.bars[1]));
    img.imageSize = new Size(o.bars[0], o.bars[1]);
    row.addSpacer(8);
  }
  if (m.status === "down" && m.since) timer(row, m.since, F.mono(o.font - 2), C.down, o.value);
  else {
    const box = row.addStack();
    if (o.value) box.size = new Size(o.value, 0);
    box.addSpacer();
    const t = text(box, m.status === "paused" ? "пауза" : ms(m.latency_ms), F.mono(o.font - 2), C.secondary);
    t.rightAlignText();
  }
}

function heroText(stack, d, s, size) {
  const col = stack.addStack();
  col.layoutVertically();
  text(col, headline(s), F.bold(size), s.color);
  col.addSpacer(2);
  if (s.firstDown) {
    text(col, s.firstDown.name, F.med(size - 3), C.fg);
  } else {
    const parts = [s.active + " " + plural(s.active, "монитор", "монитора", "мониторов")];
    if (s.paused) parts.push(s.paused + " на паузе");
    text(col, parts.join(" · "), F.reg(size - 3), C.secondary);
  }
  text(col, "uptime 24 ч " + pct(d.uptime_24h), F.reg(size - 4), C.secondary);
  return col;
}

function more(stack, n, font) {
  if (n > 0) text(stack, "ещё " + n, font, C.tertiary);
}

// ---------- размеры ----------
function buildSmall(w, d, s, stale) {
  w.setPadding(14, 14, 14, 14);
  header(w, d, stale);
  w.addSpacer();
  ringBadge(w, s, 52, 6);
  w.addSpacer(10);
  text(w, headline(s), F.bold(16), s.color);
  w.addSpacer(1);
  if (s.firstDown) {
    text(w, s.firstDown.name, F.med(12), C.fg);
    if (s.firstDown.since) {
      const row = w.addStack();
      row.layoutHorizontally();
      const t = row.addDate(new Date(s.firstDown.since));
      t.applyTimerStyle();
      t.font = F.mono(11);
      t.textColor = C.down;
      t.lineLimit = 1;
    }
    w.url = monitorUrl(d, s.firstDown) || d.url;
  } else {
    text(w, "uptime 24 ч " + pct(d.uptime_24h), F.reg(12), C.secondary);
  }
}

function buildMedium(w, d, s, stale) {
  w.setPadding(14, 14, 14, 14);
  header(w, d, stale);
  w.addSpacer(10);
  const body = w.addStack();
  body.layoutHorizontally();

  const left = body.addStack();
  left.layoutVertically();
  left.size = new Size(116, 0);
  ringBadge(left, s, 46, 5.5);
  left.addSpacer(8);
  text(left, headline(s), F.bold(14), s.color);
  text(left, "uptime " + pct(d.uptime_24h), F.reg(11), C.secondary);
  left.addSpacer();

  body.addSpacer(12);
  const right = body.addStack();
  right.layoutVertically();
  right.spacing = 8;
  const max = 4;
  for (const m of d.monitors.slice(0, max)) monitorRow(right, d, m, { icon: 13, font: 13, value: 58 });
  if (!d.monitors.length) text(right, "Мониторов нет", F.reg(12), C.secondary);
  more(right, d.monitors.length - max, F.reg(11));
  right.addSpacer();
}

function buildLarge(w, d, s, stale, wide) {
  w.setPadding(16, 16, 14, 16);
  header(w, d, stale);
  w.addSpacer(12);

  const hero = w.addStack();
  hero.layoutHorizontally();
  hero.centerAlignContent();
  ringBadge(hero, s, wide ? 62 : 56, 7);
  hero.addSpacer(14);
  heroText(hero, d, s, wide ? 19 : 17);
  hero.addSpacer();
  w.addSpacer(14);

  const opts = { icon: 15, font: 14, value: 58, subtitle: true, bars: wide ? [96, 16] : [64, 14] };
  if (wide) {
    const cols = w.addStack();
    cols.layoutHorizontally();
    const per = 6;
    for (let c = 0; c < 2; c++) {
      const col = cols.addStack();
      col.layoutVertically();
      col.spacing = 9;
      for (const m of d.monitors.slice(c * per, (c + 1) * per)) monitorRow(col, d, m, opts);
      col.addSpacer();
      if (c === 0) cols.addSpacer(22);
    }
    w.addSpacer();
    const foot = w.addStack();
    foot.layoutHorizontally();
    updatedAt(foot, d, stale, F.reg(11));
    foot.addSpacer();
    more(foot, d.monitors.length - per * 2, F.reg(11));
    return;
  }

  const list = w.addStack();
  list.layoutVertically();
  list.spacing = 8;
  const max = 6;
  for (const m of d.monitors.slice(0, max)) monitorRow(list, d, m, opts);
  if (!d.monitors.length) text(list, "Мониторов нет", F.reg(13), C.secondary);
  w.addSpacer();
  const foot = w.addStack();
  foot.layoutHorizontally();
  updatedAt(foot, d, stale, F.reg(11));
  foot.addSpacer();
  more(foot, d.monitors.length - max, F.reg(11));
}

// Экран блокировки: iOS сам перекрашивает всё в монохром
function buildCircular(w, d, s) {
  w.addAccessoryWidgetBackground = true;
  if (!d) {
    w.addSpacer();
    sym(w, "wifi.slash", 22, Color.white(), "semibold");
    w.addSpacer();
    return;
  }
  const row = w.addStack();
  row.layoutHorizontally();
  row.addSpacer();
  ringBadge(row, s, 58, 5, true);
  row.addSpacer();
}

function buildRectangular(w, d, s) {
  if (!d) {
    text(w, "corede: нет связи", F.semi(14), Color.white());
    return;
  }
  const top = w.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();
  sym(top, s.down ? "exclamationmark.triangle.fill" : "checkmark.circle.fill", 13, Color.white(), "semibold");
  top.addSpacer(4);
  text(top, headline(s), F.bold(15), Color.white());
  const downs = d.monitors.filter((m) => m.status === "down").slice(0, 2);
  for (const m of downs) {
    const row = w.addStack();
    row.layoutHorizontally();
    text(row, m.name, F.med(13), Color.white());
    row.addSpacer(4);
    if (m.since) timer(row, m.since, F.mono(12), Color.white(), 52);
  }
  if (!downs.length) {
    text(w, s.active + " " + plural(s.active, "монитор", "монитора", "мониторов"), F.med(13), Color.white());
    text(w, "uptime 24 ч " + pct(d.uptime_24h), F.reg(12), Color.white());
  }
}

function buildInline(w, d, s) {
  if (!d) w.addText("corede · нет связи");
  else if (s.down) w.addText("⚠︎ " + headline(s) + (s.firstDown ? " · " + s.firstDown.name : ""));
  else w.addText("✓ " + s.active + " " + plural(s.active, "работает", "работают", "работают") + " · " + pct(d.uptime_24h));
}

function buildError(w, error) {
  w.setPadding(14, 14, 14, 14);
  header(w, null, true);
  w.addSpacer();
  sym(w, "wifi.exclamationmark", 30, C.secondary, "semibold");
  w.addSpacer(8);
  text(w, "Нет данных", F.bold(15), C.fg);
  text(w, error || "Проверьте адрес и токен", F.reg(11), C.secondary, 3);
  w.addSpacer();
}

function build(result, family) {
  const { data, stale, error } = result;
  const w = new ListWidget();
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);
  if (data && data.url) w.url = data.url;
  const s = data ? summarize(data) : null;

  switch (family) {
    case "accessoryCircular":
      buildCircular(w, data, s);
      return w;
    case "accessoryRectangular":
      buildRectangular(w, data, s);
      return w;
    case "accessoryInline":
      buildInline(w, data, s);
      return w;
  }

  w.backgroundColor = C.bg;
  if (!data) {
    buildError(w, error);
    return w;
  }
  if (family === "small") buildSmall(w, data, s, stale);
  else if (family === "medium") buildMedium(w, data, s, stale);
  else buildLarge(w, data, s, stale, family === "extraLarge");
  return w;
}

// ---------- запуск ----------
const result = await load();

if (config.runsInWidget) {
  Script.setWidget(build(result, config.widgetFamily || "medium"));
} else {
  // В приложении — выбор размера для предпросмотра
  const sizes = [
    ["Малый", "small", "presentSmall"],
    ["Средний", "medium", "presentMedium"],
    ["Большой", "large", "presentLarge"],
    ["Очень большой (iPad)", "extraLarge", "presentExtraLarge"],
    ["Экран блокировки: круг", "accessoryCircular", "presentAccessoryCircular"],
    ["Экран блокировки: прямоугольник", "accessoryRectangular", "presentAccessoryRectangular"],
    ["Экран блокировки: строка", "accessoryInline", "presentAccessoryInline"],
  ];
  const alert = new Alert();
  alert.title = "corede Systems";
  alert.message = "Какой размер показать?";
  for (const [label] of sizes) alert.addAction(label);
  alert.addCancelAction("Отмена");
  const i = await alert.presentSheet();
  if (i >= 0) {
    const [, family, method] = sizes[i];
    const widget = build(result, family);
    if (typeof widget[method] === "function") await widget[method]();
    else await widget.presentLarge();
  }
}
Script.complete();
