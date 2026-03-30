import { CampaignCodexWidget } from "./CampaignCodexWidget.js";
import { localize } from "../helper.js";

function normalizeJournalLink(entry) {
    if (typeof entry === "string") {
        const uuid = String(entry).trim();
        return uuid ? { uuid, visible: false, name: "" } : null;
    }

    if (!entry || typeof entry !== "object") return null;
    const uuid = String(entry.uuid || "").trim();
    if (!uuid) return null;

    return {
        uuid,
        visible: !!entry.visible,
        name: String(entry.name || "").trim(),
    };
}

function normalizeJournalLinks(rawLinks) {
    if (!Array.isArray(rawLinks)) return [];
    const links = rawLinks.map(normalizeJournalLink).filter(Boolean);
    const seen = new Set();
    return links.filter((entry) => {
        if (seen.has(entry.uuid)) return false;
        seen.add(entry.uuid);
        return true;
    });
}

function hasDisplayImage(path) {
    const src = String(path || "").trim();
    if (!src) return false;
    return !src.startsWith("icons/svg/");
}

function getCampaignCodexImage(doc) {
    const target = doc?.documentName === "JournalEntryPage" ? doc.parent : doc;
    if (!target || target.documentName !== "JournalEntry") return "";
    const flagImage = target.getFlag?.("campaign-codex", "image");
    return String(flagImage || "").trim();
}

function getJournalDisplayImage(doc) {
    if (!doc) return "";

    const campaignCodexImage = getCampaignCodexImage(doc);
    if (campaignCodexImage) return campaignCodexImage;

    if (doc.documentName === "JournalEntryPage") {
        if (doc.type === "image" && hasDisplayImage(doc.src)) return doc.src;
        if (hasDisplayImage(doc.parent?.img)) return doc.parent.img;
        return "";
    }

    if (doc.documentName === "JournalEntry" && hasDisplayImage(doc.img)) {
        return doc.img;
    }

    return "";
}

