const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "items.json");
const INDEX_FILE = path.join(ROOT, "index.html");
const CONFIG_FILES = [path.join(ROOT, ".env"), path.join(ROOT, "supabase.txt")];
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "invoice_items";
const IS_VERCEL = Boolean(process.env.VERCEL);

let appConfig = {
  username: process.env.APP_USERNAME || "admin",
  password: process.env.APP_PASSWORD || "admin123",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || ""
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
};

function normalizeConfigKey(key) {
  return key
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function stripQuotes(value) {
  return value.trim().replace(/^["']|["']$/g, "");
}

async function readConfigFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.split(/\r?\n/).reduce((entries, rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) return entries;

      const match = line.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
      if (match) {
        entries[normalizeConfigKey(match[1])] = stripQuotes(match[2]);
        return entries;
      }

      if (line.startsWith("http")) {
        entries.SUPABASE_URL = stripQuotes(line);
      } else if (line.startsWith("sb_secret")) {
        entries.SUPABASE_SECRET_KEY = stripQuotes(line);
      } else if (line.startsWith("sb_publishable")) {
        entries.SUPABASE_PUBLISHABLE_KEY = stripQuotes(line);
      }

      return entries;
    }, {});
  } catch {
    return {};
  }
}

async function loadAppConfig() {
  const fileEntries = {};

  for (const filePath of CONFIG_FILES) {
    Object.assign(fileEntries, await readConfigFile(filePath));
  }

  appConfig = {
    username: process.env.APP_USERNAME || fileEntries.APP_USERNAME || fileEntries.USERNAME || appConfig.username,
    password: process.env.APP_PASSWORD || fileEntries.APP_PASSWORD || fileEntries.PASSWORD || appConfig.password,
    supabaseUrl: process.env.SUPABASE_URL || fileEntries.SUPABASE_URL || fileEntries.PROJECT_URL || fileEntries.URL || appConfig.supabaseUrl,
    supabaseKey:
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_KEY ||
      fileEntries.SUPABASE_SECRET_KEY ||
      fileEntries.SECRET_KEY ||
      fileEntries.SERVICE_ROLE_KEY ||
      fileEntries.SUPABASE_KEY ||
      appConfig.supabaseKey
  };

  if (appConfig.supabaseUrl.endsWith("/")) {
    appConfig.supabaseUrl = appConfig.supabaseUrl.slice(0, -1);
  }
}

