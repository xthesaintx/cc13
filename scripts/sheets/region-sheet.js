import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { TemplateComponents } from "./template-components.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { promptForName, localize, format, renderTemplate, getDefaultSheetTabs } from "../helper.js";


export class RegionSheet extends CampaignCodexBaseSheet {
  // =========================================================================
  // Foundry VTT Overrides
  // =========================================================================
  static DEFAULT_OPTIONS = {
    classes: ["campaign-codex", "sheet", "journal-sheet", "region-sheet"],
    window: {
      title: 'Campaign Codex Region Sheet',
      icon: 'fas fa-globe',
    },
    actions: {}
  };

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
    const regionUuids = regionData.linkedRegions || [];
    const shopUuids = regionData.linkedShops || [];

    const [
      parentRegion,
      rawLinkedNPCs,
      rawRegions,
      rawLocations,
      rawNPCs,
      regionNPCs,
      rawShops,
      rawdirectShops,
      rawShopNPCs,
      canViewScene,
      canViewRegion,
      inventory
    ] = await Promise.all([
      CampaignCodexLinkers.getLinkedRegion(this.document),
      CampaignCodexLinkers.getLinkedNPCs(this.document, regionData.linkedNPCs || []),
      CampaignCodexLinkers.getLinkedRegions(this.document, regionUuids, true),
      CampaignCodexLinkers.getLinkedLocations(this.document, locationUuids),
      CampaignCodexLinkers.getAllNPCs(locationUuids),
      CampaignCodexLinkers.getAllNPCs(regionUuids),
      CampaignCodexLinkers.getAllShops(locationUuids),
      CampaignCodexLinkers.getLinkedShops(this.document, shopUuids),
      CampaignCodexLinkers.getShopNPCs(this.document, regionData.linkedShops),
      this.constructor.canUserView(regionData.linkedScene),
      this.constructor.canUserView(regionData.parentRegion),
      CampaignCodexLinkers.getInventory(this.document, regionData.inventory || []),
    ]);
    
