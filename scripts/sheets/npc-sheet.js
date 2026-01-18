import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { TemplateComponents } from "./template-components.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { promptForName, localize, format, renderTemplate, getDefaultSheetTabs, getDefaultSheetHidden } from "../helper.js";

export class NPCSheet extends CampaignCodexBaseSheet {
  // =========================================================================
  // Foundry VTT Overrides
  // =========================================================================

  static DEFAULT_OPTIONS = {
    classes: ["campaign-codex", "sheet", "journal-sheet", "npc-sheet"],
    window: {
      title: 'Campaign Codex NPCSheet',
      icon: 'fas fa-user-tag',
    },
    actions: {
      npcTagMode:this.#_npcSheetMode
    }
  };


  async _processNpcData() {
    const npcData = this.document.getFlag("campaign-codex", "data") || {};
    const [linkedActor, rawLocations, linkedShops, associates, inventory] = await Promise.all([
      npcData.linkedActor ? CampaignCodexLinkers.getLinkedActor(npcData.linkedActor) : null,
      CampaignCodexLinkers.getAllLocations(this.document, npcData.linkedLocations || []),
      CampaignCodexLinkers.getLinkedShopsWithLocation(this.document, npcData.linkedShops || []),
      CampaignCodexLinkers.getAssociates(this.document, npcData.associates || []),
      CampaignCodexLinkers.getInventory(this.document, npcData.inventory)
    ]);

    return { npcData, linkedActor, rawLocations, linkedShops, associates,inventory };
  }


