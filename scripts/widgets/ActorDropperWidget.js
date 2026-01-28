import { CampaignCodexWidget } from "./CampaignCodexWidget.js";

export class ActorDropperWidget extends CampaignCodexWidget {
    constructor(widgetId, widgetData, document) {
        super(widgetId, widgetData, document);
        this._pendingUpdates = {};
        this._debouncedSave = foundry.utils.debounce(this._processPendingSaves.bind(this), 500);
    }

    async _prepareContext() {
        const savedData = (await this.getData()) || {};
        let actors = savedData.actors || [];

        const resolvedActors = [];
        for (const entry of actors) {
            const actor = await fromUuid(entry.uuid);
            if (actor) {
                let cr = "";
                if (game.system.id === "dnd5e") {
                    const actorCr = actor.system.details?.cr;
                    if (actorCr !== undefined && actorCr !== null) {
                        cr = typeof actorCr === 'number' ? actorCr : actorCr;
                    }
                }

                let quantity = entry.quantity || 1;
                if (this._pendingUpdates[entry.uuid] !== undefined) {
                    quantity = this._pendingUpdates[entry.uuid];
                }

                resolvedActors.push({
                    uuid: entry.uuid,
                    name: actor.name,
                    img: actor.img || "icons/svg/mystery-man.svg",
                    quantity: quantity,
                    cr: cr,
                    showCr: game.system.id === "dnd5e"
                });
            }
        }

        return {
            id: this.widgetId,
            title: savedData.title || "Actor Dropper",
            actors: resolvedActors,
            isGM: this.isGM,
            showCrColumn: game.system.id === "dnd5e"
        };
    }

    async render() {
        const data = await this._prepareContext();
        if (!data.isGM) return `
            <div class="cc-widget-actor-dropper is-empty" id="widget-${this.widgetId}">
            </div>
        `;
        return foundry.applications.handlebars.renderTemplate("modules/campaign-codex/templates/widgets/actor-dropper.hbs", data);
    }

    async activateListeners(htmlElement) {
        if (!this.isGM) return;

        htmlElement.querySelector('.ad-title-input')?.addEventListener('change', async (e) => {
            e.preventDefault();
            const newTitle = e.target.value;
            const savedData = (await this.getData()) || {};
            await this.saveData({ ...savedData, title: newTitle });
        });

        htmlElement.querySelectorAll('.ad-quantity-input').forEach(input => {
            input.addEventListener('change', (e) => {
                e.preventDefault();
                const uuid = e.target.dataset.uuid;
                const newVal = parseInt(e.target.value) || 1;
                this._queueUpdate(uuid, newVal);
            });
        });

        htmlElement.querySelectorAll('.ad-remove-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const uuid = e.currentTarget.dataset.uuid;
                await this._removeActor(uuid, htmlElement);
            });
        });

        htmlElement.querySelector('.ad-drop-map-btn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await this._dropToMap();
        });

        // Drag and Drop
        htmlElement.addEventListener('drop', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            let data;
            try { data = JSON.parse(event.dataTransfer.getData('text/plain')); } catch (err) { return; }

            if (data.type === "Actor" && data.uuid) {
                await this._addActor(data.uuid, htmlElement);
            } else {
                ui.notifications.warn("Please drop an Actor document.");
            }
        });
        htmlElement.querySelectorAll('.inventory-item').forEach(row => {
            row.addEventListener('click', async (e) => {
                if (e.target.closest('.ad-quantity-input') || e.target.closest('.ad-remove-btn')) return;

                e.preventDefault();
                const uuid = e.currentTarget.dataset.uuid;
                const actor = await fromUuid(uuid);
                if (actor) {
                    actor.sheet.render(true);
                }
            });
        });

    }

    _queueUpdate(uuid, newVal) {
        this._pendingUpdates[uuid] = newVal;
        this._debouncedSave();
    }

    async _processPendingSaves() {
        if (Object.keys(this._pendingUpdates).length === 0) return;

        const savedData = (await this.getData()) || {};
        let actors = savedData.actors || [];

        let hasChanges = false;
        for (const [uuid, val] of Object.entries(this._pendingUpdates)) {
            const index = actors.findIndex(a => a.uuid === uuid);
            if (index !== -1) {
                if (actors[index].quantity !== val) {
                    actors[index].quantity = val;
                    hasChanges = true;
                }
            }
        }

        if (hasChanges) {
            await this.saveData({ ...savedData, actors: actors });
            this._pendingUpdates = {};
        }
    }

    async _addActor(uuid, htmlElement) {
        const savedData = (await this.getData()) || {};
        let actors = savedData.actors || [];

        const existingIndex = actors.findIndex(a => a.uuid === uuid);
        if (existingIndex !== -1) {
            actors[existingIndex].quantity = (actors[existingIndex].quantity || 0) + 1;
        } else {
            actors.push({ uuid: uuid, quantity: 1 });
        }

        await this.saveData({ ...savedData, actors: actors });
        this._refreshWidget(htmlElement);
    }

    async _removeActor(uuid, htmlElement) {
        const savedData = (await this.getData()) || {};
        let actors = savedData.actors || [];

        actors = actors.filter(a => a.uuid !== uuid);

        await this.saveData({ ...savedData, actors: actors });
        this._refreshWidget(htmlElement);
    }

    async _dropToMap() {
        const savedData = (await this.getData()) || {};
        const actorsData = savedData.actors || [];

        if (actorsData.length === 0) {
            return ui.notifications.warn("No actors to drop.");
        }

        const npcsToDrop = [];
        for (const entry of actorsData) {
            const actor = await fromUuid(entry.uuid);
            if (actor) {
                for (let i = 0; i < entry.quantity; i++) {
                    npcsToDrop.push(actor);
                }
            }
        }

        if (npcsToDrop.length === 0) {
            return ui.notifications.warn("Could not find actor data.");
        }

        try {
            if (game.campaignCodexNPCDropper) {
                await game.campaignCodexNPCDropper.dropActorsToScene(npcsToDrop, { title: "Drop Actors to Map" });
            } else {
                console.error("Campaign Codex | game.campaignCodexNPCDropper not found.");
                ui.notifications.error("Dropper utility not available.");
            }
        } catch (error) {
            console.error("Campaign Codex | Error in ActorDropperWidget drop:", error);
            ui.notifications.error("Failed to drop actors.");
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
