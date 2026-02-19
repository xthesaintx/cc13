import { CampaignCodexWidget } from "./CampaignCodexWidget.js";
import { localize } from "../helper.js";

export class SceneWidget extends CampaignCodexWidget {
    constructor(widgetId, widgetData, document) {
        super(widgetId, widgetData, document);
        this.scenes = widgetData.scenes || [];
    }

    async _prepareContext() {
        const savedData = (await this.getData()) || {};
        const rawScenes = savedData.scenes || [];

        const resolvedScenes = (await Promise.all(rawScenes.map(async (uuid) => {
            const scene = await fromUuid(uuid).catch(() => null);
            if (!scene) return null;
            return {
                uuid: scene.uuid,
                id: scene.id,
                name: scene.name,
                img: scene.background?.src || "icons/svg/mountain.svg"
            };
        }))).filter(Boolean);

        return {
            id: this.widgetId,
            scenes: resolvedScenes,
            isGM: this.isGM
        };
    }

    async render() {
        const data = await this._prepareContext();
        if (!data.isGM) {
            return `
                <div class="cc-widget-rolltable is-empty" id="widget-${this.widgetId}">
                </div>
            `;
        }

        const scenesHtml = data.scenes.map((scene) => `
            <div class="rt-card scene-card scene-name" data-scene-uuid="${scene.uuid}" title="Click to Open: ${scene.name}">
                <div class="rt-card-content">
                    <img src="${scene.img}" class="rt-img"/>
                    <span class="rt-name">${scene.name}</span>
                </div>
                <div class="rt-remove-wrapper"><i class="fas fa-trash rt-remove" data-action="remove" title="Remove Scene"></i></div>
            </div>
        `).join("");

        const dropZoneHtml = `
            <div class="cc-rt-drop-area ${data.scenes.length === 0 ? "large" : "small"}">
                <i class="fas fa-map"></i>
                <span>Drop Scenes Here</span>
            </div>
        `;

        return `
            <div class="cc-widget-rolltable" id="widget-${this.widgetId}">
                <div class="rt-list">
                    ${scenesHtml}
                </div>
                ${data.scenes.length > 0 ? "" : dropZoneHtml}
            </div>
        `;
    }

    async activateListeners(htmlElement) {
        if (this.isGM) {
            htmlElement.addEventListener("drop", async (event) => {
                event.preventDefault();
                event.stopPropagation();

                let data;
                try {
                    data = JSON.parse(event.dataTransfer.getData("text/plain"));
                } catch (err) {
                    return;
                }

                if (data.type !== "Scene" || !data.uuid) {
                    return ui.notifications.warn("Drop a Scene here.");
                }

                await this._addScene(data.uuid, htmlElement);
            });
        }

        htmlElement.querySelectorAll(".scene-card").forEach((card) => {
            card.addEventListener("click", async (e) => {
                if (e.target.closest('[data-action="remove"]')) return;
                const sceneUuid = e.currentTarget.dataset.sceneUuid;
                await this._viewScene(sceneUuid);
            });
        });

        htmlElement.querySelectorAll('[data-action="remove"]').forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const sceneUuid = e.currentTarget.closest(".scene-card").dataset.sceneUuid;
                await this._removeScene(sceneUuid, htmlElement);
            });
        });

    }


    _sceneFromDataset(sceneUuid) {
        if (!sceneUuid) return null;
        const parsed = foundry.utils.parseUuid(sceneUuid);
        const id = parsed?.id || sceneUuid;
        return game.scenes.get(id) || null;
    }

    async _viewScene(sceneUuid) {
        const scene = this._sceneFromDataset(sceneUuid);
        if (!scene) {
            ui.notifications.warn(localize("warn.scenenotfound"));
            return;
        }
        await scene.view();
    }

    async _addScene(uuid, htmlElement) {
        const savedData = (await this.getData()) || {};
        const scenes = savedData.scenes || [];

        if (!scenes.includes(uuid)) {
            scenes.push(uuid);
            await this.saveData({ scenes });
            this._refreshWidget(htmlElement);
        }
    }

    async _removeScene(uuid, htmlElement) {
        const savedData = (await this.getData()) || {};
        let scenes = savedData.scenes || [];

        scenes = scenes.filter((s) => s !== uuid);
        await this.saveData({ scenes });
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