  _getTabDefinitions() {
    return [
      {
        key: "info",
        label: localize("names.info"),
      },
      {
        key: "regions",
        label: localize("names.regions"),
      },
      {
        key: "locations",
        label: localize("names.locations"),
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
        key: "associates",
        label: localize("names.associates"),
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


    static async #_npcSheetMode(event){
    this.document.setFlag("core", "sheetClass", "campaign-codex.TagSheet");
  }      

  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    if ( !this.hasFrame ) return frame;
    if (this.document.getFlag("campaign-codex", "data")?.tagMode){
    const copyId = `
        <button type="button" class="header-control fa-solid fa-tag icon" data-action="npcTagMode"
                data-tooltip="Migrate to Tag Sheet" aria-label="Migrate to Tag Sheet"></button>
      `;
      this.window.close.insertAdjacentHTML("beforebegin", copyId);
    }
    return frame;
  }


  async _prepareContext(options) {
  if (options.renderContext === "updateJournalEntry" && !game.user.isGM) {
    this._processedData = null;
  }
  
  if (options.force) {
    this._processedData = null;
  }
    const context = await super._prepareContext(options);

    if (!this._processedData) {
      this._processedData = await this._processNpcData();
    }
    const { npcData, linkedActor, rawLocations, linkedShops, associates,inventory } = this._processedData;
    const rawInventoryCount = (npcData.inventory || []).length;
    context.inventory = inventory;
    context.isLoot = npcData.isLoot || false;
    context.markup = npcData.markup || 1.0;
    context.inventoryCash = npcData.inventoryCash || 0;
    context.tagMode = npcData.tagMode || false;
    context.linkedActor = linkedActor;
    context.allLocations = rawLocations;
    context.linkedShops = linkedShops;
    context.associates = associates;


    // --- Linked Data Fetching ---

    context.defaultImage = TemplateComponents.getAsset("image", "npc");

    // Permissions
    context.allLocations = rawLocations;
    context.taggedNPCs = context.associates.filter((npc) => npc.tag === true);
    context.associatesWithoutTaggedNPCs = context.associates.filter((npc) => npc.tag !== true);


    const allowedTypes = ["character", "player", "group"];

    // --- Basic Sheet Info ---
    context.sheetType = "npc";
        if (context.sheetTypeLabelOverride !== undefined && context.sheetTypeLabelOverride !== "") {
            context.sheetTypeLabel = context.sheetTypeLabelOverride;
        } else if (context.tagMode) {
            context.sheetTypeLabel = localize("names.tag") 
        } else {
            context.sheetTypeLabel = context.linkedActor?.type && allowedTypes.includes(context.linkedActor?.type.toLowerCase()) 
                ? format("sheet.journal", { type: localize("names.player") }) 
                : format("sheet.journal", { type: localize("names.npc") });
        }


    context.customImage = this.document.getFlag("campaign-codex", "image") || context.linkedActor?.img || TemplateComponents.getAsset("image", "npc");

    const directLocationCount = context.allLocations.filter((loc) => loc.source === "direct").length;

    context.regionLinks = context.allLocations.filter(item => item.typeData === "region");
    context.locationLinks = context.allLocations.filter(item => item.typeData !== "region");

    // TABS
    const tabOverrides = this.document.getFlag("campaign-codex", "tab-overrides") || [];
    let defaultTabs = this._getTabDefinitions();
    const gmOnlyTabs = ['notes'];
    if (!game.user.isGM) {
      defaultTabs = defaultTabs.filter(tab => !gmOnlyTabs.includes(tab.key));
    }
    const renderIfActive = async (key, generatorPromise) => {
        if (this._currentTab === key) {
            return await generatorPromise;
        }
        return "";
    };
    const tabContext = [
      {
        key: "info",
        active: this._currentTab === "info",
        content:  await renderIfActive("info", this._generateInfoTab(context)),
        label: localize("names.info"),
        icon: "fas fa-info-circle",
      },
      {
        key: "regions",
        statistic: { value: context.regionLinks.length, view: context.regionLinks.length > 0 },
        active: this._currentTab === "regions",
        content: await renderIfActive("regions", this._generateRegionsTab(context)),
        label: localize("names.regions"),
        icon: TemplateComponents.getAsset("icon", "region"),
      },
      {
        key: "locations",
        statistic: { value: context.locationLinks.length, view: context.locationLinks.length > 0 },
        active: this._currentTab === "locations",
        content: await renderIfActive("locations", this._generateLocationsTab(context)),
        label: localize("names.locations"),
        icon: TemplateComponents.getAsset("icon", "location"),
      },
      {
        key: "shops",
        statistic: { value: context.linkedShops.length, view: context.linkedShops.length > 0 },
        active: this._currentTab === "shops",
        content: await renderIfActive("shops",  this._generateShopsTab(context)),
        label: localize("names.shops"),
        icon: TemplateComponents.getAsset("icon", "shop"),
      },
      {
        key: "inventory",
        active: this._currentTab === "inventory",
        content: await renderIfActive("inventory", await this._generateInventoryTab(context)),
        icon: "fas fa-boxes",
        label: localize("names.inventory"),
        statistic: { value: rawInventoryCount, view: rawInventoryCount >0, },
      },
      {
        key: "associates",
        statistic: { value: context.associatesWithoutTaggedNPCs.length, view: context.associatesWithoutTaggedNPCs.length > 0 },
        active: this._currentTab === "associates",
        content: await renderIfActive("associates",  this._generateAssociatesTab(context)),
        label: context.tagMode ? localize("names.members") : localize("names.associates"),
        icon: TemplateComponents.getAsset("icon", "npc"),
      },
      { 
        key: "quests", 
        statistic: {value: context.sheetData.quests.length, view:context.sheetData.quests.length>0},
        active: this._currentTab === "quests", 
        content: await renderIfActive("quests", TemplateComponents.questList(this.document, context.sheetData.quests, context.isGM)),
        label: localize("names.quests"), 
        icon: "fas fa-scroll", 
      }, 
      { 
        key: "journals", 
        statistic: {value: context.linkedStandardJournals.length, view:context.linkedStandardJournals.length>0}, 
        active: this._currentTab === "journals", 
        content: this._currentTab === "journals" 
           ? `${TemplateComponents.contentHeader("fas fa-book", this._labelOverride(this.document, "journals") || localize("names.journals"))}${TemplateComponents.standardJournalGrid(context.linkedStandardJournals)}`
           : "",
        label: localize("names.journals"), 
        icon: "fas fa-book", 
      },
      { 
        key: "widgets", 
        statistic: {value: context.activewidget.length, view:context.activewidget.length>0},
        active: this._currentTab === "widgets",
        content: await renderIfActive("widgets",  this.generateWidgetsTab(this.document, context, this._labelOverride(this.document, "widgets"))),
        label: localize("names.widgets"), 
        icon: "fas fa-puzzle-piece", 
      },
      {
        key: "notes",
        active: this._currentTab === "notes",
        content: await renderIfActive("notes",  CampaignCodexBaseSheet.generateNotesTab(this.document, context, this._labelOverride(this.document, "notes"))),
        label: localize("names.note") || "Notes",
        icon: "fas fa-sticky-note", 
      },
    ];
    const defaultSheetType = context.tagMode ? 'tag' : 'npc';
    
    const defaultTabVis = getDefaultSheetTabs(defaultSheetType);
    const defaultTabHidden = getDefaultSheetHidden(defaultSheetType);


  if (["npc", "tag"].includes(defaultSheetType) && defaultTabVis.hasOwnProperty('npcs') && !defaultTabVis.hasOwnProperty('associates')) {
      defaultTabVis.associates = defaultTabVis.npcs;
      delete defaultTabVis.npcs;
      if (defaultTabHidden.hasOwnProperty('npcs')) {
          defaultTabHidden.associates = defaultTabHidden.npcs;
          delete defaultTabHidden.npcs;
      }
    }



    context.tabs = defaultTabs
      .map(tab => {
        const override = tabOverrides.find(o => o.key === tab.key);
        const isVisibleByDefault = defaultTabVis[tab.key] ?? true;
        const isVisible = override?.visible ?? isVisibleByDefault;
        
        if (!isVisible) return null;
        const isHiddenByDefault = defaultTabHidden[tab.key] ?? false;
        const isHidden = override?.hidden ?? isHiddenByDefault;
        if (!game.user.isGM && isHidden) {
            return null;
        }

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
    if (context.tabs.length > 0) {
      const availableKeys = context.tabs.map(t => t.key);
      if (!this._currentTab || !availableKeys.includes(this._currentTab)) {
        this._currentTab = context.tabs[0].key;
      }
    }



    // --- Tags and Links ---

    context.quickTags = CampaignCodexLinkers.createQuickTags(context.taggedNPCs);



    context.quickLinks = CampaignCodexLinkers.createQuickLinks([
      { data: context.locationLinks, type: "location" },
      { data: context.regionLinks, type: "region" },
      { data: context.linkedShops, type: "shop" },
      { data: context.associatesWithoutTaggedNPCs, type: "npc" },
    ]);


    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const nativeHtml = this.element;

    // --- Listeners for non-click events (e.g., change) ---
    // nativeHtml.querySelector(".tag-mode-toggle")?.addEventListener("change", this._onTagToggle.bind(this));
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
    return "npc";
  }

  // =========================================================================
  // Tab Generation
  // =========================================================================

  async _generateInfoTab(context) {
    const label = this._labelOverride(this.document, "info");
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    let actorSection = "";
    if (context.linkedActor && (!hideByPermission || context.linkedActor.canView)) {
      actorSection = TemplateComponents.actorLinkCard(context.linkedActor);
    } else if (context.isGM) {
    }

     const templateData = {
      widgetsPosition: context.widgetsPosition,
      widgetsToRender: context.infoWidgetsToRender,
      activewidget: context.activewidgetInfo,
      inactivewidgets: context.inactivewidgetsInfo,
      addedWidgetNames: context.addedWidgetNamesInfo,
      availableWidgets: context.availableWidgets,
      isWidgetTrayOpen:this._isWidgetInfoTrayOpen,
      isGM: context.isGM,
      labelOverride:label,
      actor: actorSection,
      richTextDescription: TemplateComponents.richTextSection(this.document, context.sheetData.enrichedDescription, "description", context.isOwnerOrHigher)
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/base-info.hbs", templateData);
  }

  async _generateRegionsTab(context) {
    const label = this._labelOverride(this.document, "regions") || localize("names.regions");
    let buttons = "";
    if (context.isGM) {
      buttons += `<i class="fas fa-circle-plus refresh-btn create-region-button" data-action="createRegionJournal" title="${format("button.title", { type: localize("names.region") })}"></i>`;
    }
    return `
      ${context.tagMode ? `${TemplateComponents.contentHeader("fas fa-map-marker-alt", format("member.type", { type: label }), buttons)}` : `${TemplateComponents.contentHeader("fas fa-globe", label, buttons)}`}
      ${context.isGM ? TemplateComponents.dropZone("region", "fas fa-globe", " ", "") : ""}
      ${await this._generateLocationsBySource(context.regionLinks,"region")}
    `;
  }

  async _generateLocationsTab(context) {
    const label = this._labelOverride(this.document, "locations") || localize("names.locations");
    let buttons = "";
    if (context.isGM) {
      buttons += `<i class="fas fa-circle-plus refresh-btn create-location-button" data-action="createLocationJournal" title="${format("button.title", { type: localize("names.location") })}"></i>`;
    }
    return `
      ${context.tagMode ? `${TemplateComponents.contentHeader("fas fa-map-marker-alt", format("member.type", { type: label }), buttons)}` : `${TemplateComponents.contentHeader("fas fa-map-marker-alt", label, buttons)}`}
      ${context.isGM ? TemplateComponents.dropZone("location", "fas fa-map-marker-alt", " ", "") : ""}
      ${await this._generateLocationsBySource(context.locationLinks)}
    `;
  }

  async _generateLocationsBySource(locations, type="location") {
    const directLocations = locations.filter((loc) => loc.source === "direct");
    const shopLocations = locations.filter((loc) => loc.source === "shop");
    let content = "";
    if (context.tagMode) {
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
      if (locations.length === 0) {
        content = TemplateComponents.emptyState(type);
      }
    }
    return content;
  }

  async _generateShopsTab(context) {
    const label = this._labelOverride(this.document, "shops") || localize("names.shops");
    const createShopBtn = context.isGM
      ? `<i class="refresh-btn create-shop-button fas fa-house-chimney-medical" data-action="createShopJournal" title="${format("button.title", { type: localize("names.shop") })}"></i>`
      : "";
    const preparedShops = context.linkedShops;
    return `
      ${context.tagMode ? TemplateComponents.contentHeader("fas fa-book-open", format("member.type", { type: label }), createShopBtn) : TemplateComponents.contentHeader("fas fa-book-open", label, createShopBtn)}
      ${context.isGM ? TemplateComponents.dropZone("shop", "fas fa-book-open", "", "") : ""}
      ${TemplateComponents.entityGrid(preparedShops, "shop")}
    `;
  }

  async _generateAssociatesTab(context) {
    let defaultLabel = localize("names.associates");
    if (context.tagMode) defaultLabel = localize("names.members")
    const label = this._labelOverride(this.document, "associates") || defaultLabel ;
    
    const preparedAssociates = context.associates;
    const preparedTags = context.taggedNPCs;
    const preparedAssociatesNoTags = context.associatesWithoutTaggedNPCs;
    let content = "";
    let buttons = "";
    if (context.isGM) {
      buttons += `<i class="fas fa-user-plus refresh-btn create-npc-button" data-action="createNPCJournal" title="${format("button.title", { type: localize("names.npc") })}"></i>`;
    }
    if (context.isGM && canvas.scene && preparedAssociatesNoTags.length > 0) {
      buttons += `<i class="refresh-btn fas fa-street-view members-to-map-button" data-action="membersToMapButton" title="${format("button.droptoscene", { type: localize("names.npc") })}"></i>`;
    }

    if (context.tagMode) {
      content += `${TemplateComponents.contentHeader("fas fa-users", label, buttons)}
        ${context.isGM ? TemplateComponents.dropZone("associate", "fas fa-user-friends", "", "") : ""}
        ${TemplateComponents.entityGrid(preparedAssociatesNoTags, "associate", true)}
        `;
    } else {
      content += `${TemplateComponents.contentHeader("fas fa-users", label, buttons)}`;

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


  async _onTagToggle(event) {
    const tagMode = event.target.checked;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.tagMode = tagMode;
    await this.document.setFlag("campaign-codex", "data", currentData);
    if (tagMode) {
      game.campaignCodex.addTagToCache(this.document);
      } else {
          game.campaignCodex.removeTagFromCache(this.document);
      }
    this.render(true);
  }



  // async _onRefreshLocations(event) {
  //   this.render(true);
  //   ui.notifications.info("Location data refreshed!");
  // }



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


    // Journal
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
      }



    if (journalType === "location") {
      await game.campaignCodex.linkLocationToNPC(journal, this.document);
    } else if (journalType === "shop") {
      await game.campaignCodex.linkShopToNPC(journal, this.document);
    } else if (["npc", "tag"].includes(journalType)) {
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
