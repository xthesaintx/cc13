import { CampaignCodexWidget } from "./CampaignCodexWidget.js";
import {CampaignCodexLinkers} from "../sheets/linkers.js";

export class MerchantCounterWidget extends CampaignCodexWidget {

    constructor(widgetId, widgetData, document) {
        super(widgetId, widgetData, document);
        this._pendingUpdates = {};
        this._debouncedSave = foundry.utils.debounce(this._processPendingSaves.bind(this), 1000);
    }

    async _prepareContext() {
        const savedData = (await this.getData()) || {};
        
        let rawTables = savedData.restockTables || [];
        
        if (savedData.restockTableUuid && rawTables.length === 0) {
            rawTables.push(savedData.restockTableUuid);
        }

        const normalizedTables = rawTables.map(entry => {
            let data = typeof entry === 'string' ? { uuid: entry, multiplier: 1 } : { uuid: entry.uuid, multiplier: entry.multiplier || 1 };
            
            if (this._pendingUpdates[data.uuid] !== undefined) {
                data.multiplier = this._pendingUpdates[data.uuid];
            }
            
            return data;
        });

        const resolvedTables = [];
        for (const entry of normalizedTables) {
            const table = await fromUuid(entry.uuid);
            if (table) {
                resolvedTables.push({
                    uuid: entry.uuid,
                    name: table.name,
                    img: table.img || "icons/svg/d20.svg",
                    multiplier: entry.multiplier
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
            <div class="cc-widget-merchant-counter" id="widget-${this.widgetId}">
            </div>
        `;

        const tablesHtml = data.tables.map(table => `
            <div class="mc-table-card" data-uuid="${table.uuid}">
                <div class="mc-card-content" title="Click to Open Table">
                    <img src="${table.img}" class="mc-table-img"/>
                    <span class="mc-table-name">${table.name}</span>
                </div>
                
                ${data.isGM ? `
                <div class="mc-card-actions" style="display: flex; align-items: center;">
                    <button class="mc-multiplier-btn" title="Left-click: Increase (1,2,3,4,5,10)\nRight-click: Decrease" >x${table.multiplier}</button>
                    <i class="fas fa-dice-d20 mc-action-icon" data-action="restockTable" title="Roll this table"></i>
                    <i class="fas fa-trash mc-action-icon remove" data-action="removeTable" title="Unlink Table"></i>
                </div>
                ` : ''}
            </div>
        `).join("");

        const dropZoneHtml = data.isGM && data.tables.length === 0 ? `
            <div class="mc-drop-zone ${data.tables.length > 0 ? 'small' : ''}">
                <i class="fas fa-plus-circle"></i> Drop Restock Table
            </div>
        ` : ``;

        return `
            <div class="cc-widget-merchant-counter" id="widget-${this.widgetId}">
                <div class="mc-restock-section">
                    <div class="mc-table-list">
                        ${tablesHtml}
                    </div>
                    
                    ${dropZoneHtml}

                    ${data.isGM && data.tables.length > 0 ? `
                        <button class="mc-restock-btn" data-action="restockAll">
                            <i class="fas fa-boxes-packing"></i> Restock All Tables
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    async activateListeners(htmlElement) {

        htmlElement.querySelectorAll('.mc-card-content').forEach(content => {
            content.addEventListener('click', async (e) => {
                e.preventDefault();
                const uuid = e.currentTarget.closest('.mc-table-card').dataset.uuid;
                const table = await fromUuid(uuid);
                if (table) table.sheet.render(true);
            });
        });

        if (!this.isGM) return;

        htmlElement.querySelectorAll('.mc-multiplier-btn').forEach(btn => {
            const handleUpdate = (e, direction) => {
                e.preventDefault();
                e.stopPropagation();
                
                const card = e.currentTarget.closest('.mc-table-card');
                const uuid = card.dataset.uuid;
                
                const currentText = e.currentTarget.textContent.replace('x', '');
                const currentVal = parseInt(currentText) || 1;
                const nextVal = direction === 'up' ? this._getNextMultiplier(currentVal) : this._getPrevMultiplier(currentVal);
                
                e.currentTarget.textContent = `x${nextVal}`;
                
                this._queueUpdate(uuid, nextVal);
            };

            btn.addEventListener('click', (e) => handleUpdate(e, 'up'));
            btn.addEventListener('contextmenu', (e) => handleUpdate(e, 'down'));
        });

        htmlElement.querySelectorAll('.mc-action-icon').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const action = e.currentTarget.dataset.action;
                const uuid = e.currentTarget.closest('.mc-table-card').dataset.uuid;

                if (action === "restockTable") await this._restockShop(htmlElement, uuid);
                if (action === "removeTable") await this._removeTable(uuid, htmlElement);
            });
        });

        htmlElement.querySelector('button[data-action="restockAll"]')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await this._restockShop(htmlElement, null); // null = all
        });

        htmlElement.addEventListener('drop', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            let data;
            try { data = JSON.parse(event.dataTransfer.getData('text/plain')); } catch (err) { return; }
                if (data.type !== "RollTable" || !data.uuid) {
                    return ui.notifications.warn("Please drop a RollTable document.");
                }
                await this._addTable(data.uuid, htmlElement);
            });
    }

    _getNextMultiplier(current) {
        const values = [1, 2, 3, 4, 5, 10];
        const idx = values.indexOf(current);
        if (idx === -1 || idx === values.length - 1) return values[0];
        return values[idx + 1];
    }

    _getPrevMultiplier(current) {
        const values = [1, 2, 3, 4, 5, 10];
        const idx = values.indexOf(current);
        if (idx === -1 || idx === 0) return values[values.length - 1];
        return values[idx - 1];
    }

    _queueUpdate(uuid, newVal) {
        this._pendingUpdates[uuid] = newVal;
        this._debouncedSave();
    }

    async _processPendingSaves() {
        if (Object.keys(this._pendingUpdates).length === 0) return;

        const savedData = (await this.getData()) || {};
        let tables = savedData.restockTables || [];

        tables = tables.map(t => typeof t === 'string' ? { uuid: t, multiplier: 1 } : t);

        let hasChanges = false;


        for (const [uuid, val] of Object.entries(this._pendingUpdates)) {
            const index = tables.findIndex(t => t.uuid === uuid);
            if (index !== -1) {
                if (tables[index].multiplier !== val) {
                    tables[index].multiplier = val;
                    hasChanges = true;
                }
            }
        }

        if (hasChanges) {
            await this.saveData({ ...savedData, restockTables: tables });
            
            this._pendingUpdates = {};
        }
    }

    async _addTable(uuid, htmlElement) {
        const savedData = (await this.getData()) || {};
        let tables = savedData.restockTables || [];
        
        if (savedData.restockTableUuid && tables.length === 0) {
            tables.push({uuid: savedData.restockTableUuid, multiplier: 1});
        }
        
        tables = tables.map(t => typeof t === 'string' ? { uuid: t, multiplier: 1 } : t);

        if (!tables.find(t => t.uuid === uuid)) {
            tables.push({ uuid: uuid, multiplier: 1 });
            await this.saveData({ ...savedData, restockTables: tables, restockTableUuid: null });
            this._refreshWidget(htmlElement);
        }
    }

    async _removeTable(uuid, htmlElement) {
        const savedData = (await this.getData()) || {};
        let tables = savedData.restockTables || [];
        
        tables = tables.map(t => typeof t === 'string' ? { uuid: t, multiplier: 1 } : t);

        tables = tables.filter(t => t.uuid !== uuid);
        await this.saveData({ ...savedData, restockTables: tables, restockTableUuid: null });
        this._refreshWidget(htmlElement);
    }

async _restockShop(htmlElement, specificTableUuid = null) {
    const savedData = (await this.getData()) || {};
    let rawTables = savedData.restockTables || [];
    if (savedData.restockTableUuid && rawTables.length === 0) rawTables.push(savedData.restockTableUuid);

    let allTables = rawTables.map(t => typeof t === 'string' ? { uuid: t, multiplier: 1 } : t);

    allTables = allTables.map(t => {
        if (this._pendingUpdates[t.uuid] !== undefined) {
            return { ...t, multiplier: this._pendingUpdates[t.uuid] };
        }
        return t;
    });

    let targetTables = specificTableUuid 
        ? allTables.filter(t => t.uuid === specificTableUuid) 
        : allTables;

    if (targetTables.length === 0) return ui.notifications.warn("No restock tables linked.");

    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const inventory = foundry.utils.deepClone(currentData.inventory || []);
    
    let cachedInventory = [];
    const activeSheet = Object.values(this.document.apps)[0];
    if (activeSheet && activeSheet._processedData && activeSheet._processedData.inventory) {
        cachedInventory = activeSheet._processedData.inventory;
    } else {
        cachedInventory = await CampaignCodexLinkers.getInventory(this.document, inventory);
    }
    const workingCache = [...cachedInventory];

    const drawPromises = [];
    for (const tableEntry of targetTables) {
        const table = await fromUuid(tableEntry.uuid);
        if (!table) continue;

        const multiplier = tableEntry.multiplier || 1;
        for(let i = 0; i < multiplier; i++) {
            drawPromises.push(table.draw({displayChat: false}));
        }
    }

    const draws = await Promise.all(drawPromises);
    const allResults = draws.flatMap(d => d.results || []);

    if (allResults.length === 0) return ui.notifications.warn("No valid items found in roll results.");

    const validUuids = [];
    for (const r of allResults) {
        let itemUuid = r.documentUuid;
        
        if (!itemUuid && r.text && r.text.includes("@UUID[")) {
            const match = r.text.match(/@UUID\[([^\]]+)\]/);
            if (match) itemUuid = match[1];
        }

        if (itemUuid && typeof itemUuid === "string" && itemUuid.includes("Item.")) {
            validUuids.push(itemUuid);
        }
    }

    const fetchedItems = await Promise.all(validUuids.map(uuid => fromUuid(uuid).catch(() => null)));
    
    let totalItemsAdded = 0;

    for (const item of fetchedItems) {
        if (!item) continue;

        const existingCacheItem = workingCache.find(i => 
            i.itemUuid === item.uuid || 
            (i.name === item.name && i.img === item.img && i.type === item.type)
        );

        if (existingCacheItem) {
            const inventoryEntry = inventory.find(i => i.itemUuid === existingCacheItem.itemUuid);
            
            if (inventoryEntry) {
                inventoryEntry.quantity = (inventoryEntry.quantity || 0) + 1;
            } else {
                inventory.push({ itemUuid: item.uuid, quantity: 1, customPrice: null });
            }
        } else {
            inventory.push({ itemUuid: item.uuid, quantity: 1, customPrice: null });
            workingCache.push({
                itemUuid: item.uuid,
                name: item.name,
                img: item.img,
                type: item.type,
                quantity: 1 
            });
        }
        totalItemsAdded++;
    }

    if (totalItemsAdded > 0) {
        await this.document.setFlag("campaign-codex", "data.inventory", inventory);
        ui.notifications.info(`Restocked ${totalItemsAdded} items.`);
    } else {
        ui.notifications.warn("No valid items found in roll results.");
    }
}


    async _refreshWidget(htmlElement) {
        if (htmlElement) {
            const newHtml = await this.render();
            htmlElement.innerHTML = newHtml;
            this.activateListeners(htmlElement);
        }
    }
}