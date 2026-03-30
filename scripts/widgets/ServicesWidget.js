import { CampaignCodexWidget } from "./CampaignCodexWidget.js";
import { CampaignCodexLinkers } from "../sheets/linkers.js";
import { EconomyHelper } from "../economy-helper.js";
import { localize } from "../helper.js";
import { TemplateComponents } from "../sheets/template-components.js";

export class ServicesWidget extends CampaignCodexWidget {
    get isDnd5e() {
        return game.system?.id === "dnd5e";
    }

    get isPf2e() {
        return game.system?.id === "pf2e";
    }

    _getServiceTypeOptions() {
        const options = [{ value: "standard", label: "Standard" }];
        if (this.isDnd5e) {
            options.push({ value: "spellScroll", label: "Spell Scroll" });
            options.push({ value: "spellScrollList", label: "Spell Scroll from List" });
            options.push({ value: "castSpell", label: "Cast Spell (Chat)" });
        }
        if (this.isPf2e) {
            options.push({ value: "pf2eSpellConsumable", label: "Spell Consumable" });
            options.push({ value: "castSpell", label: "Cast Spell (Chat)" });
        }
        return options;
    }

    _normalizeServiceType(rawType) {
        const allowed = new Set(this._getServiceTypeOptions().map((o) => o.value));
        const nextType = String(rawType || "standard");
        return allowed.has(nextType) ? nextType : "standard";
    }

    _isSpellService(serviceType = "standard") {
        return ["spellScroll", "spellScrollList", "pf2eSpellConsumable", "castSpell"].includes(serviceType);
    }

    _isSpellCostService(serviceType = "standard") {
        return ["spellScroll", "spellScrollList", "pf2eSpellConsumable"].includes(serviceType);
    }

    _normalizePf2eConsumableType(rawType = "") {
        const value = String(rawType || "scroll").toLowerCase();
        return value === "wand" ? "wand" : "scroll";
    }

    _getServiceTypeLabel(serviceType = "standard") {
        if (serviceType === "spellScroll") return "Spell Scroll";
        if (serviceType === "spellScrollList") return "Spell Scroll from List";
        if (serviceType === "pf2eSpellConsumable") return "Spell Consumable";
        if (serviceType === "castSpell") return "Cast Spell (Chat)";
        return "Standard";
    }

