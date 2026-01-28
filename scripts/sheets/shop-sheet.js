import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { TemplateComponents } from "./template-components.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { promptForName, localize, format, renderTemplate, getDefaultSheetTabs, getDefaultSheetHidden } from "../helper.js";

export class ShopSheet extends CampaignCodexBaseSheet {
  // =========================================================================
  // Foundry VTT Overrides
  // =========================================================================

  static DEFAULT_OPTIONS = {
    classes: ["campaign-codex", "sheet", "journal-sheet", "shop-sheet"],
    window: {
      title: 'Campaign Codex NPCSheet',
      icon: 'fas fa-house',
    },
    actions: {}
  };

  async _processShopData() {
    const shopData = this.document.getFlag("campaign-codex", "data") || {};
    let linkedScene = null;
    if (shopData.linkedScene) {
      try {
        const scene = await fromUuid(shopData.linkedScene);
        if (scene) {
          linkedScene = {
            uuid: scene.uuid,
            name: scene.name,
            img: scene.thumb || "icons/svg/map.svg",
          };
        }
      } catch (error) {
        console.warn(`Campaign Codex | Linked scene not found: ${shopData.linkedScene}`);
      }
    }
    const [linkedNPCs, linkedLocation, canViewLocation, canViewScene,inventory] = await Promise.all([
        CampaignCodexLinkers.getLinkedNPCs(this.document, shopData.linkedNPCs || []),
        shopData.linkedLocation ? CampaignCodexLinkers.getLinkedLocation(shopData.linkedLocation) : null,
        this.constructor.canUserView(shopData.linkedLocation),
        this.constructor.canUserView(shopData.linkedScene),
        CampaignCodexLinkers.getInventory(this.document, shopData.inventory)
    ]);
  
    return { shopData, linkedScene, linkedNPCs, linkedLocation, canViewLocation, canViewScene,inventory };
  }

