import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { TemplateComponents } from "./template-components.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { promptForName, localize, format } from "../helper.js";

export class NPCSheet extends CampaignCodexBaseSheet {
  // =========================================================================
  // Foundry VTT Overrides
  // =========================================================================

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: [...super.defaultOptions.classes, "npc-sheet"],
    });
  }

  get template() {
    return "modules/campaign-codex/templates/base-sheet.html";
  }

  async _processNpcData() {
    const npcData = this.document.getFlag("campaign-codex", "data") || {};
    const [linkedActor, rawLocations, linkedShops, associates] = await Promise.all([
      npcData.linkedActor ? CampaignCodexLinkers.getLinkedActor(npcData.linkedActor) : null,
      CampaignCodexLinkers.getAllLocations(this.document, npcData.linkedLocations || []),
      CampaignCodexLinkers.getLinkedShopsWithLocation(this.document, npcData.linkedShops || []),
      CampaignCodexLinkers.getAssociates(this.document, npcData.associates || []),
    ]);

    return { npcData, linkedActor, rawLocations, linkedShops, associates };
  }

  async getData() {
    const data = await super.getData();

    if (!this._processedData) {
      this._processedData = await this._processNpcData();
    }
    const { npcData, linkedActor, rawLocations, linkedShops, associates } = this._processedData;
    
    data.tagMode = npcData.tagMode || false;
    data.linkedActor = linkedActor;
    data.allLocations = rawLocations;
    data.linkedShops = linkedShops;
    data.associates = associates;




    // --- Linked Data Fetching ---

    data.defaultImage = TemplateComponents.getAsset("image", "npc");

    // Permissions
    data.allLocations = rawLocations;
    data.taggedNPCs = data.associates.filter((npc) => npc.tag === true);
    data.associatesWithoutTaggedNPCs = data.associates.filter((npc) => npc.tag !== true);

    // --- Basic Sheet Info ---
    data.sheetType = "npc";
    if (data.tagMode) {
      data.sheetTypeLabel = "";
    } else {
      data.sheetTypeLabel =
        data.linkedActor?.type === "character" ? format("sheet.journal", { type: localize("names.player") }) : format("sheet.journal", { type: localize("names.npc") });
    }
    data.customImage = this.document.getFlag("campaign-codex", "image") || data.linkedActor?.img || TemplateComponents.getAsset("image", "npc");

    const directLocationCount = data.allLocations.filter((loc) => loc.source === "direct").length;

    // --- UI Component Data ---
    data.tabs = [
      {
        key: "info",
        label: localize("names.info"),
        icon: "fas fa-info-circle",
      },
      {
        key: "locations",
        label: localize("names.locations"),
        icon: TemplateComponents.getAsset("icon", "location"),
        statistic: { value: data.tagMode ? directLocationCount : data.linkedShops.length, color: "#28a745" },
      },
      {
        key: "shops",
        label: localize("names.shops"),
        icon: TemplateComponents.getAsset("icon", "shop"),
        statistic: { value: data.linkedShops.length, color: "#6f42c1" },
      },
      {
        key: "associates",
        label: data.tagMode ? localize("names.members") : localize("names.associates"),
        icon: TemplateComponents.getAsset("icon", "npc"),
        statistic: { value: data.associates.length, color: "#fd7e14" },
      },
{ key: "journals", label: localize("names.journals"), icon: "fas fa-book"},
      ...(data.isGM
        ? [
            {
              key: "notes",
              label: localize("names.note"),
              icon: "fas fa-sticky-note",
            },
          ]
        : []),
    ].map((tab) => ({ ...tab, active: this._currentTab === tab.key }));

    data.quickTags = CampaignCodexLinkers.createQuickTags(data.taggedNPCs);

    data.quickLinks = CampaignCodexLinkers.createQuickLinks([
      { data: data.allLocations, type: "location" },
      { data: data.linkedShops, type: "shop" },
      { data: data.associatesWithoutTaggedNPCs, type: "npc" },
    ]);

    // --- Tag Mode ---
    let headerContent = "";

    if (game.user.isGM) {
      headerContent = `
      <div class="shop-toggles npc-toggles">
      <span class="stat-label">${localize("button.tagmode")}</span>
        <label class="toggle-control">
          <input type="checkbox" class="tag-mode-toggle" ${data.tagMode ? "checked" : ""} style="margin: 0;"><span class="slider"></span>
        </label>
      </div>
    `;
    }
    data.customHeaderContent = headerContent;

    // --- Tab Panels ---
    data.tabPanels = [
      {
        key: "info",
        active: this._currentTab === "info",
        content: await this._generateInfoTab(data),
      },
      {
        key: "locations",
        active: this._currentTab === "locations",
        content: await this._generateLocationsTab(data),
      },
      {
        key: "shops",
        active: this._currentTab === "shops",
        content: await this._generateShopsTab(data),
      },
      {
        key: "associates",
        active: this._currentTab === "associates",
        content: await this._generateAssociatesTab(data),
      },
      { key: "journals", active: this._currentTab === "journals", content:  `${TemplateComponents.contentHeader("fas fa-book", "Journals")}${TemplateComponents.standardJournalGrid(data.linkedStandardJournals)}` },

      {
        key: "notes",
        active: this._currentTab === "notes",
        content: CampaignCodexBaseSheet.generateNotesTab(this.document, data),
      },
    ];

    return data;
  }

  _activateSheetSpecificListeners(html) {
    const nativeHtml = html instanceof jQuery ? html[0] : html;

    // --- Listeners for single elements ---
    const singleActionMap = {
      ".create-location-button": this._onCreateLocationJournal,
      ".create-npc-button": this._onCreateNPCJournal,
      ".create-shop-button": this._onCreateShopJournal,
      ".remove-actor": this._onRemoveActor,
      ".refresh-locations": this._onRefreshLocations,
      ".members-to-map-button": this._onDropMembersToMapClick,
    };

    for (const [selector, handler] of Object.entries(singleActionMap)) {
      nativeHtml.querySelector(selector)?.addEventListener("click", handler.bind(this));
    }

    // --- Listeners for multiple elements without flags ---
    const multiActionMap = {
      ".remove-location": this._handleRemoveLocation,
    };

    for (const [selector, handler] of Object.entries(multiActionMap)) {
      nativeHtml.querySelectorAll(selector).forEach((el) => {
        el.addEventListener("click", async (e) => {
          e.stopPropagation();
          await handler.call(this, e);
        });
      });
    }

    // --- Listeners for opening different document types ---
    const documentOpenMap = {
      ".open-actor": { flag: "actor", handler: this._onOpenDocument },
      ".open-location, .location-link": { flag: "location", handler: this._onOpenDocument },
      ".open-shop, .shop-link": { flag: "shop", handler: this._onOpenDocument },
      ".open-associate": { flag: "associate", handler: this._onOpenDocument },
      ".open-npc, .npc-link": { flag: "npc", handler: this._onOpenDocument },
    };

    for (const [selector, { flag, handler }] of Object.entries(documentOpenMap)) {
      nativeHtml.querySelectorAll(selector).forEach((el) => {
        el.addEventListener("click", (e) => handler.call(this, e, flag));
      });
    }

    // --- Listeners for removing items from a list ---
    const listActionMap = {
      ".remove-shop": { flag: "linkedShops", handler: this._onRemoveFromList },
      ".remove-associate, .remove-npc": { flag: "associates", handler: this._onRemoveFromList },
    };

    for (const [selector, { flag, handler }] of Object.entries(listActionMap)) {
      nativeHtml.querySelectorAll(selector).forEach((el) => {
        el.addEventListener("click", async (e) => {
          e.stopPropagation();
          await handler.call(this, e, flag);
        });
      });
    }

    // --- Listeners for non-click events (e.g., change) ---
    nativeHtml.querySelector(".tag-mode-toggle")?.addEventListener("change", this._onTagToggle.bind(this));
  }

  async _handleDrop(data, event) {
    if (data.type === "Scene") {
      await this._handleSceneDrop(data, event);
    } else if (data.type === "Actor") {
      await this._handleActorDrop(data, event);
    } else if (data.type === "JournalEntry" || data.type === "JournalEntryPage") {
      await this._handleJournalDrop(data, event);
    }
  }

  getSheetType() {
    return "npc";
  }

  // =========================================================================
  // Tab Generation
  // =========================================================================

  async _generateInfoTab(data) {
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const dropToMapBtn =
      canvas.scene && data.linkedActor && data.isGM
        ? `<button type="button" class="refresh-btn npcs-to-map-button npc-sheet" title="${format("button.droptoscene", { type: localize("names.npc") })}"><i class="fas fa-street-view"></i></button>`
        : "";
    let actorSection = "";

    if (data.linkedActor && (!hideByPermission || data.linkedActor.canView)) {
      actorSection = `<div class="form-section">${TemplateComponents.actorLinkCard(data.linkedActor)}</div>`;
    } else if (data.isGM) {
      actorSection = `<div class="form-section">${TemplateComponents.dropZone("actor", TemplateComponents.getAsset("icon", "npc"), format("dropzone.link", { type: localize("names.actor") }), "")}</div>`;
    }
    return `
      ${TemplateComponents.contentHeader("fas fa-info-circle", localize("names.information"), dropToMapBtn)}
      ${actorSection}
      ${TemplateComponents.richTextSection(this.document, data.sheetData.enrichedDescription, "description", data.isOwnerOrHigher)}
    `;
  }

  async _generateLocationsTab(data) {
    let buttons = "";
    if (data.isGM) {
      buttons += `<button type="button" class="refresh-btn create-location-button" title="${format("button.title", { type: localize("names.location") })}"><i class="fas fa-circle-plus"></i></button>`;
    }
    buttons += `<button type="button" class="refresh-btn refresh-locations" title="${localize("info.refresh")}"><i class="fas fa-sync-alt"></i></button>`;
    return `
      ${data.tagMode ? `${TemplateComponents.contentHeader("fas fa-map-marker-alt", format("member.type", { type: localize("names.locations") }), buttons)}` : `${TemplateComponents.contentHeader("fas fa-map-marker-alt", localize("names.locations"), buttons)}`}
      ${data.isGM ? TemplateComponents.dropZone("location", "fas fa-map-marker-alt", " ", "") : ""}
      ${await this._generateLocationsBySource(data)}
    `;
  }

  async _generateLocationsBySource(data) {
    const directLocations = data.allLocations.filter((loc) => loc.source === "direct");
    const shopLocations = data.allLocations.filter((loc) => loc.source === "shop");
    let content = "";
    if (data.tagMode) {
      if (directLocations.length > 0) {
        content += `<div class="npc-section">${TemplateComponents.entityGrid(directLocations, "location")}</div>`;
      }
      if (directLocations.length === 0) {
        content = TemplateComponents.emptyState("location");
      }
    } else {
      if (directLocations.length > 0) {
        content += `<div class="npc-section">${TemplateComponents.entityGrid(directLocations, "location")}</div>`;
      }
      if (shopLocations.length > 0) {
        content += `<div class="npc-section"><h3><i class="${TemplateComponents.getAsset("icon", "shop")}"></i> ${format("heading.in", { type: localize("names.shop"), in: localize("names.location") })}</h3>${TemplateComponents.entityGrid(shopLocations, "location", false, true)}</div>`;
      }
      if (data.allLocations.length === 0) {
        content = TemplateComponents.emptyState("location");
      }
    }
    return content;
  }

  async _generateShopsTab(data) {
    const createShopBtn = data.isGM
      ? `<button type="button" class="refresh-btn create-shop-button" title="${format("button.title", { type: localize("names.shop") })}"><i class="fas fa-house-chimney-medical"></i></button>`
      : "";
    const preparedShops = data.linkedShops;
    return `
      ${data.tagMode ? TemplateComponents.contentHeader("fas fa-book-open", format("member.type", { type: localize("names.shops") }), createShopBtn) : TemplateComponents.contentHeader("fas fa-book-open", localize("names.shops"), createShopBtn)}
      ${data.isGM ? TemplateComponents.dropZone("shop", "fas fa-book-open", "", "") : ""}
      ${TemplateComponents.entityGrid(preparedShops, "shop")}
    `;
  }

  async _generateAssociatesTab(data) {
    const preparedAssociates = data.associates;
    const preparedTags = data.taggedNPCs;
    const preparedAssociatesNoTags = data.associatesWithoutTaggedNPCs;
    let content = "";
    let buttons = "";
    if (data.isGM) {
      buttons += `<button type="button" class="refresh-btn create-npc-button" title="${format("button.title", { type: localize("names.npc") })}"><i class="fas fa-user-plus"></i></button>`;
    }
    if (data.isGM && canvas.scene && preparedAssociatesNoTags.length > 0) {
      buttons += `<button type="button" class="refresh-btn members-to-map-button" title="${format("button.droptoscene", { type: localize("names.npc") })}"><i class="fas fa-street-view"></i></button>`;
    }

    if (data.tagMode) {
      content += `${TemplateComponents.contentHeader("fas fa-users", localize("names.members"), buttons)}
        ${data.isGM ? TemplateComponents.dropZone("associate", "fas fa-user-friends", "", "") : ""}
        ${TemplateComponents.entityGrid(preparedAssociatesNoTags, "associate", true)}
        `;
    } else {
      content += `${TemplateComponents.contentHeader("fas fa-users", localize("names.associates"), buttons)}`;

      if (preparedAssociatesNoTags.length > 0) {
        content += `<div class="npc-section">${TemplateComponents.entityGrid(preparedAssociatesNoTags, "associate", true)}</div>`;
      }
      if (preparedAssociates.length === 0) {
        content += TemplateComponents.emptyState("associate");
      }
    }
    return content;
  }

  // =========================================================================
  // Event Handlers
  // =========================================================================

  async _onCreateLocationJournal(event) {
    event.preventDefault();
    const name = await promptForName(localize("names.location"));
    if (name) {
      const locationJournal = await game.campaignCodex.createLocationJournal(name);
      if (locationJournal) {
        await game.campaignCodex.linkLocationToNPC(locationJournal, this.document);
        this.render(true);
        locationJournal.sheet.render(true);
      }
    }
  }

  async _onTagToggle(event) {
    const tagMode = event.target.checked;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.tagMode = tagMode;
    await this.document.setFlag("campaign-codex", "data", currentData);
  }

  async _onCreateShopJournal(event) {
    event.preventDefault();
    const name = await promptForName("Entry");
    if (name) {
      const shopJournal = await game.campaignCodex.createShopJournal(name);
      if (shopJournal) {
        await game.campaignCodex.linkShopToNPC(shopJournal, this.document);
        this.render(true);
        shopJournal.sheet.render(true);
      }
    }
  }

  async _onCreateNPCJournal(event) {
    event.preventDefault();
    const name = await promptForName("NPC");
    if (name) {
      const npcJournal = await game.campaignCodex.createNPCJournal(null, name);
      if (npcJournal) {
        await game.campaignCodex.linkNPCToNPC(this.document, npcJournal);
        this.render(true);
        npcJournal.sheet.render(true);
      }
    }
  }

  async _onRemoveActor(event) {
    await this._saveFormData();
    await this.document.setFlag("campaign-codex", "data.linkedActor", null);
    this.render(true);
  }

  async _handleRemoveLocation(event) {
    event.stopPropagation();
    const locationCard = event.currentTarget.closest(".entity-card");
    if (locationCard?.getAttribute("data-source") === "shop") {
      ui.notifications.warn(format("warn.directly", { type: localize("names.location") }));
      return;
    }
    await this._onRemoveFromList(event, "linkedLocations");
  }

  async _onRefreshLocations(event) {
    this.render(true);
    ui.notifications.info("Location data refreshed!");
  }

  async _onDropMembersToMapClick(event) {
    event.preventDefault();

    const npcData = this.document.getFlag("campaign-codex", "data") || {};
    const associates = await CampaignCodexLinkers.getAssociates(this.document, npcData.associates || []);
    const taggedNPCs = associates.filter((npc) => npc.tag === true);
    const associatesWithoutTaggedNPCs = associates.filter((npc) => npc.tag !== true);

    if (associatesWithoutTaggedNPCs.length > 0) {
      await this._onDropNPCsToMap(associatesWithoutTaggedNPCs, {
        title: format("message.droptomap", { type: this.document.name }),
      });
    } else {
      ui.notifications.warn(localize("warn.invaliddrop"));
    }
  }

  async _onDropNPCsToMapClick(event) {
    event.preventDefault();
    const npcData = this.document.getFlag("campaign-codex", "data") || {};
    if (!npcData.linkedActor) return ui.notifications.warn("This NPC has no linked actor to drop!");
    try {
      const linkedActor = await fromUuid(npcData.linkedActor);
      if (!linkedActor) return ui.notifications.warn(localize("warn.actornotfound"));
      const npcForDrop = {
        id: this.document.id,
        uuid: this.document.uuid,
        name: this.document.name,
        img: this.document.getFlag("campaign-codex", "image") || linkedActor.img,
        actor: linkedActor,
      };
      await this._onDropNPCsToMap([npcForDrop], {
        title: `Drop ${this.document.name} to Map`,
        showHiddenToggle: true,
      });
    } catch (error) {
      console.error("Campaign Codex | Error dropping NPC to map:", error);
      ui.notifications.error(localize("warn.failedtodrop"));
    }
  }

  // =========================================================================
  // Drop Logic
  // =========================================================================

  async _handleSceneDrop(data, event) {
    const scene = await fromUuid(data.uuid);
    if (!scene) {
      ui.notifications.warn(localize("warn.scenenotfound"));
      return;
    }

    const locationsTab = event.target.closest('.tab-panel[data-tab="locations"]');

    if (locationsTab) {
      const allLocationJournals = game.journal.filter((j) => j.getFlag("campaign-codex", "type") === "location");

      for (const existingLocation of allLocationJournals) {
        const nameMatch = existingLocation.name.toLowerCase() === scene.name.toLowerCase();
        const existingLocationData = existingLocation.getFlag("campaign-codex", "data") || {};
        const sceneMatch = existingLocationData.linkedScene === scene.uuid;

        if (nameMatch && sceneMatch) {
          ui.notifications.info(format("info.linkfound", { type: existingLocation.name }));
          await game.campaignCodex.linkRegionToLocation(this.document, existingLocation);
          this.render(true);
          return;
        }
      }
      const locationJournal = await game.campaignCodex.createLocationJournal(scene.name);
      if (locationJournal) {
        await game.campaignCodex.linkLocationToNPC(locationJournal, this.document);
        await game.campaignCodex.linkSceneToDocument(scene, locationJournal);
        ui.notifications.info(format("info.newlink", { type: locationJournal.name }));
        this.render(true);
        locationJournal.sheet.render(true);
      }
    }
  }

  async _handleJournalDrop(data, event) {
    const journal = await fromUuid(data.uuid);
    if (!journal || journal.id === this.document.id) return;
    const journalType = journal.getFlag("campaign-codex", "type");
    const dropOnInfoTab = event.target.closest('.tab-panel[data-tab="info"]');

    await this._saveFormData();

    if (((!journalType && data.type === "JournalEntry") || data.type === "JournalEntryPage")) {
        const locationData = this.document.getFlag("campaign-codex", "data") || {};
        locationData.linkedStandardJournals = locationData.linkedStandardJournals || [];

        // Avoid adding duplicates
        if (!locationData.linkedStandardJournals.includes(journal.uuid)) {
            locationData.linkedStandardJournals.push(journal.uuid);
            await this.document.setFlag("campaign-codex", "data", locationData);
            ui.notifications.info(`Linked journal "${journal.name}".`);
        } else {
            ui.notifications.warn(`Journal "${journal.name}" is already linked.`);
        }
      } else if (journalType === "location") {
      await game.campaignCodex.linkLocationToNPC(journal, this.document);
    } else if (journalType === "shop") {
      await game.campaignCodex.linkShopToNPC(journal, this.document);
    } else if (journalType === "npc") {
      await game.campaignCodex.linkNPCToNPC(this.document, journal);
    } else if (journalType === "region") {
      await game.campaignCodex.linkRegionToNPC(journal, this.document);
    } else {
      return; // Not a valid drop type
    }
    this.render(true);
  }

  // =========================================================================
  // Debugging & Helpers
  // =========================================================================

  async _forceLocationRecalculation() {
    console.log(`Campaign Codex | Forcing location recalculation for NPC: ${this.document.name}`);
    const npcData = this.document.getFlag("campaign-codex", "data") || {};
    console.log(`Campaign Codex | Direct locations:`, npcData.linkedLocations || []);
    console.log(`Campaign Codex | Linked shops:`, npcData.linkedShops || []);
    for (const shopUuid of npcData.linkedShops || []) {
      const shop = await fromUuid(shopUuid);
      if (shop) {
        const shopData = shop.getFlag("campaign-codex", "data") || {};
        console.log(`Campaign Codex | Shop ${shop.name}:`, {
          linksToThisNPC: (shopData.linkedNPCs || []).includes(this.document.uuid),
          location: shopData.linkedLocation,
          allNPCs: shopData.linkedNPCs,
        });
      }
    }
    this.render(true);
  }
}