    _getDnd5eSpellListOptions() {
        if (!this.isDnd5e) return [];
        const options = game.dnd5e?.registry?.spellLists?.options || [];
        return options
            .map((option) => ({ value: String(option.value), label: String(option.label || option.value) }))
            .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true }));
    }

    _extractSpellLevel(spellDoc, serviceType = "standard") {
        if (!spellDoc || spellDoc.type !== "spell") return null;
        if (serviceType === "pf2eSpellConsumable") {
            const rank = Number(spellDoc?.system?.level?.value ?? spellDoc?.baseRank ?? 0);
            return Number.isFinite(rank) ? rank : 0;
        }
        const level = Number(spellDoc?.system?.level ?? 0);
        return Number.isFinite(level) ? level : 0;
    }

    _formatLevelLabel(level, serviceType = "standard") {
        const n = Math.max(0, Number(level || 0));
        if (serviceType === "pf2eSpellConsumable") return n === 0 ? "Cantrip" : `Rank ${n}`;
        if (n === 0) return "Cantrip";
        if (n === 1) return "1st Level";
        if (n === 2) return "2nd Level";
        if (n === 3) return "3rd Level";
        return `${n}th Level`;
    }

    _formatPrice(amount) {
        const value = Math.round(Number(amount || 0) * 100) / 100;
        return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }

    _levelFactor(level) {
        const normalized = Math.max(0, Number(level || 0));
        return normalized === 0 ? 0.5 : normalized;
    }

    _getSpellBaseLevel(spell, serviceType = "standard") {
        if (serviceType === "pf2eSpellConsumable") {
            const rank = Number(spell?.system?.level?.value ?? spell?.baseRank ?? 0);
            return Math.max(0, Math.min(10, Number.isFinite(rank) ? rank : 0));
        }
        const level = Number(spell?.system?.level ?? 0);
        return Math.max(0, Math.min(9, Number.isFinite(level) ? level : 0));
    }

    _getSpellMaxLevel(spell, serviceType = "standard") {
        const baseLevel = this._getSpellBaseLevel(spell, serviceType);
        if (serviceType === "pf2eSpellConsumable") return 10;
        return spell?.system?.canScale ? 9 : baseLevel;
    }

    _calculateServiceCost(service, { selectedLevel, spellItems = [] } = {}) {
        const baseCost = Math.max(Number(service.cost || 0), 0);
        if (!this._isSpellCostService(service.serviceType)) return baseCost;
        if (!service.chargePerLevel) return baseCost;

        if (Number.isFinite(Number(selectedLevel))) {
            return Math.round(baseCost * this._levelFactor(Number(selectedLevel)) * 100) / 100;
        }

        if (!Array.isArray(spellItems) || spellItems.length === 0) return baseCost;
        const sum = spellItems.reduce((acc, spell) => acc + this._levelFactor(this._getSpellBaseLevel(spell, service.serviceType)), 0);
        return Math.round(baseCost * sum * 100) / 100;
    }

    _normalizeService(service = {}) {
        const serviceType = this._normalizeServiceType(service.serviceType);
        const links = Array.isArray(service.links) ? service.links : [];

        return {
            id: service.id || foundry.utils.randomID(),
            title: String(service.title || "").trim(),
            description: String(service.description || "").trim(),
            cost: Math.max(Number(service.cost || 0), 0),
            timeNeeded: String(service.timeNeeded || "").trim(),
            serviceType,
            chargePerLevel: this._isSpellCostService(serviceType) ? !!service.chargePerLevel : false,
            allowUpcast: this._isSpellCostService(serviceType) ? (service.allowUpcast !== false) : false,
            spellListValues: serviceType === "spellScrollList" ? (Array.isArray(service.spellListValues) ? service.spellListValues.map(String).filter(Boolean) : []) : [],
            pf2eConsumableType: serviceType === "pf2eSpellConsumable" ? this._normalizePf2eConsumableType(service.pf2eConsumableType) : "scroll",
            links: links
                .filter((l) => l?.uuid)
                .map((l) => ({
                    uuid: String(l.uuid),
                    type: "item",
                    name: String(l.name || ""),
                    img: String(l.img || "")
                }))
        };
    }

    async _prepareContext() {
        const savedData = (await this.getData()) || {};
        const currency = String(CampaignCodexLinkers.getCurrency() || "gp").toLowerCase();
        const rawServices = Array.isArray(savedData.services) ? savedData.services : [];

        const services = [];
        for (const rawService of rawServices) {
            const service = this._normalizeService(rawService);
            const resolvedLinks = [];

            for (const link of service.links) {
                const doc = await fromUuid(link.uuid).catch(() => null);
                resolvedLinks.push({
                    ...link,
                    name: doc?.name || link.name || "Missing Link",
                    img: doc?.img || link.img || "icons/svg/book.svg",
                    missing: !doc,
                    itemType: doc?.documentName === "Item" ? doc.type : null,
                    level: doc?.documentName === "Item" ? this._extractSpellLevel(doc, service.serviceType) : null
                });
            }

            const listOptions = this._getDnd5eSpellListOptions();
            const spellListLabels = service.spellListValues
                .map((value) => listOptions.find((opt) => opt.value === value)?.label || value)
                .filter(Boolean);

            services.push({ ...service, links: resolvedLinks, spellListLabels });
        }

        return { id: this.widgetId, services, currency, isGM: this.isGM, canPurchase: !!game.user?.character };
    }

    _renderLinkedCardsSection(service, context) {
        const linksHtml = (service.links || []).map((link) => {
            const missingClass = link.missing ? " is-missing" : "";
            return `
                <div class="cc-service-link${missingClass}" data-uuid="${link.uuid}" data-link-type="item" title="Open linked item">
                    <span class="cc-service-link-name">${foundry.utils.escapeHTML(link.name || "Linked")}</span>
                    ${context.isGM ? `<i class="fas fa-times-circle" data-action="unlink" data-link-uuid="${link.uuid}" title="Unlink"></i>` : ""}
                </div>
            `;
        }).join("");

        return `<div class="cc-service-links-wrap">${linksHtml || `<span class="cc-service-muted">No links</span>`}</div>`;
    }

    _renderSpellPricingSection(service, context) {
        const spells = (service.links || [])
            .filter((l) => l.itemType === "spell" && Number.isFinite(Number(l.level)))
            .sort((a, b) => Number(a.level) - Number(b.level) || a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));

        if (spells.length === 0) return `<div class="cc-service-links-wrap"><span class="cc-service-muted">No spells linked</span></div>`;

        const byLevel = new Map();
        for (const spell of spells) {
            const level = Number(spell.level);
            if (!byLevel.has(level)) byLevel.set(level, []);
            byLevel.get(level).push(spell);
        }

        const groups = [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, entries]) => {
            const price = this._formatPrice(this._calculateServiceCost(service, { selectedLevel: level }));
            const cards = entries.map((spell) => `
                <div class="cc-service-link${spell.missing ? " is-missing" : ""}" data-uuid="${spell.uuid}" data-link-type="item" title="Open linked item">
                    <span class="cc-service-link-name">${foundry.utils.escapeHTML(spell.name || "Unnamed Spell")}</span>
                    ${context.isGM ? `<i class="fas fa-times-circle" data-action="unlink" data-link-uuid="${spell.uuid}" title="Unlink"></i>` : ""}
                </div>
            `).join("");
            return `<div class="cc-service-scroll-group"><div class="cc-service-scroll-price">${price} ${foundry.utils.escapeHTML(context.currency)}</div><div class="cc-service-scroll-cards">${cards}</div></div>`;
        }).join("");

        return `<div class="cc-service-links-wrap"><div class="cc-service-scroll-grid">${groups}</div></div>`;
    }

    _renderSpellListSection(service) {
        const chips = (service.spellListLabels || []).map((l) => `<span class="cc-service-list-chip">${foundry.utils.escapeHTML(l)}</span>`).join("");
        return `
            <div class="cc-service-links-wrap">
                ${chips ? `<div class="cc-service-list-chips">${chips}</div>` : `<span class="cc-service-muted">No spell lists selected</span>`}
                ${service.chargePerLevel ? `<div class="cc-service-muted cc-fineprint">Final price is shown during purchase after selecting spell and level.</div>` : ""}
            </div>
        `;
    }

    _renderServiceRow(service, context) {
        const title = foundry.utils.escapeHTML(service.title || "Untitled Service");
        const description = foundry.utils.escapeHTML(service.description || "");
        const cost = this._formatPrice(service.cost || 0);
        const currency = foundry.utils.escapeHTML(context.currency);
        const typeLabel = this._getServiceTypeLabel(service.serviceType);
        const timeNeeded = foundry.utils.escapeHTML(service.timeNeeded || "-");

        let details = this._renderLinkedCardsSection(service, context);
        if (service.serviceType === "spellScrollList") details = this._renderSpellListSection(service);
        else if (["spellScroll", "pf2eSpellConsumable"].includes(service.serviceType) && service.chargePerLevel) details = this._renderSpellPricingSection(service, context);

        return `
            <div class="cc-service-row rt-card" data-service-id="${service.id}">
                <div class="cc-service-top-row">
                    <div class="cc-service-title-wrap">
                        <div class="cc-service-title">${title}</div>
                        <span class="cc-service-type-badge">${foundry.utils.escapeHTML(typeLabel)}</span>
                    </div>
                    <div class="cc-service-actions">
                        ${context.canPurchase ? `<button type="button" data-action="purchase-service" title="Purchase"><i class="fas fa-coins"></i></button>` : ""}
                        ${context.isGM ? `<button type="button" data-action="send-service-player" title="Send to Player"><i class="fas fa-paper-plane"></i></button>` : ""}
                        ${context.isGM ? `<button type="button" data-action="edit-service" title="Edit"><i class="fas fa-pen"></i></button>` : ""}
                        ${context.isGM ? `<button type="button" data-action="delete-service" title="Delete"><i class="fas fa-trash"></i></button>` : ""}
                    </div>
                </div>

                <div class="cc-service-description">${description || `<span class="cc-service-muted">No description</span>`}</div>
                <div class="cc-service-meta-row">
                    <span><strong>Cost:</strong> ${cost} ${currency}</span>
                    <span><strong>Time Needed:</strong> ${timeNeeded}</span>
                    ${this._isSpellCostService(service.serviceType) && context.isGM ? `<span><strong>Charge Per Level:</strong> ${service.chargePerLevel ? "Yes" : "No"}</span>` : ""}
                    ${this._isSpellCostService(service.serviceType) && context.isGM ? `<span><strong>Allow Upcast:</strong> ${service.allowUpcast ? "Yes" : "No"}</span>` : ""}
                </div>
                ${details}
            </div>
        `;
    }

    async render() {
        const data = await this._prepareContext();
        const rows = data.services.map((s) => this._renderServiceRow(s, data)).join("");
        return `
            <div class="cc-widget-services" id="widget-${this.widgetId}">
                <div class="cc-services-header">${data.isGM ? `<button type="button" data-action="add-service"><i class="fas fa-circle-plus"></i> Add Service</button>` : ""}</div>
                <div class="cc-services-table">${rows || `<div class="rt-empty">No services configured.</div>`}</div>
            </div>
        `;
    }

    async activateListeners(htmlElement) {
        htmlElement.querySelector('[data-action="add-service"]')?.addEventListener("click", async (e) => {
            e.preventDefault();
            await this._openServiceDialog(null, htmlElement);
        });

        htmlElement.querySelectorAll("[data-action='edit-service']").forEach((btn) => btn.addEventListener("click", async (e) => {
            e.preventDefault();
            const service = this._getServiceFromEvent(e);
            if (!service) return;
            await this._openServiceDialog(service, htmlElement);
        }));

        htmlElement.querySelectorAll("[data-action='delete-service']").forEach((btn) => btn.addEventListener("click", async (e) => {
            e.preventDefault();
            const service = this._getServiceFromEvent(e);
            if (!service) return;
            const proceed = await this.confirmationDialog(`Delete service "${service.title || "Untitled"}"?`);
            if (!proceed) return;
            await this._saveServices((services) => services.filter((s) => s.id !== service.id));
            await this._refreshWidget(htmlElement);
        }));

        htmlElement.querySelectorAll("[data-action='purchase-service']").forEach((btn) => btn.addEventListener("click", async (e) => {
            e.preventDefault();
            const service = this._getServiceFromEvent(e);
            if (!service) return;
            await this._purchaseService(service);
        }));

        htmlElement.querySelectorAll("[data-action='send-service-player']").forEach((btn) => btn.addEventListener("click", async (e) => {
            e.preventDefault();
            if (!this.isGM) return;
            const service = this._getServiceFromEvent(e);
            if (!service) return;
            const serviceName = service.title || "Service";
            await TemplateComponents.createPlayerSelectionDialog(serviceName, async (targetActor, deductFunds) => {
                await this._purchaseService(service, { targetActor, deductFunds: !!deductFunds });
            });
        }));

        htmlElement.querySelectorAll("[data-action='unlink']").forEach((btn) => btn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!this.isGM) return;
            const service = this._getServiceFromEvent(e);
            if (!service) return;
            const linkUuid = e.currentTarget.dataset.linkUuid;
            await this._saveServices((services) => services.map((s) => s.id === service.id ? { ...s, links: (s.links || []).filter((l) => l.uuid !== linkUuid) } : s));
            await this._refreshWidget(htmlElement);
        }));

        htmlElement.querySelectorAll(".cc-service-link").forEach((el) => el.addEventListener("click", async (e) => {
            const actionTarget = e.target.closest("[data-action]");
            if (actionTarget) return;
            await this._onOpenDocument(e.currentTarget.dataset.uuid, "linked document");
        }));

        if (!this.isGM) return;

        htmlElement.addEventListener("dragover", (e) => {
            if (!e.target.closest(".cc-service-row")) return;
            e.preventDefault();
        });

        htmlElement.addEventListener("drop", async (e) => {
            const row = e.target.closest(".cc-service-row");
            if (!row) return;
            e.preventDefault();
            e.stopPropagation();

            let data;
            try {
                data = JSON.parse(e.dataTransfer.getData("text/plain"));
            } catch {
                return;
            }

            if (!data?.uuid || data?.type !== "Item") {
                ui.notifications.warn("Drop an Item.");
                return;
            }

            const service = this._getServiceById(row.dataset.serviceId);
            if (!service) return;
            if (service.serviceType === "spellScrollList") {
                ui.notifications.warn("Spell Scroll from List uses selected spell lists. Edit service to configure lists.");
                return;
            }

            const droppedDoc = await fromUuid(data.uuid).catch(() => null);
            if (!droppedDoc || droppedDoc.documentName !== "Item") {
                ui.notifications.warn("Only Items can be linked.");
                return;
            }
            if (this._isSpellService(service.serviceType) && droppedDoc.type !== "spell") {
                ui.notifications.warn("This service only accepts spell items.");
                return;
            }

            await this._saveServices((services) => services.map((entry) => {
                if (entry.id !== service.id) return entry;
                const links = Array.isArray(entry.links) ? [...entry.links] : [];
                if (!links.some((l) => l.uuid === data.uuid)) {
                    links.push({ uuid: data.uuid, type: "item", name: data.name || "", img: data.img || "" });
                }
                return { ...entry, links };
            }));
            await this._refreshWidget(htmlElement);
        });
    }

    _getServiceFromEvent(event) {
        const row = event.target.closest(".cc-service-row");
        if (!row) return null;
        return this._getServiceById(row.dataset.serviceId);
    }

    _getServiceById(serviceId) {
        const savedData = this.document.getFlag("campaign-codex", `data.widgets.${this.widgetType}.${this.widgetId}`) || {};
        const services = Array.isArray(savedData.services) ? savedData.services : [];
        return services.find((s) => s.id === serviceId) || null;
    }

    async _openServiceDialog(existingService, htmlElement) {
        if (!this.isGM) return;

        const service = this._normalizeService(existingService || {});
        const typeOptions = this._getServiceTypeOptions().map((option) => `<option value="${option.value}" ${service.serviceType === option.value ? "selected" : ""}>${option.label}</option>`).join("");
        const listOptions = this._getDnd5eSpellListOptions();
        const listOptionsHtml = listOptions.map((option) => `<option value="${foundry.utils.escapeHTML(option.value)}" ${service.spellListValues.includes(option.value) ? "selected" : ""}>${foundry.utils.escapeHTML(option.label)}</option>`).join("");

        const result = await foundry.applications.api.DialogV2.prompt({
            window: { title: existingService ? "Edit Service" : "Create Service" },
            content: `
                <div class="form-group"><label>Title</label><input type="text" name="title" value="${foundry.utils.escapeHTML(service.title)}" autofocus /></div>
                <div class="form-group"><label>Description</label><textarea name="description" rows="3">${foundry.utils.escapeHTML(service.description)}</textarea></div>
                <div class="form-group"><label>Cost</label><input type="number" name="cost" min="0" step="0.01" value="${service.cost}" /></div>
                <div class="form-group"><label>Time Needed</label><input type="text" name="timeNeeded" value="${foundry.utils.escapeHTML(service.timeNeeded)}" /></div>
                <div class="form-group"><label>Service Type</label><select name="serviceType">${typeOptions}</select></div>
                <div class="form-group" id="cc-service-charge-per-level-group" ${this._isSpellCostService(service.serviceType) ? "" : "hidden"}><label><input type="checkbox" name="chargePerLevel" ${service.chargePerLevel ? "checked" : ""}/> Charge per level (cantrip = 0.5)</label></div>
                <div class="form-group" id="cc-service-allow-upcast-group" ${this._isSpellCostService(service.serviceType) ? "" : "hidden"}><label><input type="checkbox" name="allowUpcast" ${service.allowUpcast ? "checked" : ""}/> Allow upcast</label></div>
                ${this.isDnd5e ? `<div class="form-group" id="cc-service-spell-list-group" ${service.serviceType === "spellScrollList" ? "" : "hidden"}><label>Spell Lists (Ctrl/Cmd for multiple)</label><select name="spellListValues" multiple size="8">${listOptionsHtml}</select></div>` : ""}
                ${this.isPf2e ? `<div class="form-group" id="cc-service-pf2e-type-group" ${service.serviceType === "pf2eSpellConsumable" ? "" : "hidden"}><label>Default PF2E Output</label><select name="pf2eConsumableType"><option value="scroll" ${service.pf2eConsumableType === "scroll" ? "selected" : ""}>Scroll</option><option value="wand" ${service.pf2eConsumableType === "wand" ? "selected" : ""}>Wand</option></select></div>` : ""}
            `,
            render: (dialog) => {
                const form = dialog.target.element.querySelector("form");
                if (!form) return;
                const serviceTypeSelect = form.querySelector('[name="serviceType"]');
                const chargePerLevelGroup = form.querySelector("#cc-service-charge-per-level-group");
                const allowUpcastGroup = form.querySelector("#cc-service-allow-upcast-group");
                const spellListGroup = form.querySelector("#cc-service-spell-list-group");
                const pf2eTypeGroup = form.querySelector("#cc-service-pf2e-type-group");

                const updateVisibility = () => {
                    const typeValue = serviceTypeSelect?.value || "standard";
                    if (chargePerLevelGroup) chargePerLevelGroup.hidden = !this._isSpellCostService(typeValue);
                    if (allowUpcastGroup) allowUpcastGroup.hidden = !this._isSpellCostService(typeValue);
                    if (spellListGroup) spellListGroup.hidden = typeValue !== "spellScrollList";
                    if (pf2eTypeGroup) pf2eTypeGroup.hidden = typeValue !== "pf2eSpellConsumable";
                };

                serviceTypeSelect?.addEventListener("change", updateVisibility);
                updateVisibility();
            },
            ok: {
                label: localize("dialog.save"),
                callback: (event, button) => {
                    const form = button.form;
                    const serviceType = this._normalizeServiceType(form.elements.serviceType?.value || "standard");
                    const selectedLists = form.querySelector('[name="spellListValues"]')
                        ? Array.from(form.querySelector('[name="spellListValues"]').selectedOptions).map((opt) => String(opt.value || "")).filter(Boolean)
                        : [];

                    return {
                        ...service,
                        title: String(form.elements.title.value || "").trim(),
                        description: String(form.elements.description.value || "").trim(),
                        cost: Math.max(Number(form.elements.cost.value || 0), 0),
                        timeNeeded: String(form.elements.timeNeeded.value || "").trim(),
                        serviceType,
                        chargePerLevel: this._isSpellCostService(serviceType) ? !!form.elements.chargePerLevel?.checked : false,
                        allowUpcast: this._isSpellCostService(serviceType) ? !!form.elements.allowUpcast?.checked : false,
                        spellListValues: serviceType === "spellScrollList" ? selectedLists : [],
                        pf2eConsumableType: serviceType === "pf2eSpellConsumable" ? this._normalizePf2eConsumableType(form.elements.pf2eConsumableType?.value) : "scroll"
                    };
                }
            },
            cancel: { label: localize("dialog.cancel") },
            rejectClose: false
        }).catch(() => null);

        if (!result) return;

        await this._saveServices((services) => {
            const idx = services.findIndex((s) => s.id === result.id);
            if (idx >= 0) {
                const next = [...services];
                next[idx] = { ...next[idx], ...result };
                return next;
            }
            return [...services, result];
        });

        await this._refreshWidget(htmlElement);
    }

    async _getSpellsForService(service) {
        if (!this._isSpellService(service.serviceType)) return [];

        if (["spellScroll", "pf2eSpellConsumable", "castSpell"].includes(service.serviceType)) {
            const docs = await Promise.all((service.links || []).map((link) => fromUuid(link.uuid).catch(() => null)));
            return docs.filter((doc) => doc?.documentName === "Item" && doc.type === "spell");
        }

        if (service.serviceType === "spellScrollList") {
            const values = Array.isArray(service.spellListValues) ? service.spellListValues : [];
            if (!this.isDnd5e || values.length === 0) return [];

            const registry = game.dnd5e?.registry?.spellLists;
            if (!registry?.forType) return [];

            const uuids = new Set();
            for (const value of values) {
                try {
                    const list = registry.forType(value);
                    for (const uuid of list?.uuids || []) uuids.add(uuid);
                } catch {
                    // ignore invalid list
                }
            }

            const docs = await Promise.all([...uuids].map((uuid) => fromUuid(uuid).catch(() => null)));
            return docs.filter((doc) => doc?.documentName === "Item" && doc.type === "spell");
        }

        return [];
    }

    async _promptForSpellPurchase(spellItems = [], service, currency, serviceTitle) {
        if (!Array.isArray(spellItems) || spellItems.length === 0) return null;

        const sortedSpells = [...spellItems].sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base", numeric: true }));
        const spellOptionsHtml = sortedSpells.map((spell, index) => `<option value="${index}" ${index === 0 ? "selected" : ""}>${foundry.utils.escapeHTML(spell.name)} (${this._formatLevelLabel(this._getSpellBaseLevel(spell, service.serviceType), service.serviceType)})</option>`).join("");

        const showLevelSelector = this._isSpellCostService(service.serviceType) && service.allowUpcast;
        const levelLabel = service.serviceType === "pf2eSpellConsumable" ? "Rank" : "Scroll Level";

        const result = await foundry.applications.api.DialogV2.wait({
            window: { title: `Purchase: ${serviceTitle}` },
            content: `
                <div class="form-group"><label>Spell</label><select name="spellIndex">${spellOptionsHtml}</select></div>
                <div class="form-group" id="cc-service-level-group" ${showLevelSelector ? "" : "hidden"}><label>${levelLabel}</label><select name="targetLevel"></select></div>
                <div class="form-group"><label>New Cost</label><input type="text" name="newCost" readonly /></div>
            `,
            buttons: [
                { action: "confirm", label: localize("dialog.confirm"), default: true, callback: (event, button) => ({
                    spellIndex: Number(button.form.elements.spellIndex.value),
                    targetLevel: Number(button.form.elements.targetLevel.value)
                })},
                { action: "cancel", label: localize("dialog.cancel"), callback: () => null }
            ],
            render: (dialog) => {
                const form = dialog.target.element.querySelector("form");
                if (!form) return;

                const spellSelect = form.elements.spellIndex;
                const levelSelect = form.elements.targetLevel;
                const costInput = form.elements.newCost;
                const levelGroup = form.querySelector("#cc-service-level-group");

                const updateLevelOptions = () => {
                    const spell = sortedSpells[Number(spellSelect.value)];
                    const base = this._getSpellBaseLevel(spell, service.serviceType);
                    const max = showLevelSelector ? this._getSpellMaxLevel(spell, service.serviceType) : base;
                    const options = [];
                    for (let lvl = base; lvl <= max; lvl++) {
                        options.push(`<option value="${lvl}" ${lvl === base ? "selected" : ""}>${this._formatLevelLabel(lvl, service.serviceType)}</option>`);
                    }
                    levelSelect.innerHTML = options.join("");
                    if (levelGroup) levelGroup.hidden = !showLevelSelector;
                };

                const updateCost = () => {
                    const selectedLevel = Number(levelSelect.value);
                    const value = this._calculateServiceCost(service, { selectedLevel });
                    costInput.value = `${this._formatPrice(value)} ${String(currency || "gp").toLowerCase()}`;
                };

                spellSelect.addEventListener("change", () => {
                    updateLevelOptions();
                    updateCost();
                });
                levelSelect.addEventListener("change", updateCost);

                updateLevelOptions();
                updateCost();
            },
            rejectClose: false
        }).catch(() => null);

        if (!result) return null;
        const spell = sortedSpells[result.spellIndex];
        if (!spell) return null;

        const baseLevel = this._getSpellBaseLevel(spell, service.serviceType);
        const maxLevel = showLevelSelector ? this._getSpellMaxLevel(spell, service.serviceType) : baseLevel;
        const targetLevel = Math.max(baseLevel, Math.min(maxLevel, Number(result.targetLevel || baseLevel)));
        const cost = this._calculateServiceCost(service, { selectedLevel: targetLevel });

        return {
            spell,
            targetLevel,
            cost,
            consumableType: service.serviceType === "pf2eSpellConsumable" ? this._normalizePf2eConsumableType(service.pf2eConsumableType) : null
        };
    }

    async _promptForSpellSelection(spellItems = [], serviceTitle = "Cast Spell") {
        if (!Array.isArray(spellItems) || spellItems.length === 0) return null;

        const sortedSpells = [...spellItems].sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base", numeric: true }));
        const options = sortedSpells.map((spell, idx) => `<option value="${idx}" ${idx === 0 ? "selected" : ""}>${foundry.utils.escapeHTML(spell.name)}</option>`).join("");

        const index = await foundry.applications.api.DialogV2.wait({
            window: { title: `Cast Spell: ${serviceTitle}` },
            content: `<div class="form-group"><label>Spell</label><select name="spellIndex">${options}</select></div>`,
            buttons: [
                { action: "confirm", label: localize("dialog.confirm"), default: true, callback: (event, button) => Number(button.form.elements.spellIndex.value) },
                { action: "cancel", label: localize("dialog.cancel"), callback: () => null }
            ],
            rejectClose: false
        }).catch(() => null);

        if (!Number.isFinite(index) || index < 0 || index >= sortedSpells.length) return null;
        return sortedSpells[index] || null;
    }

    _formatDescriptionWithInlineRolls(description) {
        const raw = description == null ? "" : String(description);
        if (!raw) return "";

        // Convert plain dice formulas to Foundry slash-roll inline syntax.
        return raw.replace(/(^|[^@\w\]])(\d+d\d+(?:\s*[+\-]\s*\d+)?)(?!\s*])/gi, (match, prefix, formula) => {
            const normalized = String(formula).replace(/\s+/g, " ").trim();
            return `${prefix}[[/roll ${normalized}]]`;
        });
    }

    _buildDocLinkSpan(doc, fallbackLabel = "Document") {
        const label = foundry.utils.escapeHTML(String(fallbackLabel || "Document"));
        const uuid = doc?.uuid ? String(doc.uuid) : "";
        const link = uuid ? `@UUID[${uuid}]{${label}}` : label;
        return `${link}`;
    }

    _buildCurrencySpan(amount, currency) {
        const value = `${this._formatPrice(amount)} ${String(currency || "gp").toUpperCase()}`;
        return `${foundry.utils.escapeHTML(value)}`;
    }

    async _postSpellToChat(spell, actor = null, serviceTitle = "Cast Spell") {
        if (!spell) return false;

        const description = spell?.system?.description?.value ?? spell?.system?.description ?? "";
        const parsedDescription = this._formatDescriptionWithInlineRolls(description);

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ alias: "Spell Reference" }),
            content: `
                <div class="cc-service-spell-chat-card">
                    <h3>${foundry.utils.escapeHTML(spell.name || "Spell")}</h3>
                    <p><em>${foundry.utils.escapeHTML(serviceTitle)}</em></p>
                    ${spell?.img ? `<img src="${foundry.utils.escapeHTML(spell.img)}" width="36" height="36" alt="${foundry.utils.escapeHTML(spell.name || "Spell")}">` : ""}
                    <div>${parsedDescription}</div>
                </div>
            `
        });
        return true;
    }

    async _createDnd5eScrollOnActor(spellItem, actor, targetLevel) {
        const Item5eClass = globalThis?.dnd5e?.documents?.Item5e;
        if (!Item5eClass || typeof Item5eClass.createScrollFromSpell !== "function") {
            ui.notifications.warn("dnd5e spell scroll creation API not available.");
            return { success: false, itemDoc: null };
        }

        let spellInput = spellItem;
        // if (spellItem?.pack) {
        //     spellInput = foundry.utils.deepClone(spellItem.toObject());
        //     delete spellInput.pack;
        // }
        const scroll = await Item5eClass.createScrollFromSpell(spellInput, {}, { dialog: false, explanation: "reference", level: targetLevel }).catch(() => null);
        const scrollData = scroll?.toObject?.();
        if (!scrollData) return { success: false, itemDoc: null };

        delete scrollData._id;
        const existing = actor.items.find((i) => i.name === scrollData.name && i.type === scrollData.type && i.img === scrollData.img);
        if (existing) {
            const qty = Number(existing.system?.quantity || 0);
            await existing.update({ "system.quantity": qty + 1 });
            return { success: true, itemDoc: existing };
        } else {
            const created = await actor.createEmbeddedDocuments("Item", [scrollData]);
            return { success: created.length > 0, itemDoc: created[0] || null };
        }
    }

    async _createPf2eConsumableFromSpell(spell, { type = "scroll", rank } = {}) {
        const consumableType = this._normalizePf2eConsumableType(type);
        const spellObject = spell?.toObject ? spell.toObject() : foundry.utils.deepClone(spell);
        if (!spellObject) return null;

        const baseRank = this._getSpellBaseLevel(spell, "pf2eSpellConsumable");
        const finalRank = Math.max(baseRank, Math.min(10, Number.isFinite(Number(rank)) ? Number(rank) : baseRank));

        const data = CONFIG.PF2E?.spellcastingItems?.[consumableType];
        const templateUuid = data?.compendiumUuids?.[finalRank] || null;
        if (!templateUuid) return null;

        const baseItem = await fromUuid(templateUuid).catch(() => null);
        if (!baseItem || baseItem.type !== "consumable") return null;

        const source = baseItem.toObject();
        source._id = null;

        const traits = source.system?.traits || { value: [], rarity: "common" };
        const spellTraits = Array.isArray(spellObject?.system?.traits?.value) ? spellObject.system.traits.value : [];
        traits.value = [...new Set([...(traits.value || []), ...spellTraits])];
        traits.rarity = spellObject?.system?.traits?.rarity || spellObject?.rarity || traits.rarity;
        traits.value.sort();
        source.system.traits = traits;

        const nameTemplate = data?.nameTemplate;
        source.name = nameTemplate
            ? game.i18n.format(nameTemplate, { name: spellObject.name, level: finalRank })
            : `${consumableType === "wand" ? "Wand" : "Scroll"} of ${spellObject.name} (Rank ${finalRank})`;

        const spellLink = spell?.sourceId
            ? `@UUID[${spell.sourceId}]{${spellObject.name}}`
            : (spell?.uuid ? `@UUID[${spell.uuid}]{${spellObject.name}}` : (spellObject?.system?.description?.value || spellObject.name));
        source.system.description.value = `<p>${spellLink}</p><hr />${source.system.description.value}`;

        source.system.spell = foundry.utils.mergeObject(spellObject, {
            _id: foundry.utils.randomID(),
            system: { location: { value: null, heightenedLevel: finalRank } }
        }, { inplace: false });

        return source;
    }

    async _createPf2eConsumableOnActor(spellItem, actor, rank, consumableType) {
        const data = await this._createPf2eConsumableFromSpell(spellItem, { type: consumableType, rank });
        if (!data) return { success: false, itemDoc: null };

        delete data._id;
        const existing = actor.items.find((i) => i.name === data.name && i.type === data.type && i.img === data.img);
        if (existing) {
            const qty = Number(existing.system?.quantity || 0);
            await existing.update({ "system.quantity": qty + 1 });
            return { success: true, itemDoc: existing };
        } else {
            const created = await actor.createEmbeddedDocuments("Item", [data]);
            return { success: created.length > 0, itemDoc: created[0] || null };
        }
    }

    async _purchaseService(service, options = {}) {
        let targetActor = options.targetActor || game.user?.character;
        let shouldDeductFunds = options.deductFunds !== undefined ? !!options.deductFunds : true;
        if (!targetActor && service.serviceType === "castSpell") shouldDeductFunds = false;

        if (!targetActor && service.serviceType !== "castSpell") {
            ui.notifications.warn("Assign a player character before purchasing services.");
            return;
        }

        const serviceTitle = service.title || "Service";
        const currency = String(CampaignCodexLinkers.getCurrency() || "gp").toLowerCase();

        if (["spellScroll", "spellScrollList", "pf2eSpellConsumable"].includes(service.serviceType)) {
            if (["spellScroll", "spellScrollList"].includes(service.serviceType) && !this.isDnd5e) {
                ui.notifications.warn("This spell service requires dnd5e.");
                return;
            }
            if (service.serviceType === "pf2eSpellConsumable" && !this.isPf2e) {
                ui.notifications.warn("This spell service requires pf2e.");
                return;
            }

            const spells = await this._getSpellsForService(service);
            if (spells.length === 0) {
                ui.notifications.warn("No spells are available for this service.");
                return;
            }

            const purchase = await this._promptForSpellPurchase(spells, service, currency, serviceTitle);
            if (!purchase) return;

            if (shouldDeductFunds && purchase.cost > 0) {
                const paymentItem = { name: serviceTitle, system: { price: { value: purchase.cost, denomination: currency } } };
                const hasPaid = await EconomyHelper.removeCost(paymentItem, targetActor, { customPrice: purchase.cost }, 1, 1);
                if (!hasPaid) return;
            }

            let created = false;
            let createdItem = null;
            let typeLabel = "Scroll";
            if (service.serviceType === "pf2eSpellConsumable") {
                const outType = this._normalizePf2eConsumableType(purchase.consumableType || service.pf2eConsumableType);
                const result = await this._createPf2eConsumableOnActor(purchase.spell, targetActor, purchase.targetLevel, outType);
                created = result.success;
                createdItem = result.itemDoc;
                typeLabel = outType === "wand" ? "Wand" : "Scroll";
            } else {
                const result = await this._createDnd5eScrollOnActor(purchase.spell, targetActor, purchase.targetLevel);
                created = result.success;
                createdItem = result.itemDoc;
            }

            const actorSpan = this._buildDocLinkSpan(targetActor, targetActor?.name || game.user.name);
            const serviceSpan = this._buildDocLinkSpan(this.document, serviceTitle);
            const spellSpan = this._buildDocLinkSpan(purchase.spell, purchase.spell?.name || "Spell");
            const costSpan = this._buildCurrencySpan(purchase.cost, currency);
            const typeSpan = createdItem ? this._buildDocLinkSpan(createdItem, typeLabel) : this._buildDocLinkSpan(null, typeLabel);
            const levelLabel = this._formatLevelLabel(purchase.targetLevel, service.serviceType);
            const timeText = service.timeNeeded ? ` Estimated time: ${foundry.utils.escapeHTML(service.timeNeeded)}.` : "";
            const createdText = created ? " Consumable created." : "";
            const noFundsText = shouldDeductFunds ? "" : " No funds deducted.";

            await ChatMessage.create({
                content: `
                    ${actorSpan} used ${serviceSpan} for ${costSpan}
                    <p>Spell: ${spellSpan}</p>
                    <p>Type: ${typeSpan}</p>
                    <p>Level: ${foundry.utils.escapeHTML(levelLabel)}</p>
                    ${timeText ? `<p>${timeText.trim()}</p>` : ""}
                    ${createdText ? `<p>${createdText.trim()}</p>` : ""}
                    ${noFundsText ? `<p>${noFundsText.trim()}</p>` : ""}
                `,
                speaker: ChatMessage.getSpeaker()
            });
            return;
        }

        if (service.serviceType === "castSpell") {
            const spells = await this._getSpellsForService(service);
            if (spells.length === 0) {
                ui.notifications.warn("No spells are available for this service.");
                return;
            }

            const selectedSpell = await this._promptForSpellSelection(spells, serviceTitle);
            if (!selectedSpell) return;

            const chargeCost = Math.max(Number(service.cost || 0), 0);
            if (shouldDeductFunds && !targetActor) {
                ui.notifications.warn("No actor available to deduct funds.");
                return;
            }
            if (shouldDeductFunds && chargeCost > 0) {
                const paymentItem = { name: serviceTitle, system: { price: { value: chargeCost, denomination: currency } } };
                const hasPaid = await EconomyHelper.removeCost(paymentItem, targetActor, { customPrice: chargeCost }, 1, 1);
                if (!hasPaid) return;
            }

            await this._postSpellToChat(selectedSpell, targetActor, serviceTitle);

            const actorSpan = this._buildDocLinkSpan(targetActor, targetActor?.name || game.user.name);
            const serviceSpan = this._buildDocLinkSpan(this.document, serviceTitle);
            const spellSpan = this._buildDocLinkSpan(selectedSpell, selectedSpell?.name || "Spell");
            const costSpan = this._buildCurrencySpan(chargeCost, currency);
            const timeText = service.timeNeeded ? `Estimated time: ${foundry.utils.escapeHTML(service.timeNeeded)}.` : "";
            const noFundsText = shouldDeductFunds ? "" : " No funds deducted.";
            await ChatMessage.create({
                content: `
                    ${actorSpan} used ${serviceSpan} for ${costSpan}
                    <p>Spell: ${spellSpan}</p>
                    ${timeText ? `<p>${timeText}</p>` : ""}
                    ${noFundsText ? `<p>${noFundsText.trim()}</p>` : ""}
                `,
                speaker: ChatMessage.getSpeaker()
            });
            return;
        }

        const linkedDocs = await Promise.all((service.links || []).map((link) => fromUuid(link.uuid).catch(() => null)));
        const linkedItems = linkedDocs.filter((doc) => doc?.documentName === "Item");
        const chargeCost = Math.max(Number(service.cost || 0), 0);

        if (shouldDeductFunds && chargeCost > 0) {
            const paymentItem = { name: serviceTitle, system: { price: { value: chargeCost, denomination: currency } } };
            const hasPaid = await EconomyHelper.removeCost(paymentItem, targetActor, { customPrice: chargeCost }, 1, 1);
            if (!hasPaid) return;
        }

        let itemsDelivered = 0;
        const deliveredItemSpans = [];
        for (const item of linkedItems) {
            const itemData = item.toObject();
            delete itemData._id;

            const existing = targetActor.items.find((i) =>
                i.getFlag("core", "_stats.compendiumSource") === item.uuid ||
                (i.name === item.name && i.type === item.type && i.img === item.img)
            );

            if (existing) {
                const qty = Number(existing.system?.quantity || 0);
                await existing.update({ "system.quantity": qty + 1 });
                deliveredItemSpans.push(this._buildDocLinkSpan(existing, existing.name));
            } else {
                itemData.system = itemData.system || {};
                itemData.system.quantity = 1;
                const created = await targetActor.createEmbeddedDocuments("Item", [itemData]);
                deliveredItemSpans.push(this._buildDocLinkSpan(created[0] || item, item.name));
            }
            itemsDelivered++;
        }

        const actorSpan = this._buildDocLinkSpan(targetActor, targetActor?.name || game.user.name);
        const serviceSpan = this._buildDocLinkSpan(this.document, serviceTitle);
        const costSpan = this._buildCurrencySpan(chargeCost, currency);
        const timeText = service.timeNeeded ? `Estimated time: ${foundry.utils.escapeHTML(service.timeNeeded)}.` : "";
        const deliveredText = itemsDelivered > 0 ? `<p>Items: ${deliveredItemSpans.join(" ")}</p>` : "";
        const noFundsText = shouldDeductFunds ? "" : " No funds deducted.";

        await ChatMessage.create({
            content: `
                ${actorSpan} used ${serviceSpan} for ${costSpan}
                ${timeText ? `<p>${timeText}</p>` : ""}
                ${deliveredText}
                ${noFundsText ? `<p>${noFundsText.trim()}</p>` : ""}
            `,
            speaker: ChatMessage.getSpeaker()
        });
    }

    async _saveServices(mutator) {
        const savedData = (await this.getData()) || {};
        const services = Array.isArray(savedData.services) ? foundry.utils.deepClone(savedData.services) : [];
        const nextServices = mutator(services);
        await this.saveData({ ...savedData, services: Array.isArray(nextServices) ? nextServices : services });
    }

    async _refreshWidget(htmlElement) {
        const newHtml = await this.render();
        if (htmlElement.parentElement) {
            htmlElement.innerHTML = newHtml;
            await this.activateListeners(htmlElement);
        }
    }
}