    _getTabDefinitions() {
    return [
      {
        key: "info",
        label: localize("names.info"),
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
  if (options.force) {
    this._processedData = null;
  }
    if (options.renderContext === "updateJournalEntry" && !game.user.isGM) {
      this._processedData = null;
    }

  const context = await super._prepareContext(options);
  if (!this._processedData) {
    this._processedData = await this._processShopData();
  }
  const { shopData, linkedScene, linkedNPCs, linkedLocation, canViewLocation, canViewScene, inventory } = this._processedData;


    const hiddenAssociates = this.document.getFlag("campaign-codex", "data")?.hiddenAssociates || [];

    [ linkedNPCs]
      .flat()
      .filter(Boolean) 
      .forEach(item => {
          if (hiddenAssociates.includes(item.uuid)) item.hidden = true;
      });
  


  
  const rawInventoryCount = (shopData.inventory || []).length;
  context.inventory = inventory;

  context.isLoot = shopData.isLoot || false;
  context.hideInventory = shopData.hideInventory || false;
  context.inventoryCash = shopData.inventoryCash || 0;
  context.markup = shopData.markup || 1.0;
  context.linkedScene = linkedScene;
  context.linkedNPCs = linkedNPCs;
  context.linkedLocation = linkedLocation;


  context.canViewLocation = canViewLocation;
  context.canViewScene = canViewScene;
  context.taggedNPCs = context.linkedNPCs.filter((npc) => npc.tag === true);
  context.linkedNPCsWithoutTaggedNPCs = context.linkedNPCs.filter((npc) => npc.tag !== true);
  context.sheetType = "shop";
  if (context.sheetTypeLabelOverride !== undefined && context.sheetTypeLabelOverride !== "") {
    context.sheetTypeLabel = context.sheetTypeLabelOverride;
  } else {
    context.sheetTypeLabel = localize("names.shop");
  }
  context.customImage = this.document.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "shop");

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
        key: "inventory",
        active: this._currentTab === "inventory",
        content: await renderIfActive("inventory", this._generateInventoryTab(context)),
        icon: "fas fa-boxes",
        label: localize("names.inventory"),
        statistic: { value: rawInventoryCount, view: rawInventoryCount >0 },
      },
      {
        key: "npcs",
        statistic: { value: context.linkedNPCsWithoutTaggedNPCs.length, view: context.linkedNPCsWithoutTaggedNPCs.length>0 },
        active: this._currentTab === "npcs",
        content: await renderIfActive("npcs", this._generateNPCsTab(context)),
        label: localize("names.npcs"),
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
        content: await renderIfActive("widgets", this.generateWidgetsTab(this.document, context, this._labelOverride(this.document, "widgets"))),
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


    const defaultTabVis = getDefaultSheetTabs(this.getSheetType());
    const defaultTabHidden = getDefaultSheetHidden(this.getSheetType());


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
    // END OF TABS

    const sources = [
      { data: context.linkedLocation, type: "location" },
      { data: context.linkedNPCsWithoutTaggedNPCs, type: "npc" },
    ];

    context.quickLinks = CampaignCodexLinkers.createQuickLinks(sources);
    context.quickTags = CampaignCodexLinkers.createQuickTags(context.taggedNPCs);

    let headerContent = "";

    if (context.linkedLocation) {
      let icon = TemplateComponents.getAsset("icon", "location");
      let finalIconType = "location";
      if (context.linkedLocation.uuid) {
        const linkLocType = await fromUuid(context.linkedLocation.uuid);
        if (linkLocType) {
          const iconType = linkLocType.getFlag("campaign-codex", "type");
          finalIconType = iconType === "location" || iconType === "region" ? iconType : "location";
          icon = TemplateComponents.getAsset("icon", finalIconType);
        }
      }
      headerContent += `
        <div class="region-info">
        <span class="region-name ${context.canViewLocation ? `location-link" data-action="openLocation" data-uuid="${context.linkedLocation.uuid}"` : '"'}">
          <i class="${context.linkedLocation.iconOverride ? context.linkedLocation.iconOverride : icon}"></i>
          ${context.linkedLocation.name} - 
          ${context.linkedLocation.sheetTypeLabelOverride ? context.linkedLocation.sheetTypeLabelOverride : localize("names."+ finalIconType)}
        </span>    
        ${
          game.user.isGM
            ? `<i class="fas fa-unlink scene-btn remove-location" data-action="removeLocation" title="${format("message.unlink", { type: localize("names.location") })}"></i>`
            : ""
        }
        </div>
      `;
    }

    if (context.linkedScene) {
      headerContent += `
      <div class="scene-info">
        <span class="scene-name${context.canViewScene ? ` open-scene" data-action="openScene" data-scene-uuid="${context.linkedScene.uuid}"` : '"'} title="${format("message.open", { type: localize("names.scene") })}"> <i class="fas fa-map"></i> ${context.linkedScene.name}</span>
        ${
          game.user.isGM
            ? `<i class="fas fa-unlink scene-btn remove-scene" data-action="removeScene" title="${format("message.unlink", { type: localize("names.scene") })}"></i>`
            : ""
        }
      </div>
    `;
    } else {
      headerContent += `${
        game.user.isGM
          ? `<div class="scene-info">
        <span class="scene-name" style="text-align:center;"><i class="fas fa-link"></i> ${format("dropzone.link", { type: localize("names.scene") })}</span>
      </div>`
          : ""
      }
    `;
    }

    context.customHeaderContent = headerContent;

    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const nativeHtml = this.element;

    nativeHtml.querySelector("form")?.addEventListener("submit", (event) => event.preventDefault());
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
    return "shop";
  }

  // =========================================================================
  // Tab Generation
  // =========================================================================



  async _generateInfoTab(context) {
    const label = this._labelOverride(this.document, "info");
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");

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
      richTextDescription: TemplateComponents.richTextSection(this.document, context.sheetData.enrichedDescription, "description", context.isOwnerOrHigher)
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/base-info.hbs", templateData);
  }

  

  async _generateNPCsTab(context) {
    const label = this._labelOverride(this.document, "npcs") || localize("names.npcs");
    const preparedNPCs = context.linkedNPCs;
    const preparedTags = context.taggedNPCs;
    const preparedAssociatesNoTags = context.linkedNPCsWithoutTaggedNPCs;
    const dropToMapBtn =
      canvas.scene && game.user.isGM && preparedAssociatesNoTags.length > 0
        ? `
      <i class="fas fa-street-view refresh-btn npcs-to-map-button" data-action="npcsToMapButton" title="Drop NPCs to current scene"></i>`
        : "";
    const createNPCBtn = context.isGM
      ? `
      <i class="refresh-btn fas fa-user-plus create-npc-button" data-action="createNPCJournal" title="Create New NPC"></i>
      `
      : "";
    const npcBtn = dropToMapBtn + createNPCBtn;

    let content = `
    ${TemplateComponents.contentHeader("fas fa-users", label, npcBtn)}
    ${game.user.isGM ? `${TemplateComponents.dropZone("npc", "fas fa-user-plus", "", "")}` : ""}
    ${await TemplateComponents.entityGrid(preparedAssociatesNoTags, "npc", true)}
    `;
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

    // await this._saveFormData();
    await game.campaignCodex.linkSceneToDocument(scene, this.document);
    ui.notifications.info(`Linked scene "${scene.name}" to ${this.document.name}`);
    this.render(true);
  }


  async _handleJournalDrop(data, event) {
    const journal = await fromUuid(data.uuid);
    if (!journal || journal.id === this.document.id) return;
    const journalType = journal.getFlag("campaign-codex", "type");
    // await this._saveFormData();

    // Journal
    const dropOnInfoTab = event.target.closest('.tab-panel[data-tab="info"]');
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

    if (["npc", "tag"].includes(journalType)) {
      // await this._saveFormData();
      await game.campaignCodex.linkShopToNPC(this.document, journal);
      this.render(true);
    } else if (journalType === "location") {
      // await this._saveFormData();
      await game.campaignCodex.linkLocationToShop(journal, this.document);
      this.render(true);
    } else if (journalType === "region") {
      // await this._saveFormData();
      await game.campaignCodex.linkRegionToShop(journal, this.document);
      this.render(true);
    }
  }

}
