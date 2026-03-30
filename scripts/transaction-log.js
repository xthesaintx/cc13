export const TRANSACTION_LOG_SOCKET_ACTION = "logTransaction";
const TRANSACTION_FLAG_PATH = "data.transactions";
const MAX_TRANSACTIONS = 500;

export function isTransactionLoggingEnabled() {
  try {
    return game.settings.get("campaign-codex", "enableTransactionLogging") !== false;
  } catch (error) {
    return true;
  }
}

function _toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function _normalizeType(type) {
  const t = String(type || "").toLowerCase();
  if (t === "sell") return "sell";
  if (t === "buy") return "buy";
  return "buy";
}

export function getTransactions(doc) {
  if (!doc?.getFlag) return [];
  const entries = doc.getFlag("campaign-codex", TRANSACTION_FLAG_PATH);
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => entry && typeof entry === "object");
}

export function createTransactionEntry(data = {}) {
  const amount = Math.max(0, _toNumber(data.amount, 0));
  return {
    id: data.id || foundry.utils.randomID(),
    ts: Number.isFinite(Number(data.ts)) ? Number(data.ts) : Date.now(),
    type: _normalizeType(data.type),
    itemName: String(data.itemName || "Unknown Item"),
    amount,
    currency: String(data.currency || ""),
    actorName: String(data.actorName || ""),
    actorUuid: data.actorUuid || null,
    userId: data.userId || null,
    userName: data.userName || "",
    source: String(data.source || ""),
    sourceUuid: data.sourceUuid || null,
  };
}

export async function appendTransaction(doc, data = {}) {
  if (!doc?.getFlag || !doc?.setFlag) return null;
  if (!isTransactionLoggingEnabled()) return null;
  const current = getTransactions(doc);
  const next = [...current, createTransactionEntry(data)];

  if (next.length > MAX_TRANSACTIONS) {
    next.splice(0, next.length - MAX_TRANSACTIONS);
  }

  await doc.setFlag("campaign-codex", TRANSACTION_FLAG_PATH, next);
  return next[next.length - 1] || null;
}

export async function clearTransactions(doc) {
  if (!doc?.setFlag) return false;
  await doc.setFlag("campaign-codex", TRANSACTION_FLAG_PATH, []);
  return true;
}