function hasSupabaseConfig() {
  return Boolean(appConfig.supabaseUrl && appConfig.supabaseKey);
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

async function readItems() {
  if (IS_VERCEL && !hasSupabaseConfig()) {
    throw new Error("Supabase environment variables are missing in Vercel.");
  }

  await ensureDataFile();
  try {
    const content = await fs.readFile(DATA_FILE, "utf8");
    const items = JSON.parse(content || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function writeItems(items) {
  if (IS_VERCEL && !hasSupabaseConfig()) {
    throw new Error("Supabase environment variables are missing in Vercel.");
  }

  await ensureDataFile();
  await fs.writeFile(DATA_FILE, `${JSON.stringify(items, null, 2)}\n`, "utf8");
}

function toDbItem(item) {
  return {
    id: item.id,
    name: item.name,
    date: item.date,
    country: item.country,
    amount: item.amount,
    gross_weight: item.grossWeight,
    actual_weight: item.actualWeight,
    cost_per_weight: item.costPerWeight,
    billable_weight: item.billableWeight,
    currency: item.currency,
    method: item.method,
    status: item.status
  };
}

function fromDbItem(row) {
  return {
    id: String(row.id),
    name: row.name,
    date: row.date,
    country: row.country || "",
    amount: Number(row.amount || 0),
    grossWeight: Number(row.gross_weight || 0),
    actualWeight: Number(row.actual_weight || 0),
    costPerWeight: Number(row.cost_per_weight || 0),
    billableWeight: Number(row.billable_weight || 0),
    currency: row.currency || "NPR",
    method: row.method || "cash",
    status: row.status || "unpaid"
  };
}

function supabaseHeaders(prefer) {
  const headers = {
    apikey: appConfig.supabaseKey,
    "Content-Type": "application/json"
  };

  if (appConfig.supabaseKey.split(".").length === 3) {
    headers.Authorization = `Bearer ${appConfig.supabaseKey}`;
  }

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

async function supabaseRequest(pathname, options = {}) {
  const response = await fetch(`${appConfig.supabaseUrl}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      ...supabaseHeaders(options.prefer),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data && (data.message || data.error || data.details);
    throw new Error(message || `Supabase request failed with status ${response.status}`);
  }

  return data;
}

async function readSupabaseItems() {
  const rows = await supabaseRequest(`${SUPABASE_TABLE}?select=*&order=created_at.desc`);
  return Array.isArray(rows) ? rows.map(fromDbItem) : [];
}

async function createSupabaseItem(item) {
  const rows = await supabaseRequest(`${SUPABASE_TABLE}?select=*`, {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify(toDbItem(item))
  });
  return Array.isArray(rows) && rows[0] ? fromDbItem(rows[0]) : item;
}

async function updateSupabaseItem(id, item) {
  const rows = await supabaseRequest(`${SUPABASE_TABLE}?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify(toDbItem(item))
  });
  return Array.isArray(rows) && rows[0] ? fromDbItem(rows[0]) : null;
}

async function deleteSupabaseItem(id) {
  const rows = await supabaseRequest(`${SUPABASE_TABLE}?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: "DELETE",
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows.length > 0 : true;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function cleanItem(input) {
  const name = String(input.name || "").trim();
  const grossWeight = Number(input.grossWeight || 0);
  const actualWeight = Number(input.actualWeight || 0);
  const costPerWeight = Number(input.costPerWeight || 0);
  const billableWeight = actualWeight > 0 ? actualWeight : grossWeight;
  const calculatedAmount = billableWeight * costPerWeight;
  const amount = costPerWeight > 0 ? calculatedAmount : Number(input.amount);

  if (
    !name ||
    Number.isNaN(amount) ||
    amount < 0 ||
    Number.isNaN(grossWeight) ||
    grossWeight < 0 ||
    Number.isNaN(actualWeight) ||
    actualWeight < 0 ||
    Number.isNaN(costPerWeight) ||
    costPerWeight < 0
  ) {
    return null;
  }

  const method = ["cash", "bank", "qr"].includes(input.method) ? input.method : "cash";
  const status = ["paid", "unpaid"].includes(input.status) ? input.status : "unpaid";

  return {
    id: input.id ? String(input.id) : Date.now().toString(),
    name,
    date: String(input.date || new Date().toISOString().slice(0, 10)),
    country: String(input.country || "").trim(),
    amount,
    grossWeight,
    actualWeight,
    costPerWeight,
    billableWeight,
    currency: String(input.currency || "NPR").trim().toUpperCase() || "NPR",
    method,
    status
  };
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/health" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      storage: hasSupabaseConfig() ? "supabase" : "local-json",
      hasSupabaseUrl: Boolean(appConfig.supabaseUrl),
      hasSupabaseKey: Boolean(appConfig.supabaseKey),
      isVercel: IS_VERCEL
    });
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const body = await readBody(req);
    const ok = body.username === appConfig.username && body.password === appConfig.password;
    return sendJson(res, ok ? 200 : 401, ok ? { ok: true } : { error: "Wrong username or password." });
  }

  if (pathname === "/api/items" && req.method === "GET") {
    const items = hasSupabaseConfig() ? await readSupabaseItems() : await readItems();
    return sendJson(res, 200, items);
  }

  if (pathname === "/api/items" && req.method === "POST") {
    const body = await readBody(req);
    const item = cleanItem(body);
    if (!item) return sendError(res, 400, "Item name and valid invoice values are required.");

    if (hasSupabaseConfig()) {
      return sendJson(res, 201, await createSupabaseItem(item));
    }

    const items = await readItems();
    items.unshift(item);
    await writeItems(items);
    return sendJson(res, 201, item);
  }

  const itemMatch = pathname.match(/^\/api\/items\/([^/]+)$/);
  if (itemMatch && req.method === "PATCH") {
    const id = decodeURIComponent(itemMatch[1]);
    const body = await readBody(req);
    const items = hasSupabaseConfig() ? await readSupabaseItems() : await readItems();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return sendError(res, 404, "Item not found.");

    const next = cleanItem({ ...items[index], ...body, id });
    if (!next) return sendError(res, 400, "Invalid item data.");

    if (hasSupabaseConfig()) {
      const updatedItem = await updateSupabaseItem(id, next);
      if (!updatedItem) return sendError(res, 404, "Item not found.");
      return sendJson(res, 200, updatedItem);
    }

    items[index] = next;
    await writeItems(items);
    return sendJson(res, 200, next);
  }

  if (itemMatch && req.method === "DELETE") {
    const id = decodeURIComponent(itemMatch[1]);

    if (hasSupabaseConfig()) {
      const deleted = await deleteSupabaseItem(id);
      if (!deleted) return sendError(res, 404, "Item not found.");
      return sendJson(res, 200, { ok: true });
    }

    const items = await readItems();
    const nextItems = items.filter((item) => item.id !== id);
    if (nextItems.length === items.length) return sendError(res, 404, "Item not found.");

    await writeItems(nextItems);
    return sendJson(res, 200, { ok: true });
  }

  return sendError(res, 404, "API route not found.");
}

async function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;

  if (requestedPath !== "/index.html") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const filePath = INDEX_FILE;

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const type = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

let appReadyPromise;

async function ensureAppReady() {
  if (!appReadyPromise) {
    appReadyPromise = loadAppConfig().then(async () => {
      if (!hasSupabaseConfig() && !IS_VERCEL) {
        await ensureDataFile();
      }
    });
  }

  return appReadyPromise;
}

async function handleRequest(req, res) {
  try {
    await ensureAppReady();
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }

    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendError(res, 500, error.message || "Server error.");
  }
}

if (require.main === module) {
  ensureAppReady().then(() => {
    const server = http.createServer(handleRequest);
    server.listen(PORT, HOST, () => {
      const storage = hasSupabaseConfig() ? "Supabase" : "local JSON";
      console.log(`AirInvoice running at http://localhost:${PORT} (${storage} storage)`);
    });
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = handleRequest;
module.exports.handleRequest = handleRequest;
