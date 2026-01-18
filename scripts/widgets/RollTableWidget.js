import { CampaignCodexWidget } from "./CampaignCodexWidget.js";

export class RollTableWidget extends CampaignCodexWidget {

    constructor(widgetId, widgetData, document) {
        super(widgetId, widgetData, document);
        this.tables = widgetData.tables || [];
    }

    async _prepareContext() {
        const savedData = (await this.getData()) || {};
        
        let rawTables = savedData.tables || [];
        if (savedData.tableUuid && rawTables.length === 0) {
            rawTables.push(savedData.tableUuid);
        }

        const resolvedTables = [];
        for (const uuid of rawTables) {
            const table = await fromUuid(uuid);
            if (table) {
                resolvedTables.push({
                    uuid: uuid,
                    name: table.name,
                    img: table.img || "icons/svg/d20.svg"
                });
            }
        }

        return {
            id: this.widgetId,
            tables: resolvedTables,
            isGM: this.isGM
        };
    }

    async render() {
        const data = await this._prepareContext();
        if (!data.isGM) return `
            <div class="cc-widget-rolltable" id="widget-${this.widgetId}">
            </div>
        `;
        const tablesHtml = data.tables.map(table => `
            <div class="rt-card" data-uuid="${table.uuid}" title="Click to Roll: ${table.name}">
                <div class="rt-card-content">
                    <img src="${table.img}" class="rt-img"/>
                    <span class="rt-name">${table.name}</span>
                </div>
                ${data.isGM ? `<div class="rt-remove-wrapper"><i class="fas fa-trash rt-remove" data-action="remove" title="Remove Table"></i></div>` : ''}
            </div>
        `).join("");

        const dropZoneHtml = data.isGM ? `
            <div class="cc-rt-drop-area ${data.tables.length === 0 ? 'large' : 'small'}">
                <i class="fas fa-dice-d20"></i>
                <span>Drop RollTable Here</span>
            </div>
        ` : '';

        return `
            <div class="cc-widget-rolltable" id="widget-${this.widgetId}">
                <div class="rt-list">
                    ${tablesHtml}
                </div>
                ${data.tables.length > 0 ? ``: dropZoneHtml}
                ${!data.isGM && data.tables.length === 0 ? `<div class="rt-empty">No tables linked.</div>` : ''}
            </div>
        `;
    }

    async activateListeners(htmlElement) {
        if (this.isGM) {
            htmlElement.addEventListener('drop', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                let data;
                try {
                    data = JSON.parse(event.dataTransfer.getData('text/plain'));
                } catch (err) { return; }

                if (data.type !== "RollTable" || !data.uuid) {
                    return ui.notifications.warn("Please drop a RollTable document.");
                }

                await this._addTable(data.uuid, htmlElement);
            });
        }

        htmlElement.querySelectorAll('.rt-card').forEach(card => {
            card.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const uuid = e.currentTarget.dataset.uuid;
                const table = await fromUuid(uuid);
                
                if (table) {
                    await table.draw();
                } else {
                    ui.notifications.error("Linked RollTable not found.");
                }
            });
        });

        htmlElement.querySelectorAll('[data-action="remove"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation(); 
                const uuid = e.currentTarget.closest('.rt-card').dataset.uuid;
                await this._removeTable(uuid, htmlElement);
            });
        });
    }

    async _addTable(uuid, htmlElement) {
        const savedData = (await this.getData()) || {};
        let tables = savedData.tables || [];
        if (savedData.tableUuid && tables.length === 0) tables.push(savedData.tableUuid);

        if (!tables.includes(uuid)) {
            tables.push(uuid);
            await this.saveData({ tables: tables, tableUuid: null });
            this._refreshWidget(htmlElement);
        }
    }

    async _removeTable(uuid, htmlElement) {
        const savedData = (await this.getData()) || {};
        let tables = savedData.tables || [];
        
        if (savedData.tableUuid === uuid) {
            await this.saveData({ tableUuid: null, tables: [] });
        } else {
            tables = tables.filter(t => t !== uuid);
            await this.saveData({ tables: tables });
        }
        this._refreshWidget(htmlElement);
    }

    async _refreshWidget(htmlElement) {
        const newHtml = await this.render();
        if (htmlElement.parentElement) {
            htmlElement.innerHTML = newHtml;
            this.activateListeners(htmlElement);
        }
    }
}