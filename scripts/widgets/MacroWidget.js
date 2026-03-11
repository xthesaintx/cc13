import { CampaignCodexWidget } from "./CampaignCodexWidget.js";
import { localize, format } from "../helper.js";

export class MacroWidget extends CampaignCodexWidget {

    constructor(widgetId, widgetData, document) {
        super(widgetId, widgetData, document);
        this.macros = widgetData.macros || [];
    }

    async _prepareContext() {
        const savedData = (await this.getData()) || {};

        let rawMacros = savedData.macros || [];



        const resolvedMacros = (await Promise.all(rawMacros.map(async (uuid) => {
            const macro = await fromUuid(uuid);
            if (!macro) return null;
            return {
                uuid: uuid,
                name: macro.name,
                img: macro.img || "icons/svg/dice-target.svg",
                command: macro.command
            };
        }))).filter(Boolean);


        return {
            id: this.widgetId,
            macros: resolvedMacros,
            isGM: this.isGM
        };
    }

    async render() {
        const data = await this._prepareContext();

        if (!data.isGM) return `
            <div class="cc-widget-rolltable is-empty" id="widget-${this.widgetId}">
            </div>
        `;


        const macrosHtml = data.macros.map(macro => `
            <div class="rt-card macro-card" data-uuid="${macro.uuid}" title="Click to Execute: ${macro.name}">
                <div class="rt-card-content">
                    <img src="${macro.img}" class="rt-img"/>
                    <span class="rt-name">${macro.name}</span>
                </div>
                ${data.isGM ? `<div class="rt-remove-wrapper macro-actions-wrapper"><i class="fas fa-edit rt-remove rt-edit" data-action="edit" title="Edit Macro"></i><i class="fas fa-trash rt-remove" data-action="remove" title="Remove Macro"></i></div>` : ''}
            </div>
        `).join("");

        const dropZoneHtml = data.isGM ? `
            <div class="cc-rt-drop-area ${macrosHtml.length === 0 ? 'large' : 'small'}">
                <i class="fas fa-terminal"></i>
                <span>Drop Macros Here</span>
            </div>
        ` : '';

        return `
            <div class="cc-widget-rolltable" id="widget-${this.widgetId}">
                <div class="rt-list">
                    ${macrosHtml}
                </div>
                ${macrosHtml.length > 0 ? `` : dropZoneHtml}
                ${!data.isGM && macrosHtml.length === 0 ? `<div class="rt-empty">No macros linked.</div>` : ''}
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

                if (data.type !== "Macro" || !data.uuid) {
                    return ui.notifications.warn(localize('notify.dropMacro'));
                }

                await this._addMacro(data.uuid, htmlElement);
            });
        }

        htmlElement.querySelectorAll('.macro-card').forEach(card => {
            card.addEventListener('click', async (e) => {
                if (e.target.closest('[data-action="remove"]') || e.target.closest('[data-action="edit"]')) return;

                const uuid = card.dataset.uuid;
                const macro = await fromUuid(uuid);
                if (macro) {
                    macro.execute({'parentUuid': this.document.uuid});
                    ui.notifications.info(format('notify.macroExecuted', { name: macro.name }));
                } else {
                    ui.notifications.warn(localize('notify.macroNotFound'));
                }
            });
        });

        htmlElement.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const uuid = e.currentTarget.closest('.macro-card').dataset.uuid;
                await this._editMacro(uuid);
            });
        });

        htmlElement.querySelectorAll('[data-action="remove"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const uuid = e.currentTarget.closest('.macro-card').dataset.uuid;
                await this._removeMacro(uuid, htmlElement);
            });
        });
    }

    /**
     * Adds a macro to the widget. 
     * Call this from your Drop Handler in the main Codex Sheet.
     */
    async _addMacro(uuid, htmlElement) {
        const savedData = (await this.getData()) || {};
        let macros = savedData.macros || [];

        if (!macros.includes(uuid)) {
            macros.push(uuid);
            await this.saveData({ macros: macros });
            this._refreshWidget(htmlElement);
        }
    }

    async _editMacro(uuid) {
        const macro = await fromUuid(uuid);
        if (macro?.sheet) {
            macro.sheet.render(true);
        } else {
            ui.notifications.warn(localize('notify.macroNotFound'));
        }
    }

    async _removeMacro(uuid, htmlElement) {
        const savedData = (await this.getData()) || {};
        let macros = savedData.macros || [];

        macros = macros.filter(m => m !== uuid);
        await this.saveData({ macros: macros });

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
