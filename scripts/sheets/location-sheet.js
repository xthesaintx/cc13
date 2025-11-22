import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { TemplateComponents } from "./template-components.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { promptForName, localize, format, renderTemplate, getDefaultSheetTabs } from "../helper.js";

export class LocationSheet extends CampaignCodexBaseSheet {
  // =========================================================================
  // Foundry VTT Overrides
  // =========================================================================
  static DEFAULT_OPTIONS = {
    classes: ["campaign-codex", "sheet", "journal-sheet", "location-sheet"],
    window: {
      title: 'Campaign Codex Location Sheet',
      icon: 'fas fa-map-marker-alt',
    },
    actions: {}
  };

  async _processLocationData() {
    const locationData = this.document.getFlag("campaign-codex", "data") || {};

    let linkedScene = null;
    if (locationData.linkedScene) {
      try {
        const scene = await fromUuid(locationData.linkedScene);
        if (scene) {
          linkedScene = {
            uuid: scene.uuid,
            name: scene.name,
            img: scene.thumb || "icons/svg/map.svg",
          };
        }
      } catch (error) {
        console.warn(`Campaign Codex | Linked scene not found: ${locationData.linkedScene}`);
      }
    }

    const [linkedRegion, directNPCs, shopNPCs, linkedShops, canViewRegion, canViewScene, inventory] = await Promise.all([
      CampaignCodexLinkers.getLinkedRegion(this.document),
      CampaignCodexLinkers.getDirectNPCs(this.document, locationData.linkedNPCs || []),
      CampaignCodexLinkers.getShopNPCs(this.document, locationData.linkedShops || []),
      CampaignCodexLinkers.getLinkedShops(this.document, locationData.linkedShops || []),
      this.constructor.canUserView(locationData.parentRegion),
      this.constructor.canUserView(locationData.linkedScene),
     CampaignCodexLinkers.getInventory(this.document, locationData.inventory || []),
    ]);

    return { locationData, linkedRegion, directNPCs, shopNPCs, linkedShops, linkedScene, canViewRegion, canViewScene, inventory };
  }

