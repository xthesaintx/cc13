import { CampaignCodexWidget } from "./CampaignCodexWidget.js";

export class RelationshipTrackerExtendedWidget extends CampaignCodexWidget {

    constructor(widgetId, widgetData, document) {
        super(widgetId, widgetData, document);
        this.relationships = widgetData.relationships || [];
    }

    async _prepareContext() {
        const savedData = (await this.getData()) || {};
        this.relationships = savedData.relationships || [];
        const title = savedData.title || "Relationships";
        this.showPlayers = savedData.showPlayers ?? true;
        
        const context = {
            id: this.widgetId,
            title: title,
            tracked: [],
            availableActors: []
        };

        const trackedUuids = new Set();
        
        for (const entry of this.relationships) {
            trackedUuids.add(entry.uuid);
            const actor = await fromUuid(entry.uuid);
            
            if (actor) {
                let status = "neutral";
                let icon = "fa-meh";
                let tooltip = "Neutral";

                if (entry.value > 0) {
                    status = "good";
                    icon = "fa-heart";
                    tooltip = "Good Relationship";
                } else if (entry.value < 0) {
                    status = "bad";
                    icon = "fa-skull";
                    tooltip = "Bad Relationship";
                }

                context.tracked.push({
                    uuid: entry.uuid,
                    name: actor.name,
                    img: actor.img,
                    value: entry.value,
                    status,
                    icon,
                    tooltip
                });
            }
        }

        if (this.isGM) {
            const allowedTypes = ["character", "player", "group"];

            const candidates = game.actors.filter(a => 
                allowedTypes.includes(a.type) && !trackedUuids.has(a.uuid)
            );            
            context.availableActors = candidates.map(a => ({
                uuid: a.uuid,
                name: a.name
            })).sort((a, b) => a.name.localeCompare(b.name));
        }

        return context;
    }

    async render() {
        const data = await this._prepareContext();
        const visIcon = this.showPlayers ? "fa-eye" : "fa-eye-slash";
        const visTitle = this.showPlayers ? "Visible to Players" : "Hidden from Players";
        const visStyle = this.showPlayers ? "" : "opacity: 0.5;";
        const optionsHtml = data.availableActors.length > 0 
            ? data.availableActors.map(a => `<option value="${a.uuid}">${a.name}</option>`).join("")
            : `<option value="" disabled>No more characters</option>`;

        const rowsHtml = data.tracked.map(char => `
            <div class="rel-row ${char.status}" data-uuid="${char.uuid}">
                <div class="rel-info">
                    <img src="${char.img}" class="rel-img" title="${char.name}"/>
                    <span class="rel-name">${char.name}</span>
                </div>
                
                <div class="rel-controls">
                    ${this.isGM ? `
                    <button class="rel-btn minus" data-action="adjust" data-delta="-1"><i class="fas fa-minus"></i></button>
                    ` : ''}
                    
                    <div class="rel-score" title="${char.tooltip}">
                        <i class="fas ${char.icon} rel-icon-status"></i>
                        <span class="rel-val-text">${char.value}</span>
                    </div>

                    ${this.isGM ? `
                    <button class="rel-btn plus" data-action="adjust" data-delta="1"><i class="fas fa-plus"></i></button>
                    <button class="rel-btn remove" data-action="remove" title="Remove Character"><i class="fas fa-trash"></i></button>
                    ` : ''}
                </div>
            </div>
        `).join("");

        return `
            <div class="cc-widget-relationship-extended" id="widget-${this.widgetId}" ${this.showPlayers || this.isGM ? `` : `style="display:none;"`}>
                
                <div class="rel-header">
                    ${this.isGM 
                        ? `<input type="text" class="rel-title-input" value="${data.title}" placeholder="Widget Title" title="Click to edit title"/>` 
                        : `<h4 class="rel-title">${data.title}</h4>`
                    }
                ${this.isGM ? `
                <div class="rel-add-bar">
                    <a class="rel-toggle-vis" title="${visTitle}" style="margin-right: 8px; ${visStyle}">
                        <i class="fas ${visIcon}"></i>
                    </a>
                    <select class="rel-select">
                        <option value="">Select Character...</option>
                        ${optionsHtml}
                    </select>
                </div>
                ` : ''}
                </div>

                <div class="rel-list">
                    ${rowsHtml || `<div class="rel-empty">No relationships tracked.</div>`}
                </div>

            </div>
        `;
    }

    async activateListeners(htmlElement) {
        if (!this.isGM) return;
        
        const titleInput = htmlElement.querySelector('.rel-title-input');
        if (titleInput) {
            titleInput.addEventListener('change', async (e) => {
                e.preventDefault();
                await this._saveTitle(e.target.value);
            });
        }
        
htmlElement.querySelector('.rel-toggle-vis')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await this._saveShowPlayers(!this.showPlayers, htmlElement);
        });

        htmlElement.querySelector('.rel-select')?.addEventListener('change', async (e) => {
            e.preventDefault();
            const select = htmlElement.querySelector('.rel-select');
            const uuid = select.value;
            if (uuid) await this._addCharacter(uuid, htmlElement);
        });

        // Remove Character
        htmlElement.querySelectorAll('.rel-btn.remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const uuid = e.currentTarget.closest('.rel-row').dataset.uuid;
                await this._removeCharacter(uuid, htmlElement);
            });
        });

        // Adjust Score (+ / -)
        htmlElement.querySelectorAll('.rel-btn[data-action="adjust"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const uuid = e.currentTarget.closest('.rel-row').dataset.uuid;
                const delta = parseInt(e.currentTarget.dataset.delta);
                await this._updateScore(uuid, delta, htmlElement);
            });
        });
    }
    async _saveShowPlayers(isVisible) {
        const savedData = (await this.getData()) || {};
        await this.saveData({ ...savedData, showPlayers: isVisible });
    }
    async _saveTitle(newTitle) {
        const savedData = (await this.getData()) || {};
        await this.saveData({ ...savedData, title: newTitle });
    }
    
    async _addCharacter(uuid, htmlElement) {
        const savedData = (await this.getData()) || {};
        const list = savedData.relationships || [];
        
        if (!list.find(r => r.uuid === uuid)) {
            list.push({ uuid: uuid, value: 0 });
            await this.saveData({ relationships: list });
            this._refreshWidget(htmlElement);
        }
    }

    async _removeCharacter(uuid, htmlElement) {
        const savedData = (await this.getData()) || {};
        let list = savedData.relationships || [];
        
        list = list.filter(r => r.uuid !== uuid);
        
        await this.saveData({ relationships: list });
        this._refreshWidget(htmlElement);
    }

    async _updateScore(uuid, delta, htmlElement) {
        const savedData = (await this.getData()) || {};
        const list = savedData.relationships || [];
        
        const entry = list.find(r => r.uuid === uuid);
        if (entry) {
            entry.value += delta;
            await this.saveData({ relationships: list });
            this._refreshWidget(htmlElement);
        }
    }

    async _refreshWidget(htmlElement) {
        const newHtml = await this.render();
        htmlElement.innerHTML = newHtml;
        this.activateListeners(htmlElement);
    }
}