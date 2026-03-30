import { CampaignCodexWidget } from "./CampaignCodexWidget.js";
import { clearTransactions, getTransactions } from "../transaction-log.js";

function _formatTimestamp(ts) {
    const value = Number(ts);
    if (!Number.isFinite(value) || value <= 0) return "-";
    return new Date(value).toLocaleString();
}

function _formatAmount(amount, currency) {
    const numeric = Number(amount || 0);
    const rounded = Math.round(numeric * 100) / 100;
    const value = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
    const curr = String(currency || "").trim();
    return curr ? `${value} ${curr}` : value;
}

function _labelForType(type) {
    return String(type || "").toLowerCase() === "sell" ? "Sell" : "Buy";
}

export class TransactionViewerWidget extends CampaignCodexWidget {
    async _prepareContext() {
        const transactions = getTransactions(this.document)
            .slice()
            .sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0));

        const rows = transactions.map((entry) => ({
            id: entry.id,
            typeLabel: _labelForType(entry.type),
            itemName: String(entry.itemName || "Unknown Item"),
            amountLabel: _formatAmount(entry.amount, entry.currency),
            actorName: String(entry.actorName || entry.userName || "Unknown"),
            timestampLabel: _formatTimestamp(entry.ts),
        }));

        return {
            id: this.widgetId,
            isGM: this.isGM,
            rows,
        };
    }

    async render() {
        if (!this.isGM) return ``;
        const data = await this._prepareContext();

        const clearBtn = data.isGM
            ? `<button type="button" class="tv-clear-btn" data-action="clear-transactions"><i class="fas fa-trash"></i> Clear</button>`
            : "";

        const rowsHtml = data.rows.length
            ? data.rows.map((row) => `
                <div class="tv-row" data-id="${row.id}">
                    <div class="tv-type ${row.typeLabel.toLowerCase()}">${row.typeLabel}</div>
                    <div class="tv-item" title="${foundry.utils.escapeHTML(row.itemName)}">${foundry.utils.escapeHTML(row.itemName)}</div>
                    <div class="tv-amount">${foundry.utils.escapeHTML(row.amountLabel)}</div>
                    <div class="tv-actor" title="${foundry.utils.escapeHTML(row.actorName)}">${foundry.utils.escapeHTML(row.actorName)}</div>
                    <div class="tv-time">${foundry.utils.escapeHTML(row.timestampLabel)}</div>
                </div>
            `).join("")
            : `<div class="tv-empty">No transactions recorded.</div>`;

        return `
            <div class="cc-widget-transaction-viewer" id="widget-${data.id}">
                <div class="tv-header">
                    <h4>Transactions</h4>
                    ${clearBtn}
                </div>
                <div class="tv-table-head">
                    <span>Type</span>
                    <span>Item</span>
                    <span>Amount</span>
                    <span>Actor</span>
                    <span>Time</span>
                </div>
                <div class="tv-list">
                    ${rowsHtml}
                </div>
            </div>
        `;
    }

    async activateListeners(htmlElement) {
        if (!this.isGM) return;
        htmlElement.querySelector('[data-action="clear-transactions"]')?.addEventListener("click", async (event) => {
            event.preventDefault();
            if (!this.isGM) return;

            const ok = await this.confirmationDialog("Clear all transaction records for this sheet?");
            if (!ok) return;

            await clearTransactions(this.document);
            await this._refreshWidget(htmlElement);
        });
    }

    async _refreshWidget(htmlElement) {
        if (!this.isGM) return;
        if (!htmlElement) return;
        const newHtml = await this.render();
        htmlElement.innerHTML = newHtml;
        await this.activateListeners(htmlElement);
    }
}