export class JournalSheetWidget extends CampaignCodexWidget {
    async _prepareContext() {
        const savedData = (await this.getData()) || {};
        const links = normalizeJournalLinks(savedData.links || []);

        const resolved = await Promise.all(links.map(async (entry) => {
            const doc = await fromUuid(entry.uuid).catch(() => null);
            const exists = !!doc && (doc.documentName === "JournalEntry" || doc.documentName === "JournalEntryPage");
            const canView = this.isGM
                ? true
                : !!doc && (
                    doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)
                    || (doc.documentName === "JournalEntryPage"
                        && doc.parent?.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER))
                );
            const name = exists
                ? (String(doc.name || "").trim() || entry.name || "Journal")
                : (entry.name || "Missing Journal");
            const img = exists ? getJournalDisplayImage(doc) : "";

            return {
                uuid: entry.uuid,
                name,
                visible: !!entry.visible,
                visibilityIcon: entry.visible ? "fa-eye" : "fa-eye-slash",
                visibilityTitle: entry.visible ? "Player Visible" : "Player Hidden",
                isMissing: !exists,
                canView,
                img,
                hasImage: !!img,
            };
        }));

        const visibleForUser = this.isGM
            ? resolved
            : resolved.filter((entry) => entry.visible && entry.canView);

        return {
            id: this.widgetId,
            isGM: this.isGM,
            sheets: visibleForUser,
        };
    }

    async render() {
        const data = await this._prepareContext();

        const cardsHtml = data.sheets.map((entry) => `
            <div
                class="rt-card cc-journal-card ${data.isGM ? entry.visibilityIcon : ""} ${data.isGM ? "with-actions " : ""} ${entry.isMissing ? "is-missing" : ""} ${entry.hasImage ? "" : "no-image"}"
                data-uuid="${entry.uuid}"
                title="${foundry.utils.escapeHTML(entry.isMissing ? `Missing Journal: ${entry.name}` : `Open: ${entry.name}`)}"
            >
                <div class="rt-card-content">
                    ${entry.hasImage ? `<img src="${entry.img}" class="rt-img"/>` : ""}
                    <span class="rt-name">${foundry.utils.escapeHTML(entry.name)}</span>
                </div>
                ${data.isGM ? `
                    <div class="rt-remove-wrapper cc-journal-actions">
                        <i
                            class="fas ${entry.visibilityIcon} rt-remove"
                            data-action="toggle-visibility"
                            title="${entry.visibilityTitle}"
                        ></i>
                        <i class="fas fa-trash rt-remove" data-action="remove" title="Remove Journal"></i>
                    </div>
                ` : ""}
            </div>
        `).join("");

        const dropZoneHtml = data.isGM ? `
            <div class="cc-rt-drop-area large">
                <i class="fas fa-book-open"></i>
                <span>Drop Journals Here</span>
            </div>
        ` : "";

        return `
            <div class="cc-widget-rolltable cc-widget-journal-sheet" id="widget-${this.widgetId}">
                <div class="rt-list">
                    ${cardsHtml}
                </div>
                ${data.isGM && data.sheets.length === 0 ? dropZoneHtml : ""}
            </div>
        `;
    }

    async activateListeners(htmlElement) {
        if (this.isGM) {
            htmlElement.addEventListener("dragover", (event) => {
                event.preventDefault();
            });

            htmlElement.addEventListener("drop", async (event) => {
                event.preventDefault();
                event.stopPropagation();

                let data;
                try {
                    data = JSON.parse(event.dataTransfer.getData("text/plain"));
                } catch (err) {
                    return;
                }

                if (!["JournalEntry", "JournalEntryPage"].includes(data?.type) || !data?.uuid) {
                    return ui.notifications.warn("Drop a Journal Entry here.");
                }

                await this._addJournalLink(data.uuid, htmlElement);
            });
        }

        htmlElement.querySelectorAll(".cc-journal-card").forEach((card) => {
            card.addEventListener("click", async (event) => {
                if (event.target.closest('[data-action="remove"]')) return;
                if (event.target.closest('[data-action="toggle-visibility"]')) return;

                const uuid = card.dataset.uuid;
                const doc = await fromUuid(uuid).catch(() => null);
                if (!doc) {
                    ui.notifications.warn(localize("notify.journalNotFound"));
                    return;
                }

                if (!this.isGM) {
                    const canView = doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)
                        || (doc.documentName === "JournalEntryPage"
                            && doc.parent?.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER));
                    if (!canView) {
                        ui.notifications.warn(localize("notify.journalNotFound"));
                        return;
                    }
                }
                await this._onOpenDocument(uuid, "journal entry");
            });
        });

        htmlElement.querySelectorAll('[data-action="toggle-visibility"]').forEach((btn) => {
            btn.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const uuid = event.currentTarget.closest(".cc-journal-card")?.dataset.uuid;
                if (!uuid) return;
                await this._toggleVisibility(uuid, htmlElement);
            });
        });

        htmlElement.querySelectorAll('[data-action="remove"]').forEach((btn) => {
            btn.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const uuid = event.currentTarget.closest(".cc-journal-card")?.dataset.uuid;
                if (!uuid) return;
                await this._removeJournalLink(uuid, htmlElement);
            });
        });
    }

    async _addJournalLink(uuid, htmlElement) {
        const doc = await fromUuid(uuid).catch(() => null);
        if (!doc || !["JournalEntry", "JournalEntryPage"].includes(doc.documentName)) return;

        const savedData = (await this.getData()) || {};
        const links = normalizeJournalLinks(savedData.links || []);
        if (links.some((entry) => entry.uuid === uuid)) return;

        links.push({
            uuid,
            visible: false,
            name: String(doc.name || "").trim(),
        });

        await this.saveData({ ...savedData, links });
        await this._refreshWidget(htmlElement);
    }

    async _toggleVisibility(uuid, htmlElement) {
        const savedData = (await this.getData()) || {};
        const links = normalizeJournalLinks(savedData.links || []);
        const index = links.findIndex((entry) => entry.uuid === uuid);
        if (index < 0) return;

        links[index].visible = !links[index].visible;
        await this.saveData({ ...savedData, links });
        await this._refreshWidget(htmlElement);
    }

    async _removeJournalLink(uuid, htmlElement) {
        const savedData = (await this.getData()) || {};
        const links = normalizeJournalLinks(savedData.links || []).filter((entry) => entry.uuid !== uuid);

        await this.saveData({ ...savedData, links });
        await this._refreshWidget(htmlElement);
    }

    async _refreshWidget(htmlElement) {
        const newHtml = await this.render();
        if (htmlElement.parentElement) {
            htmlElement.innerHTML = newHtml;
            this.activateListeners(htmlElement);
        }
    }
}
