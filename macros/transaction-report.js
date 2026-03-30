/**
 * Campaign Codex Transaction Report
 * Scans Campaign Codex sheets for transaction logs and creates a report Journal Entry.
 */

const SCOPE = "campaign-codex";
const TYPE_FLAG = "type";
const TRANSACTION_FLAG = "data.transactions";
const REPORT_PAGE_NAME = "Transaction Report";

function toSafeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function formatAmount(value) {
  const n = Math.max(0, toSafeNumber(value, 0));
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function formatTimestamp(value) {
  const ts = toSafeNumber(value, NaN);
  if (!Number.isFinite(ts)) return "Unknown";
  return new Date(ts).toLocaleString();
}

function buildTransactionRow(entry) {
  const type = String(entry?.type || "buy").toUpperCase();
  const itemName = escapeHtml(entry?.itemName || "Unknown Item");
  const amount = formatAmount(entry?.amount);
  const currency = escapeHtml(entry?.currency || "");
  const actorName = escapeHtml(entry?.actorName || "");
  const userName = escapeHtml(entry?.userName || "");
  const source = escapeHtml(entry?.source || "");
  const when = escapeHtml(formatTimestamp(entry?.ts));

  return `
    <tr>
      <td>${when}</td>
      <td>${type}</td>
      <td>${itemName}</td>
      <td>${amount} ${currency}</td>
      <td>${actorName || "-"}</td>
      <td>${userName || "-"}</td>
      <td>${source || "-"}</td>
    </tr>
  `;
}

function buildSheetSection(doc, entries) {
  const safeName = escapeHtml(doc.name);
  const sheetLink = `@UUID[${doc.uuid}]{${safeName}}`;
  const sorted = [...entries].sort((a, b) => toSafeNumber(a.ts) - toSafeNumber(b.ts));
  const rows = sorted.map((entry) => buildTransactionRow(entry)).join("");

  return `
    <section>
      <h3>${sheetLink}</h3>
      <p><strong>Transaction records:</strong> ${sorted.length}</p>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Type</th>
            <th>Item</th>
            <th>Amount</th>
            <th>Actor</th>
            <th>User</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <hr />
    </section>
  `;
}

const codexSheets = game.journal.filter((doc) => !!doc.getFlag(SCOPE, TYPE_FLAG));
const sheetsWithTransactions = codexSheets
  .map((doc) => {
    const entries = doc.getFlag(SCOPE, TRANSACTION_FLAG);
    if (!Array.isArray(entries) || entries.length === 0) return null;
    return { doc, entries };
  })
  .filter(Boolean)
  .sort((a, b) => a.doc.name.localeCompare(b.doc.name, undefined, { numeric: true, sensitivity: "base" }));

const generatedAt = new Date().toLocaleString();
let reportContent = `
  <p>Generated: ${escapeHtml(generatedAt)}</p>
  <p>Sheets scanned: ${codexSheets.length}</p>
  <p>Sheets with transaction records: ${sheetsWithTransactions.length}</p>
  <hr />
`;

if (sheetsWithTransactions.length === 0) {
  reportContent += "<p>No transaction records were found on Campaign Codex sheets.</p>";
} else {
  reportContent += sheetsWithTransactions
    .map(({ doc, entries }) => buildSheetSection(doc, entries))
    .join("");
}

const reportName = `Campaign Codex Transaction Report`;
const journalData = { name: reportName };

if (game.release?.generation >= 12) {
  journalData.pages = [
    {
      name: REPORT_PAGE_NAME,
      type: "text",
      text: {
        format: 1,
        content: reportContent,
      },
    },
  ];
} else {
  journalData.content = reportContent;
}

try {
  const created = await JournalEntry.create(journalData, { renderSheet: true });
  ui.notifications.info(`Created transaction report journal: ${created.name}`);
} catch (error) {
  console.error("Campaign Codex | Failed to create transaction report journal:", error);
  ui.notifications.error("Failed to create transaction report journal.");
}
