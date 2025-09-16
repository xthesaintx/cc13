import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { TemplateComponents } from "./template-components.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { promptForName, localize, format } from "../helper.js";

export class RegionSheet extends CampaignCodexBaseSheet {
  // =========================================================================
  // Foundry VTT Overrides
  // =========================================================================

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: [...super.defaultOptions.classes, "region-sheet"],
    });
  }

  get template() {
    return "modules/campaign-codex/templates/base-sheet.html";
  }

  async _processRegionData() {
    const regionData = this.document.getFlag("campaign-codex", "data") || {};
    
    let linkedScene = null;
    if (regionData.linkedScene) {
      try {
        const scene = await fromUuid(regionData.linkedScene);
        if (scene) {
          linkedScene = { uuid: scene.uuid, name: scene.name, img: scene.thumb || "icons/svg/map.svg" };
        }
      } catch (error) {
        console.warn(`Campaign Codex | Linked scene not found: ${regionData.linkedScene}`);
      }
    }

    const locationUuids = regionData.linkedLocations || [];
    const shopUuids = regionData.linkedShops || [];

    const [
      rawLinkedNPCs,
      rawLocations,
      rawNPCs,
      rawShops,
      rawdirectShops,
      rawShopNPCs,
      canViewScene
    ] = await Promise.all([
      CampaignCodexLinkers.getLinkedNPCs(this.document, regionData.linkedNPCs || []),
      CampaignCodexLinkers.getLinkedLocations(this.document, locationUuids),
      CampaignCodexLinkers.getAllNPCs(locationUuids),
      CampaignCodexLinkers.getAllShops(locationUuids),
      CampaignCodexLinkers.getLinkedShops(this.document, shopUuids),
      CampaignCodexLinkers.getShopNPCs(this.document, regionData.linkedShops),
      this.constructor.canUserView(regionData.linkedScene)
    ]);
    
    return { regionData, rawLinkedNPCs, rawLocations, rawNPCs, rawShops, rawdirectShops, rawShopNPCs, linkedScene, canViewScene };
  }

  async getData() {
    const data = await super.getData();
    if (!this._processedData) {
      this._processedData = await this._processRegionData();
    }
    const { regionData, rawLinkedNPCs, rawLocations, rawNPCs, rawShops, rawdirectShops, rawShopNPCs, linkedScene, canViewScene } = this._processedData;
    
    // --- Assign fetched data ---
    data.linkedLocations = rawLocations;
    data.allShops = rawShops;
    data.linkedShops = rawdirectShops;
    data.shopNPCs = rawShopNPCs;
    data.allNPCs = rawNPCs;
    data.linkedNPCs = rawLinkedNPCs;
    data.linkedScene = linkedScene;
    data.canViewScene = canViewScene;

    // --- Basic Sheet Info ---
    data.sheetType = "region";
    data.sheetTypeLabel = localize("names.region");
    data.customImage = this.document.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "region");


    // --- Linked Data Fetching ---
    const locationUuids = regionData.linkedLocations || [];
    const shopUuids = regionData.linkedShops || [];



    //tags
    data.taggedNPCs = data.linkedNPCs.filter((npc) => npc.tag === true);
    data.linkedNPCsWithoutTaggedNPCs = data.linkedNPCs.filter((npc) => npc.tag !== true);
    data.shopNPCsWithoutTaggedNPCs = data.shopNPCs.filter((npc) => npc.tag !== true);
    data.allNPCsWithoutTaggedNPCs = data.allNPCs.filter((npc) => npc.tag !== true);

    // De DUPE
    const directUuids = new Set(data.linkedNPCsWithoutTaggedNPCs.map((npc) => npc.uuid));
    data.shopNPCsWithoutTaggedNPCsnoDirect = data.shopNPCsWithoutTaggedNPCs.filter((associate) => !directUuids.has(associate.uuid));
    data.allNPCsWithoutTaggedNPCsnoDirect = data.allNPCsWithoutTaggedNPCs.filter((associate) => !directUuids.has(associate.uuid));
    const directEntryUuids = new Set(data.shopNPCsWithoutTaggedNPCsnoDirect.map((npc) => npc.uuid));
    data.shopNPCsWithoutTaggedNPCsnoDirectnoShop = data.allNPCsWithoutTaggedNPCsnoDirect.filter((associate) => !directEntryUuids.has(associate.uuid));

    // --- UI Component Data ---
    data.tabs = [
      { key: "info", label: localize("names.info"), icon: "fas fa-info-circle" },
      {
        key: "locations",
        label: localize("names.locations"),
        icon: TemplateComponents.getAsset("icon", "location"),
        statistic: { value: data.linkedLocations.length, color: "#28a745" },
      },
      {
        key: "npcs",
        label: localize("names.npcs"),
        icon: TemplateComponents.getAsset("icon", "npc"),
        statistic: { value: data.allNPCs.length + data.shopNPCs.length, color: "#fd7e14" },
      },
      {
        key: "shops",
        label: localize("names.shops"),
        icon: TemplateComponents.getAsset("icon", "shop"),
        statistic: { value: data.allShops.length + data.linkedShops.length, color: "#6f42c1" },
      },
      { key: "journals", label: localize("names.journals"), icon: "fas fa-book"},

      ...(data.isGM ? [{ key: "notes", label: localize("names.note"), icon: "fas fa-sticky-note" }] : []),
    ].map((tab) => ({ ...tab, active: this._currentTab === tab.key }));

    data.quickLinks = CampaignCodexLinkers.createQuickLinks([
      { data: data.linkedLocations, type: "location" },
      { data: data.linkedShops, type: "shop" },
      { data: data.linkedNPCsWithoutTaggedNPCs, type: "npc" },
    ]);
    data.quickTags = CampaignCodexLinkers.createQuickTags(data.taggedNPCs);

    // --- Custom Header ---
    if (data.linkedScene) {
      data.customHeaderContent = `<div class="scene-info"><span class="scene-name ${data.canViewScene ? `open-scene" data-scene-uuid="${data.linkedScene.uuid}"` : '"'} title="${format("message.open", { type: localize("names.scene") })}"><i class="fas fa-map"></i> ${data.linkedScene.name}</span>${data.isGM ? `<button type="button" class="scene-btn remove-scene" title="${format("message.unlink", { type: localize("names.scene") })}"><i class="fas fa-unlink"></i></button>` : ""}</div>`;
    } else if (data.isGM) {
      data.customHeaderContent = `<div class="scene-info"><span class="scene-name open-scene"><i class="fas fa-link"></i> ${format("dropzone.link", { type: localize("names.scene") })}</span></div>`;
    }

    // --- Tab Panels ---
    data.tabPanels = [
      { key: "info", active: this._currentTab === "info", content: this._generateInfoTab(data) },
      { key: "locations", active: this._currentTab === "locations", content: await this._generateLocationsTab(data) },
      { key: "npcs", active: this._currentTab === "npcs", content: await this._generateNPCsTab(data) },
      { key: "shops", active: this._currentTab === "shops", content: await this._generateShopsTab(data) },
      { key: "journals", active: this._currentTab === "journals", content:  `${TemplateComponents.contentHeader("fas fa-book", "Journals")}${TemplateComponents.standardJournalGrid(data.linkedStandardJournals)}` },
      { key: "notes", active: this._currentTab === "notes", content: CampaignCodexBaseSheet.generateNotesTab(this.document, data) },
    ];

    return data;
  }

  _activateSheetSpecificListeners(html) {
    const nativeHtml = html instanceof jQuery ? html[0] : html;

    // --- Listeners for single, non-repeating elements ---
    const singleActionMap = {
      ".create-npc-button": this._onCreateNPCJournal,
      ".create-location-button": this._onCreateLocationJournal,
      ".refresh-npcs, .refresh-shops": this._onRefreshData,
      ".open-scene": this._onOpenScene,
      ".remove-scene": this._onRemoveScene,
      ".create-shop-button": this._onCreateShopJournal,
    };

    for (const [selector, handler] of Object.entries(singleActionMap)) {
      nativeHtml.querySelector(selector)?.addEventListener("click", handler.bind(this));
    }

    // --- Listeners for multiple elements without flags ---
    const multiActionMap = {
      ".remove-location": this._onRemoveFromRegion,
    };

    for (const [selector, handler] of Object.entries(multiActionMap)) {
      nativeHtml.querySelectorAll(selector).forEach((el) => {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          handler.call(this, e);
        });
      });
    }

    // --- Listeners for opening different document types ---
    const documentOpenMap = {
      ".open-location, .location-link": { flag: "location", handler: this._onOpenDocument },
      ".open-npc, .npc-link": { flag: "npc", handler: this._onOpenDocument },
      ".open-shop, .shop-link": { flag: "shop", handler: this._onOpenDocument },
      ".open-actor": { flag: "actor", handler: this._onOpenDocument },
    };

    for (const [selector, { flag, handler }] of Object.entries(documentOpenMap)) {
      nativeHtml.querySelectorAll(selector).forEach((el) => {
        el.addEventListener("click", (e) => handler.call(this, e, flag));
      });
    }

    // --- Listeners for actions on lists that require a flag ---
    const listActionMap = {
      ".remove-shop": { flag: "linkedShops", handler: this._onRemoveFromList },
      ".remove-npc": { flag: "linkedNPCs", handler: this._onRemoveFromList },
    };

    for (const [selector, { flag, handler }] of Object.entries(listActionMap)) {
      nativeHtml.querySelectorAll(selector).forEach((el) => {
        el.addEventListener("click", async (e) => {
          e.stopPropagation();
          await handler.call(this, e, flag);
        });
      });
    }
  }

  async _handleDrop(data, event) {
    if (data.type === "Scene") {
      await this._handleSceneDrop(data, event);
    } else if (data.type === "JournalEntry" || data.type === "JournalEntryPage") {
      await this._handleJournalDrop(data, event);
    } else if (data.type === "Actor") {
      await this._handleActorDrop(data, event);
    }
  }

  getSheetType() {
    return "region";
  }

  // =========================================================================
  // Tab Generation
  // =========================================================================

  _generateInfoTab(data) {
    return `
      ${TemplateComponents.contentHeader("fas fa-info-circle", localize("names.information"))}
      ${TemplateComponents.richTextSection(this.document, data.sheetData.enrichedDescription, "description", data.isOwnerOrHigher)}
    `;
  }

  async _generateLocationsTab(data) {
    const createLocationBtn = data.isGM
      ? `<button type="button" class="refresh-btn create-location-button" title="${format("button.title", { type: localize("names.location") })}"><i class="fas fa-circle-plus"></i></button>`
      : "";
    return `
      ${TemplateComponents.contentHeader(TemplateComponents.getAsset("icon", "location"), localize("names.locations"), createLocationBtn)}
      ${data.isGM ? TemplateComponents.dropZone("location", TemplateComponents.getAsset("icon", "location"), "", "") : ""}
      ${TemplateComponents.entityGrid(data.linkedLocations, "location")}

    `;
  }

  async _generateNPCsTab(data) {
    const dropToMapBtn =
      canvas.scene && game.user.isGM && data.linkedNPCsWithoutTaggedNPCs.length > 0
        ? `
    <button type="button" class="refresh-btn npcs-to-map-button" title="${format("button.droptoscene", { type: localize("names.npc") })}">
      <i class="fas fa-street-view"></i></button> `
        : "";
    const createNPCBtn = data.isGM
      ? `
      <button type="button" class="refresh-btn create-npc-button"  title="${format("button.title", { type: localize("names.npc") })}">
        <i class="fas fa-user-plus"></i>
      </button>`
      : "";
    const refreshBtn = `<button type="button" class="refresh-btn refresh-npcs" title="${localize("info.refresh")}"><i class="fas fa-sync-alt"></i></button>`;
    const npcBtn = dropToMapBtn + createNPCBtn + refreshBtn;
    return `
      ${TemplateComponents.contentHeader(TemplateComponents.getAsset("icon", "npc"), localize("names.npcs"), npcBtn)}
      ${await this._generateNPCsBySource(data)}
    `;
  }

  async _generateNPCsBySource(data) {

    // Region SHOPS
    const directShopNPCs = data.shopNPCsWithoutTaggedNPCsnoDirect.filter((npc) => npc.source === "shop");

    let content = "";

    const [locationShopNPCs, locationNPCs] = 
      data.shopNPCsWithoutTaggedNPCsnoDirectnoShop.reduce(
        ([shops, locations], npc) => {
          if (npc.shops.length > 0) {
            shops.push(npc);
          } else {
            locations.push(npc);
          }
          return [shops, locations];
        },
        [[], []]
    );


    if (data.linkedNPCsWithoutTaggedNPCs.length > 0) {
      content += `<div class="npc-section">${TemplateComponents.entityGrid(data.linkedNPCsWithoutTaggedNPCs, "npc", true, false)}</div>`;
    }

    if (directShopNPCs.length > 0) {
      content += `<div class="npc-section"><h3><i class="${TemplateComponents.getAsset("icon", "shop")}"></i> ${localize("names.shop")} ${localize("names.npcs")}</h3>${TemplateComponents.entityGrid(directShopNPCs, "npc", true, true)}</div>`;
    }

    if (locationNPCs.length > 0) {
      content += `<div class="npc-section"><h3><i class="${TemplateComponents.getAsset("icon", "location")}"></i>${localize("names.location")} ${localize("names.npcs")}</h3>${TemplateComponents.entityGrid(locationNPCs, "npc", true, true)}</div>`;
    }

    if (locationShopNPCs.length > 0) {
      content += `<div class="npc-section"><h3><i class="${TemplateComponents.getAsset("icon", "shop")}"></i> ${localize("names.location")} - ${localize("names.shop")} ${localize("names.npcs")}</h3>${TemplateComponents.entityGrid(locationShopNPCs, "npc", true, true)}</div>`;
    }
    if (data.linkedNPCsWithoutTaggedNPCs.length + directShopNPCs.length + locationNPCs.length + locationShopNPCs.length === 0) {
      content = TemplateComponents.emptyState("npc");
    }
    return content;
  }

  async _generateShopsTab(data) {
    let buttons = "";
    if (data.isGM) {
      buttons += `<button type="button" class="refresh-btn create-shop-button"  title="${format("button.title", { type: localize("names.shop") })}"><i class="fas fa-house-chimney-medical"></i></button>`;
    }
    buttons += `<button type="button" class="refresh-btn refresh-shops"  title="${localize("info.refresh")}"><i class="fas fa-sync-alt"></i></button>`;
    let content = TemplateComponents.contentHeader(TemplateComponents.getAsset("icon", "region"), localize("names.shops"), buttons);
    if (data.isGM) {
      content += TemplateComponents.dropZone("shop", TemplateComponents.getAsset("icon", "shop"), format("dropzone.link", { type: localize("names.shops") }), "");
    }

    if (data.linkedShops.length > 0) {
      content += `<div class="npc-section">${TemplateComponents.entityGrid(data.linkedShops, "shop", false, false)}</div>`;
    }
    if (data.allShops.length > 0) {
      content += `<div class="npc-section"><h3><i class="${TemplateComponents.getAsset("icon", "location")}"></i> ${localize("names.location")} ${localize("names.shops")}</h3>${TemplateComponents.entityGrid(data.allShops, "shop", false, true)}</div>`;
    }

    if (data.allShops.length + data.linkedShops.length === 0) {
      content += TemplateComponents.emptyState("shop");
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
        await game.campaignCodex.linkRegionToLocation(this.document, locationJournal);
        this.render(true);
        locationJournal.sheet.render(true);
      }
    }
  }

  async _onCreateShopJournal(event) {
    event.preventDefault();
    const name = await promptForName(localize("names.shop"));
    if (name) {
      const shopJournal = await game.campaignCodex.createShopJournal(name);
      if (shopJournal) {
        await game.campaignCodex.linkRegionToShop(this.document, shopJournal);
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
        await game.campaignCodex.linkRegionToNPC(this.document, npcJournal);
        this.render(true);
        npcJournal.sheet.render(true);
      }
    }
  }

  async _onDropNPCsToMapClick(event) {
    event.preventDefault();
    const locationData = this.document.getFlag("campaign-codex", "data") || {};
    const rawDirectNPCs = await CampaignCodexLinkers.getLinkedNPCs(this.document, locationData.linkedNPCs || []);
    const directNPCs = rawDirectNPCs.filter((npc) => npc.tag !== true);

    if (directNPCs?.length > 0) {
      await this._onDropNPCsToMap(directNPCs, { title: format("message.droptomap", { type: this.document.name }) });
    } else {
      ui.notifications.warn(localize("warn.invaliddrop"));
    }
  }

  async _onOpenScene(event) {
    event.preventDefault();
    await game.campaignCodex.openLinkedScene(this.document);
  }

  async _onRemoveScene(event) {
    event.preventDefault();
    await this._saveFormData();
    await this.document.setFlag("campaign-codex", "data", { ...this.document.getFlag("campaign-codex", "data"), linkedScene: null });
    this.render(true);
    ui.notifications.info("Unlinked scene");
  }

  async _onRefreshData(event) {
    this.render(true);
    ui.notifications.info("Region data refreshed!");
  }

  async _onDropToMap(event) {
    const data = await this.getData();
    await NPCDropper.dropNPCsToScene(data.linkedNPCs, {
      title: `Drop ${this.document.name} NPCs to Map`,
      showHiddenToggle: true,
    });
  }

  // =========================================================================
  // Drop Logic
  // =========================================================================

  async _handleSceneDrop(data, event) {
    const scene = await fromUuid(data.uuid);
    if (!scene) {
      ui.notifications.warn("Could not find the dropped scene.");
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
        await game.campaignCodex.linkRegionToLocation(this.document, locationJournal);
        await game.campaignCodex.linkSceneToDocument(scene, locationJournal);
        ui.notifications.info(format("info.linkfound", { type: locationJournal.name }));
        this.render(true);
        locationJournal.sheet.render(true);
      }
    } else {
      await this._saveFormData();
      await game.campaignCodex.linkSceneToDocument(scene, this.document);
      ui.notifications.info(format("info.linked", { type: localize("scene.name") }));
      this.render(true);
    }
  }

  async _handleJournalDrop(data, event) {
    const journal = await fromUuid(data.uuid);
    if (!journal || journal.uuid === this.document.uuid) return;

    const journalType = journal.getFlag("campaign-codex", "type");
    const dropOnInfoTab = event.target.closest('.tab-panel[data-tab="info"]');

    await this._saveFormData();

    if (((!journalType && data.type === "JournalEntry") || data.type === "JournalEntryPage")) {
        const locationData = this.document.getFlag("campaign-codex", "data") || {};
        // Ensure linkedStandardJournals is an array
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
      await game.campaignCodex.linkRegionToLocation(this.document, journal);
    } else if (journalType === "npc") {
      await game.campaignCodex.linkRegionToNPC(this.document, journal);
    } else if (journalType === "shop") {
      await game.campaignCodex.linkRegionToShop(this.document, journal);
    } else {
      return; // Not a valid drop type for this context
    }
    this.render(true);
  }
}