    return { regionData, parentRegion, rawLinkedNPCs, rawRegions, rawLocations, rawNPCs, regionNPCs, rawShops, rawdirectShops, rawShopNPCs, linkedScene, canViewScene, canViewRegion, inventory };
  }

  _getTabDefinitions() {
    return [
      {
        key: "info",
        label: localize("names.info"),
      },
      {
        key: "locations",
        label: localize("names.locations"),
      },
      {
        key: "regions",
        label: localize("names.regions"),
      },

      {
        key: "shops",
        label: localize("names.shops"),
      },
      {
        key: "inventory",
        label: localize("names.inventory"),
      },
      {
        key: "npcs",
        label: localize("names.npcs"),
      },
      { 
        key: "quests", 
        label: localize("names.quests"), 
      }, 
      { 
        key: "journals", 
        label: localize("names.journals"), 
      },
      { 
        key: "widgets", 
        label: localize("names.widgets"), 
      },
      {
        key: "notes",
        label: localize("names.note"),
       },
     ];  
  }


  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (!this._processedData) {
      this._processedData = await this._processRegionData();
    }
    const { regionData, parentRegion, rawLinkedNPCs, rawRegions, rawLocations, rawNPCs, regionNPCs, rawShops, rawdirectShops, rawShopNPCs, linkedScene, canViewScene, canViewRegion, inventory } = this._processedData;
    
    // --- Assign fetched context ---
    context.inventory = inventory;
    context.isLoot = regionData.isLoot || false;
    context.markup = regionData.markup || 1.0;
    context.inventoryCash = regionData.inventoryCash || 0;
    context.parentRegion = parentRegion;
    context.linkedLocations = rawLocations;
    context.allShops = rawShops;
    context.linkedShops = rawdirectShops;
    context.shopNPCs = rawShopNPCs;
    context.allNPCs = rawNPCs;
    context.linkedNPCs = rawLinkedNPCs;
    context.linkedScene = linkedScene;
    context.canViewScene = canViewScene;
    context.linkedRegions = rawRegions;
    context.canViewRegion = canViewRegion;
    context.regionNPCs = regionNPCs,
    // --- Basic Sheet Info ---
    context.sheetType = "region";
    if (context.sheetTypeLabelOverride !== undefined && context.sheetTypeLabelOverride !== "") {
            context.sheetTypeLabel = context.sheetTypeLabelOverride;
        } else {
          context.sheetTypeLabel = localize("names.region");
        }
    context.customImage = this.document.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "region");

    // --- Linked Data Fetching ---
    const locationUuids = regionData.linkedLocations || [];
    const shopUuids = regionData.linkedShops || [];



    //tags
    context.taggedNPCs = context.linkedNPCs.filter((npc) => npc.tag === true);
    context.linkedNPCsWithoutTaggedNPCs = context.linkedNPCs.filter((npc) => npc.tag !== true);
    context.shopNPCsWithoutTaggedNPCs = context.shopNPCs.filter((npc) => npc.tag !== true);
    context.allNPCsWithoutTaggedNPCs = context.allNPCs.filter((npc) => npc.tag !== true);

    // De DUPE
    const directUuids = new Set(context.linkedNPCsWithoutTaggedNPCs.map((npc) => npc.uuid));
    context.shopNPCsWithoutTaggedNPCsnoDirect = context.shopNPCsWithoutTaggedNPCs.filter((associate) => !directUuids.has(associate.uuid));
    context.allNPCsWithoutTaggedNPCsnoDirect = context.allNPCsWithoutTaggedNPCs.filter((associate) => !directUuids.has(associate.uuid));
    const directEntryUuids = new Set(context.shopNPCsWithoutTaggedNPCsnoDirect.map((npc) => npc.uuid));
    context.shopNPCsWithoutTaggedNPCsnoDirectnoShop = context.allNPCsWithoutTaggedNPCsnoDirect.filter((associate) => !directEntryUuids.has(associate.uuid));

    // region npcs
    const filteredRegioiNPCs = context.regionNPCs.filter((associate) => !directUuids.has(associate.uuid));
    context.regionNPCsProcessed = filteredRegioiNPCs.filter((npc) => npc.tag !== true);

    // TABS
    const tabOverrides = this.document.getFlag("campaign-codex", "tab-overrides") || [];
    let defaultTabs = this._getTabDefinitions();
    const gmOnlyTabs = ['notes'];
    if (!game.user.isGM) {
      defaultTabs = defaultTabs.filter(tab => !gmOnlyTabs.includes(tab.key));
    }


     const tabContext = [
      {
        key: "info",
        active: this._currentTab === "info",
        content:  await this._generateInfoTab(context),
        label: localize("names.info"),
        icon: "fas fa-info-circle",
      },
      {
        key: "locations",
        statistic: { value: context.linkedLocations.length, view: context.linkedLocations.length >0},
        active: this._currentTab === "location",
        content: await this._generateLocationsTab(context),
        label: localize("names.locations"),
        icon: TemplateComponents.getAsset("icon", "location"),
      },
      {
        key: "regions",
        statistic: { value: context.linkedRegions.length, view:context.linkedRegions.length>0 },
        active: this._currentTab === "regions",
        content: await this._generateRegionsTab(context),
        label: localize("names.regions"),
        icon: TemplateComponents.getAsset("icon", "region"),
      },
      {
        key: "shops",
        statistic: { value: context.allShops.length + context.linkedShops.length, view: context.allShops.length + context.linkedShops.length>0 },
        active: this._currentTab === "shops",
        content: await this._generateShopsTab(context),
        label: localize("names.shops"),
        icon: TemplateComponents.getAsset("icon", "shop"),
      },
      {
        key: "inventory",
        active: this._currentTab === "inventory",
        content: this._generateInventoryTab(context),
        icon: "fas fa-boxes",
        label: localize("names.inventory"),
        statistic: { value: context.inventory.length, view: context.inventory.length >0, },
      },
      {
        key: "npcs",
        statistic: { value: context.linkedNPCsWithoutTaggedNPCs.length  + context.regionNPCsProcessed.length  + context.shopNPCsWithoutTaggedNPCsnoDirect.length + context.shopNPCsWithoutTaggedNPCsnoDirectnoShop.length, view:context.linkedNPCsWithoutTaggedNPCs.length + context.shopNPCsWithoutTaggedNPCsnoDirect.length + context.shopNPCsWithoutTaggedNPCsnoDirectnoShop.length + context.regionNPCsProcessed.length >0 },
        active: this._currentTab === "npcs",
        content: await this._generateNPCsTab(context),
        label: context.tagMode ? localize("names.members") : localize("names.associates"),
        icon: TemplateComponents.getAsset("icon", "npc"),
      },
      { 
        key: "quests", 
        statistic: {value: context.sheetData.quests.length, view:context.sheetData.quests.length>0},
        active: this._currentTab === "quests", 
        content: await TemplateComponents.questList(this.document, context.sheetData.quests, context.isGM) ,  
        label: localize("names.quests"), 
        icon: "fas fa-scroll", 
      }, 
      { 
        key: "journals", 
        statistic: {value: context.linkedStandardJournals.length, view:context.linkedStandardJournals.length>0},
        active: this._currentTab === "journals", 
        content:  `${TemplateComponents.contentHeader("fas fa-book", this._labelOverride(this.document, "journals") || localize("names.journals"))}${TemplateComponents.standardJournalGrid(context.linkedStandardJournals)}`, 
        label: localize("names.journals"), 
        icon: "fas fa-book", 
      },
      { 
        key: "widgets", 
        statistic: {value: context.activewidget.length, view:context.activewidget.length>0},
        active: this._currentTab === "widgets",
        content: await CampaignCodexBaseSheet.generateWidgetsTab(this.document, context, this._labelOverride(this.document, "widgets")),
        label: localize("names.widgets"), 
        icon: "fas fa-puzzle-piece", 
      },
      {
        key: "notes",
        active: this._currentTab === "notes",
        content: await CampaignCodexBaseSheet.generateNotesTab(this.document, context, this._labelOverride(this.document, "notes")),
        label: localize("names.note") || "Notes",
        icon: "fas fa-sticky-note", 
      },
    ];

    const defaultTabVis = getDefaultSheetTabs(this.getSheetType());
    context.tabs = defaultTabs
      .map(tab => {
        const override = tabOverrides.find(o => o.key === tab.key);
        const isVisibleByDefault = defaultTabVis[tab.key] ?? true;
        const isVisible = override?.visible ?? isVisibleByDefault;
        if (!isVisible) return null;

        const dynamicTab = tabContext.find(t => t.key === tab.key);
        if (!dynamicTab) return null;

        const finalLabel = override?.label || tab.label;
        return {
          ...tab,
          ...dynamicTab, 
          label: finalLabel, 
        };
      })
      .filter(Boolean); 
    // Validate and set the active tab
    if (context.tabs.length > 0) {
      const availableKeys = context.tabs.map(t => t.key);
      if (!this._currentTab || !availableKeys.includes(this._currentTab)) {
        this._currentTab = context.tabs[0].key;
      }
    }
    // END OF TABS

    // QUICK LINKS
    context.quickLinks = CampaignCodexLinkers.createQuickLinks([
      { data: context.linkedRegions, type: "region" },
      { data: context.linkedLocations, type: "location" },
      { data: context.linkedShops, type: "shop" },
      { data: context.linkedNPCsWithoutTaggedNPCs, type: "npc" },
    ]);
    context.quickTags = CampaignCodexLinkers.createQuickTags(context.taggedNPCs);

    // --- Custom Header ---
    let headerContent = "";
     if (context.parentRegion) {
      headerContent += `
      <div class="region-info">
        <span class="region-name ${context.canViewRegion ? `region-link" data-action="openRegion" data-uuid="${context.parentRegion.uuid}"` : '"'}">
          <i class="${context.parentRegion.iconOverride ? context.parentRegion.iconOverride : TemplateComponents.getAsset("icon", "region")}"></i>
          ${context.parentRegion.name} - 
          ${context.parentRegion.sheetTypeLabelOverride ? context.parentRegion.sheetTypeLabelOverride : localize("names.region")}
        </span>         
      ${game.user.isGM
            ? `<i class="fas fa-unlink scene-btn remove-location" data-action="removeParentRegion" title="${format("message.unlink", { type: localize("names.region") })}"></i>`
            : ""
        }</div>`;
    }
    if (context.linkedScene) {
      headerContent += `<div class="scene-info"><span class="scene-name ${context.canViewScene ? `open-scene" data-scene-uuid="${context.linkedScene.uuid}"` : '"'} title="${format("message.open", { type: localize("names.scene") })}"><i class="fas fa-map"></i> ${context.linkedScene.name}</span>${context.isGM ? `<i class="fas fa-unlink scene-btn remove-scene" data-action="removeScene" title="${format("message.unlink", { type: localize("names.scene") })}"></i>` : ""}</div>`;
    } else if (context.isGM) {
      headerContent += `<div class="scene-info"><span class="scene-name open-scene"><i class="fas fa-link"></i> ${format("dropzone.link", { type: localize("names.scene") })}</span></div>`;
    }
    if (headerContent) context.customHeaderContent = headerContent;



    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const nativeHtml = this.element;

  }

  async _handleDrop(data, event) {
    event.preventDefault();
    event.stopPropagation();
    if (data.type === "Scene") {
      await this._handleSceneDrop(data, event);
    } else if (data.type === "Item") {
      await this._handleItemDrop(data, event);
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

  async _generateInfoTab(data) {
    const label = this._labelOverride(this.document, "info") || localize("names.information");
    let regionSection = "";

    if (data.parentRegion) {
      const regionCard = `
        <div class="linked-actor-card">
          <div class="actor-image"><img src="${data.parentRegion.img}" alt="${data.parentRegion.name}"></div>
          <div class="actor-content"><h4 class="actor-name">${data.parentRegion.name}</h4></div>
          <div class="actor-actions">
            ${data.canViewRegion ? `<i class="fas fa-external-link-alt action-btn open-region" data-action="openRegion" data-uuid="${data.parentRegion.uuid}" title="Open Region"></i>` : ""}
            ${data.isGM ? `<i class="fas fa-unlink action-btn remove-parent-region" data-action="removeParentRegion" title="Remove from Region"></i>` : ""}
          </div>
        </div>
      `;
      regionSection = `<div class="form-section">${regionCard}</div>`;
    }
    return `
      ${TemplateComponents.contentHeader("fas fa-info-circle", label)}
      ${regionSection}
      ${TemplateComponents.richTextSection(this.document, data.sheetData.enrichedDescription, "description", data.isOwnerOrHigher)}
    `;
  }
  async _generateRegionsTab(data) {
    const label = this._labelOverride(this.document, "regions") || localize("names.regions");
    const createLocationBtn = data.isGM
      ? `<i class="refresh-btn create-region-button fas fa-circle-plus" data-action="createRegionJournal" title="${format("button.title", { type: localize("names.region") })}"></i>`
      : "";
    return `
      ${TemplateComponents.contentHeader(TemplateComponents.getAsset("icon", "region"), label, createLocationBtn)}
      ${data.isGM ? TemplateComponents.dropZone("region", TemplateComponents.getAsset("icon", "region"), "", "") : ""}
      ${TemplateComponents.entityGrid(data.linkedRegions, "region")}

    `;
  }

  async _generateLocationsTab(data) {
    const label = this._labelOverride(this.document, "locations") || localize("names.locations");
    const createLocationBtn = data.isGM
      ? `<i class="refresh-btn create-location-button fas fa-circle-plus" data-action="createLocationJournal" title="${format("button.title", { type: localize("names.location") })}"></i>`
      : "";
    return `
      ${TemplateComponents.contentHeader(TemplateComponents.getAsset("icon", "location"), label, createLocationBtn)}
      ${data.isGM ? TemplateComponents.dropZone("location", TemplateComponents.getAsset("icon", "location"), "", "") : ""}
      ${TemplateComponents.entityGrid(data.linkedLocations, "location")}

    `;
  }

  async _generateNPCsTab(data) {
    const label = this._labelOverride(this.document, "npcs") || localize("names.npcs");
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
    // const refreshBtn = `<button type="button" class="refresh-btn refresh-npcs" title="${localize("info.refresh")}"><i class="fas fa-sync-alt"></i></button>`;
    const npcBtn = dropToMapBtn + createNPCBtn;
    return `
      ${TemplateComponents.contentHeader(TemplateComponents.getAsset("icon", "npc"), label, npcBtn)}
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

    if (data.regionNPCsProcessed.length > 0) {
      content += `<div class="npc-section"><h3><i class="${TemplateComponents.getAsset("icon", "region")}"></i>${localize("names.region")} ${localize("names.npcs")}</h3>${TemplateComponents.entityGrid(data.regionNPCsProcessed, "npc", true, true)}</div>`;
    }

    if (locationNPCs.length > 0) {
      content += `<div class="npc-section"><h3><i class="${TemplateComponents.getAsset("icon", "location")}"></i>${localize("names.location")} ${localize("names.npcs")}</h3>${TemplateComponents.entityGrid(locationNPCs, "npc", true, true)}</div>`;
    }

    if (locationShopNPCs.length > 0) {
      content += `<div class="npc-section"><h3><i class="${TemplateComponents.getAsset("icon", "shop")}"></i> ${localize("names.location")} - ${localize("names.shop")} ${localize("names.npcs")}</h3>${TemplateComponents.entityGrid(locationShopNPCs, "npc", true, true)}</div>`;
    }
    if (data.linkedNPCsWithoutTaggedNPCs.length + directShopNPCs.length + locationNPCs.length + locationShopNPCs.length +data.regionNPCsProcessed.length === 0) {
      content = TemplateComponents.emptyState("npc");
    }
    return content;
  }

  async _generateShopsTab(data) {
    const label = this._labelOverride(this.document, "shops") || localize("names.shops");
    let buttons = "";
    if (data.isGM) {
      buttons += `<i class="refresh-btn create-shop-button fas fa-house-chimney-medical" data-action="createShopJournal" title="${format("button.title", { type: localize("names.shop") })}"></i>`;
    }
    let content = TemplateComponents.contentHeader(TemplateComponents.getAsset("icon", "region"), label, buttons);
    if (data.isGM) {
      content += TemplateComponents.dropZone("shop", TemplateComponents.getAsset("icon", "shop"), format("dropzone.link", { type: localize("names.shops") }), "");
    }

    if (data.linkedShops.length > 0) {
      content += `<div class="npc-section">${TemplateComponents.entityGrid(data.linkedShops, "shop", false, false)}</div>`;
    }
    if (data.allShops.length > 0) {
      content += `<div class="npc-section"><h3><i class="${TemplateComponents.getAsset("icon", "location")}"></i> ${localize("names.location")} ${label}</h3>${TemplateComponents.entityGrid(data.allShops, "shop", false, true)}</div>`;
    }

    if (data.allShops.length + data.linkedShops.length === 0) {
      content += TemplateComponents.emptyState("shop");
    }
    return content;
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
    const regionsTab = event.target.closest('.tab-panel[data-tab="regions"]');

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
    } else if (regionsTab) {
      const allRegionJournals = game.journal.filter((j) => j.getFlag("campaign-codex", "type") === "region");

      for (const existingRegion of allRegionJournals) {
        const nameMatch = existingRegion.name.toLowerCase() === scene.name.toLowerCase();
        const existingRegionData = existingRegion.getFlag("campaign-codex", "data") || {};
        const sceneMatch = existingRegionData.linkedScene === scene.uuid;

        if (nameMatch && sceneMatch) {
          ui.notifications.info(format("info.linkfound", { type: existingRegion.name }));
          await game.campaignCodex.linkRegionToRegion(this.document, existingRegion);
          this.render(true);
          return;
        }
      }
      const regionJournal = await game.campaignCodex.createRegionJournal(scene.name);
      if (regionJournal) {
        await game.campaignCodex.linkRegionToRegion(this.document, regionJournal);
        await game.campaignCodex.linkSceneToDocument(scene, regionJournal);
        ui.notifications.info(format("info.linkfound", { type: regionJournal.name }));
        this.render(true);
        regionJournal.sheet.render(true);
    } } else {
      // await this._saveFormData();
      await game.campaignCodex.linkSceneToDocument(scene, this.document);

      ui.notifications.info(format("info.linked", { type: scene.name }));
      this.render(true);
    }
  }

  async _handleJournalDrop(data, event) {
    const journal = await fromUuid(data.uuid);
    if (!journal || journal.uuid === this.document.uuid) return;

    const journalType = journal.getFlag("campaign-codex", "type");
    const dropOnInfoTab = event.target.closest('.tab-panel[data-tab="info"]');

    // await this._saveFormData();

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
    } else if (journalType === "region") {
      await game.campaignCodex.linkRegionToRegion(this.document, journal);
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