  _getTabDefinitions() {
    return [
      {
        key: "info",
        label: localize("names.info"),
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
      this._processedData = await this._processLocationData();
    }
    const { locationData, linkedRegion, directNPCs, shopNPCs, linkedShops, linkedScene, canViewRegion, canViewScene, inventory } = this._processedData;
    context.inventory = inventory;
    context.isLoot = locationData.isLoot || false;
    context.markup = locationData.markup || 1.0;
    context.inventoryCash = locationData.inventoryCash || 0;
    context.linkedRegion = linkedRegion;
    context.directNPCs = directNPCs;
    context.shopNPCs = shopNPCs;
    context.linkedShops = linkedShops;
    context.linkedScene = linkedScene;
    context.canViewRegion = canViewRegion;
    context.canViewScene = canViewScene;
    context.sheetType = "location";
    if (context.sheetTypeLabelOverride !== undefined && context.sheetTypeLabelOverride !== "") 
    {
      context.sheetTypeLabel = context.sheetTypeLabelOverride;
    } else {
      context.sheetTypeLabel = localize("names.location");
    }
    context.customImage = this.document.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "location");
    context.allNPCs = [...context.directNPCs, ...context.shopNPCs];
    context.taggedDirectNPCs = context.directNPCs.filter((npc) => npc.tag === true);
    context.taggedShopNPCs = context.shopNPCs.filter((npc) => npc.tag === true);
    context.taggedNPCs = context.allNPCs.filter((npc) => npc.tag === true);
    context.directNPCsWithoutTaggedNPCs = context.directNPCs.filter((npc) => npc.tag !== true);
    context.shopNPCsWithoutTaggedNPCs = context.shopNPCs.filter((npc) => npc.tag !== true);
    context.allNPCsWithoutTaggedNPCs = [...context.directNPCsWithoutTaggedNPCs, ...context.shopNPCsWithoutTaggedNPCs];
    const directUuids = new Set(context.directNPCsWithoutTaggedNPCs.map((npc) => npc.uuid));
    context.shopNPCsWithoutTaggedNPCsNoDirect = context.shopNPCsWithoutTaggedNPCs.filter((associate) => !directUuids.has(associate.uuid));
    const statAllNPCs = context.directNPCsWithoutTaggedNPCs.length + context.shopNPCsWithoutTaggedNPCsNoDirect.length;
    

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
        key: "shops",
        statistic: { value: context.linkedShops.length, view: context.linkedShops.length > 0 },
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
        statistic: { value: statAllNPCs, view: statAllNPCs > 0 },
        active: this._currentTab === "associates",
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
      { data: context.allNPCsWithoutTaggedNPCs, type: "npc" },
      { data: context.linkedShops, type: "shop" },
    ]);
    context.quickTags = CampaignCodexLinkers.createQuickTags(context.taggedDirectNPCs);

        // <div class="region-info"><i class="${TemplateComponents.getAsset("icon", "region")}"></i><span class="region-name ${context.canViewRegion ? `region-link" data-action="openRegion" data-uuid="${context.linkedRegion.uuid}"` : '"'}">${context.linkedRegion.name}</span>

    // --- Custom Header ---
    let headerContent = "";
    if (context.linkedRegion) {
      headerContent += `
      <div class="region-info">
        <span class="region-name ${context.canViewRegion ? `region-link" data-action="openRegion" data-uuid="${context.linkedRegion.uuid}"` : '"'}">
          <i class="${context.linkedRegion.iconOverride ? context.linkedRegion.iconOverride : TemplateComponents.getAsset("icon", "region")}"></i>
          ${context.linkedRegion.name} - 
          ${context.linkedRegion.sheetTypeLabelOverride ? context.linkedRegion.sheetTypeLabelOverride : localize("names.region")}
        </span>    

         ${
          game.user.isGM
            ? `<i class="fas fa-unlink scene-btn remove-location" data-action="removeLocation" title="${format("message.unlink", { type: localize("names.location") })}"></i>`
            : ""
        }</div>`;
    }
    if (context.linkedScene) {
      headerContent += `<div class="scene-info"><span class="scene-name ${context.canViewScene ? `open-scene" data-action="openScene" data-scene-uuid="${context.linkedScene.uuid}"` : '"'} title="Open Scene"><i class="fas fa-map"></i> ${context.linkedScene.name}</span>${context.isGM ? `<i class="fas fa-unlink scene-btn remove-scene" data-action="removeScene" title="${format("message.unlink", { type: localize("names.scene") })}"></i>` : ""}</div>`;
    } else if (context.isGM) {
      headerContent += `<div class="scene-info"><span class="scene-name open-scene"><i class="fas fa-link"></i> ${format("dropzone.link", { type: localize("names.scene") })}</span></div>`;
    }
    if (headerContent) context.customHeaderContent = headerContent;


    return context;
  }


  async _onRender(context, options) {
    await super._onRender(context, options);
    const nativeHtml = this.element;

    // --- Listeners for actions on lists that require a flag ---
    const listActionMap = {
      ".remove-npc": { flag: "linkedNPCs", handler: this._onRemoveFromList },
      ".remove-shop": { flag: "linkedShops", handler: this._onRemoveFromList },
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
    return "location";
  }

  // =========================================================================
  // Tab Generation
  // =========================================================================

  _generateInfoTab(data) {
    let regionSection = "";
    const label = this._labelOverride(this.document, "info") || localize("names.information");

    if (data.linkedRegion) {
      const regionCard = `
        <div class="linked-actor-card">
          <div class="actor-image"><img src="${data.linkedRegion.img}" alt="${data.linkedRegion.name}"></div>
          <div class="actor-content"><h4 class="actor-name">${data.linkedRegion.name}</h4></div>
          <div class="actor-actions">
            ${data.canViewRegion ? `<i class="fas fa-external-link-alt action-btn open-region" data-action="openRegion" data-uuid="${data.linkedRegion.uuid}" title="Open Region"></i>` : ""}
            ${data.isGM ? `<i class="fas fa-unlink action-btn remove-location" data-action="removeLocationFromRegion" data-uuid="${data.linkedRegion.uuid}" title="Remove from Region"></i>` : ""}
          </div>
        </div>
      `;
      regionSection = `<div class="form-section">${regionCard}</div>`;
    } else if (data.isGM) {
      regionSection = `<div class="form-section">${TemplateComponents.dropZone("region", "fas fa-globe", format("dropzone.link", { type: localize("names.region") }), "")}</div>`;
    }
    return `
      ${TemplateComponents.contentHeader("fas fa-info-circle", label)}
      ${regionSection}
      ${TemplateComponents.richTextSection(this.document, data.sheetData.enrichedDescription, "description", data.isOwnerOrHigher)}
    `;
  }

  async _generateNPCsTab(data) {
    const label = this._labelOverride(this.document, "npcs") || localize("names.npcs");
    const preparedDirectNPCs = data.directNPCsWithoutTaggedNPCs;
    const preparedShopNPCs = data.shopNPCsWithoutTaggedNPCsNoDirect;
    const preparedtaggedNPCs = data.taggedDirectNPCs;

    let buttons = "";
    if (data.isGM) {
      if (canvas.scene && data.directNPCs.length > 0) {
        buttons += `<i class="fas fa-street-view refresh-btn npcs-to-map-button" data-action="npcsToMapButton" title="${format("button.droptoscene", { type: localize("names.npc") })}"></i>`;
      }
      buttons += `<i class="refresh-btn fas fa-user-plus create-npc-button" data-action="createNPCJournal" title="${format("button.title", { type: localize("names.npc") })}"></i>`;
    }

    let content = TemplateComponents.contentHeader("fas fa-users", label, buttons);
    if (data.isGM) {
      content += TemplateComponents.dropZone("npc", "fas fa-user-plus", "", "");
    }

    if (preparedDirectNPCs.length > 0) {
      content += `<div class="npc-section">${TemplateComponents.entityGrid(preparedDirectNPCs, "npc", true)}</div>`;
    }

    if (preparedShopNPCs.length > 0) {
      content += `<div class="npc-section"><h3><i class="${TemplateComponents.getAsset("icon", "shop")}"></i> ${format("heading.in", { type: localize("names.shop"), in: localize("names.npcs") })}</h3>${TemplateComponents.entityGrid(preparedShopNPCs, "npc", true, true)}</div>`;
    }

    if (data.allNPCs.length === 0) {
      content += TemplateComponents.emptyState("npc");
    }
    return content;
  }

  async _generateShopsTab(data) {
    const label = this._labelOverride(this.document, "shops") || localize("names.shops");
    const createShopBtn = data.isGM
      ? `<i class="refresh-btn create-shop-button fas fa-house-chimney-medical" data-action="createShopJournal" title="${format("button.title", { type: localize("names.shop") })}"></i>`
      : "";
    const preparedShops = data.linkedShops;
    return `
      ${TemplateComponents.contentHeader("fas fa-book-open", label, createShopBtn)}
      ${data.isGM ? TemplateComponents.dropZone("shop", "fas fa-book-open", "Add Entries", "Drag entry journals here to link them") : ""}
      ${TemplateComponents.entityGrid(preparedShops, "shop")}
    `;
  }

  // =========================================================================
  // Event Handlers
  // =========================================================================


  async _onRefreshNPCs(event) {
    this.render(true);
    ui.notifications.info("Location data refreshed!");
  }

  // =========================================================================
  // Drop Logic
  // =========================================================================

  async _handleSceneDrop(data, event) {
    const scene = await fromUuid(data.uuid);
    if (!scene) return ui.notifications.warn("Could not find the dropped scene.");
    // await this._saveFormData();
    await game.campaignCodex.linkSceneToDocument(scene, this.document);
    ui.notifications.info(`Linked scene "${scene.name}" to ${this.document.name}`);
    this.render(true);
  }

  async _handleJournalDrop(data, event) {
    const journal = await fromUuid(data.uuid);
    if (!journal || journal.uuid === this.document.uuid) return;

    const journalType = journal.getFlag("campaign-codex", "type");

    // await this._saveFormData();
    if ((!journalType && data.type === "JournalEntry") || data.type === "JournalEntryPage") {
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
    } else if (journalType === "npc") {
      await game.campaignCodex.linkLocationToNPC(this.document, journal);
    } else if (journalType === "shop") {
      await game.campaignCodex.linkLocationToShop(this.document, journal);
    } else if (journalType === "region") {
      await game.campaignCodex.linkRegionToLocation(journal, this.document);
      ui.notifications.info(format("ui.addedto", { type: this.document.name, typeb: journal.name }));
    } else {
      return;
    }
    this.render(true);
  }
}