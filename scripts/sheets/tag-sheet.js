import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { TemplateComponents } from "./template-components.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { GroupLinkers } from "./group-linkers.js";
import { localize, format, renderTemplate, getDefaultSheetTabs, gameSystemClass, journalSystemClass, isThemed, getDefaultSheetHidden } from "../helper.js";
import { widgetManager } from "../widgets/WidgetManager.js";

export class TagSheet extends CampaignCodexBaseSheet {
  // =========================================================================
  // Foundry VTT Overrides
  // =========================================================================
  static DEFAULT_OPTIONS = {
    classes: ["campaign-codex", "sheet", "journal-sheet", "group-sheet", "tag-sheet"],
    window: {
      title: 'Campaign Codex Tag Sheet',
      icon: 'fas fa-tag',
    },
    position: {
      width: 960,
      height: 800
    },
    actions: {
      selectSheet: this.#_selectSheet,
      SelectedSheetTabChange: this.#_SelectedSheetTabChange,
      dropSelectedActorToMap: this.#_onDropSingleNPCToMapClick,
      openGroupScene: this.#_onOpenScene,
      expantToggle: this.#_onToggleTreeNode,
      expandAll: this.#_onExpandAll,
      collapseAll: this.#_onCollapseAll,
      selectSheetDrop: this.#_onDropSelectedSheetNPCsToMapClick,
      npcTagMode:this.#_npcSheetMode
    }
  };

  static PARTS = {
    main: {
      template: "modules/campaign-codex/templates/tag-sheet.hbs",
      scrollable: [
        "", ".scrollable",
        ".tree-content",
        ".group-tab-panel-selected-sheet",
        ".group-tab-panel.info",
        ".group-tab-panel.inventory",
        ".group-tab-panel.quests",
        ".group-tab-panel.journals",
        ".group-tab-panel.widgets",
        ".group-tab-panel.notes"
      ]
    }
  }

  constructor(document, options = {}) {
    super(document, options);
    this._selectedSheet = null;
    this._selectedSheetTab = "info";
    this._expandedNodes = new Set();
    // Default expansions
    this._expandedNodes.add("cat-regions");
    this._expandedNodes.add("cat-locations");
    this._expandedNodes.add("cat-shops");
    this._expandedNodes.add("cat-associates");

    this._processedData = null;
    this._currentTab = "info";
  }

  // =========================================================================
  // Data Processing
  // =========================================================================
  
  getSheetType() {
    return "tag";
  }

  async _processTagData() {
    const npcData = this.document.getFlag("campaign-codex", "data") || {};
    const [linkedActor, rawLocations, linkedShops, associates, inventory, linkedGroups] = await Promise.all([
      npcData.linkedActor ? CampaignCodexLinkers.getLinkedActor(npcData.linkedActor) : null,
      CampaignCodexLinkers.getLinkedLocations(this.document, npcData.linkedLocations || []),
      CampaignCodexLinkers.getLinkedShops(this.document, npcData.linkedShops || []),
      CampaignCodexLinkers.getAssociates(this.document, npcData.associates || []),
      CampaignCodexLinkers.getInventory(this.document, npcData.inventory),
      CampaignCodexLinkers.getGroups(this.document, npcData.linkedGroups || []),
    ]);

    return { npcData, linkedActor, rawLocations, linkedShops, associates, inventory,linkedGroups };
  }

  // =========================================================================
  // Rendering & Context
  // =========================================================================

  _getTabDefinitions() {
    return [
      { key: "info", label: localize("names.info") },
      { key: "inventory", label: localize("names.inventory") },
      { key: "quests", label: localize("names.quests") },
      { key: "journals", label: localize("names.journals") },
      { key: "widgets", label: localize("names.widgets") },
      { key: "notes", label: localize("names.note") },
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
      this._processedData = await this._processTagData();
    }
   
    context.isGM = game.user.isGM;
    const { npcData, linkedActor, rawLocations, linkedShops, associates, inventory, linkedGroups } = this._processedData;

    context.inventory = inventory;
    context.linkedActor = linkedActor;
    context.isLoot = npcData.isLoot || false;
    context.markup = npcData.markup || 1.0;
    context.inventoryCash = npcData.inventoryCash || 0;
    context.customImage = this.document.getFlag("campaign-codex", "image") || context.linkedActor?.img || TemplateComponents.getAsset("image", "npc");
    context.sheetTypeLabel = localize("names.tag");
    context.sheetType = "tag";

    context.taggedNPCs = associates.filter((npc) => npc.tag === true);
    context.associatesWithoutTaggedNPCs = associates.filter((npc) => npc.tag !== true);
    // Prepare data for the Tree/Left Panel
    const leftPanelData = {
        regionLinks: rawLocations.filter(item => item.type === "region"),
        locationLinks: rawLocations.filter(item => item.type !== "region"),
        linkedShops: linkedShops,
        linkedGroups:linkedGroups,
        associates: context.associatesWithoutTaggedNPCs
    };
    context.leftPanel = await this._generateLeftPanel(leftPanelData);

    // --- WIDGETS CONFIGURATION ---
    const sheetWidgets = this.document.getFlag("campaign-codex", "sheet-widgets") || []; 
    context.activewidget = sheetWidgets.filter(w => w.active);
    context.inactivewidgets = sheetWidgets.filter(w => !w.active);
    const allAvailable = Array.from(widgetManager.widgetRegistry.keys());
    context.addedWidgetNames = sheetWidgets.map(w => w.widgetName);
    context.availableWidgets = allAvailable.map(name => ({ name: name }));
    context.widgetsToRender = await widgetManager.instantiateActiveWidgets(this.document);

    // --- TABS CONFIGURATION ---
    const tabOverrides = this.document.getFlag("campaign-codex", "tab-overrides") || [];
    let defaultTabs = this._getTabDefinitions();
    const gmOnlyTabs = ['notes'];
    if (!game.user.isGM) {
      defaultTabs = defaultTabs.filter(tab => !gmOnlyTabs.includes(tab.key));
    }

    const isMainView = !this._selectedSheet;
    const renderIfActive = async (key, generatorPromise) => {
        if (isMainView && this._currentTab === key) {
            return await generatorPromise;
        }
        return ""; // Return empty string for hidden tabs
    };

    const tabContext = [
      {
        key: "info",
        active: isMainView && this._currentTab === "info",
        content: await renderIfActive("info", this._generateInfoTab(context, npcData)),
        label: localize("names.info"),
        icon: "fas fa-info-circle",
      },
      {
        key: "inventory",
        active: isMainView && this._currentTab === "inventory",
        content: await renderIfActive("inventory", this._generateInventoryTab(context)),
        icon: "fas fa-boxes",
        label: localize("names.inventory"),
        statistic: { value: (npcData.inventory || []).length, view: (npcData.inventory || []).length > 0 },
      },
      {
        key: "quests",
        active: isMainView && this._currentTab === "quests",
        content: await renderIfActive("quests", TemplateComponents.questList(this.document, context.sheetData.quests, context.isGM)),
        label: localize("names.quests"),
        icon: "fas fa-scroll",
        statistic: { value: context.sheetData.quests.length, view: context.sheetData.quests.length > 0 },
      },
      {
        key: "journals",
        active: isMainView && this._currentTab === "journals",
        content: this._currentTab === "journals" 
           ? `${TemplateComponents.contentHeader("fas fa-book", this._labelOverride(this.document, "journals") || localize("names.journals"))}${TemplateComponents.standardJournalGrid(context.linkedStandardJournals)}`
           : "",
        label: localize("names.journals"),
        icon: "fas fa-book",
        statistic: { value: context.linkedStandardJournals.length, view: context.linkedStandardJournals.length > 0 },
      },
      {
        key: "widgets",
        active: isMainView && this._currentTab === "widgets",
        content: await renderIfActive("widgets", this._generateGroupWidgetsTab(this.document, context)),
        label: localize("names.widgets"),
        icon: "fas fa-puzzle-piece",
        statistic: { value: context.activewidget.length, view: context.activewidget.length > 0 },
      },
      {
        key: "notes",
        active: isMainView && this._currentTab === "notes",
        content: await renderIfActive("notes", CampaignCodexBaseSheet.generateNotesTab(this.document, context, this._labelOverride(this.document, "notes"))),
        label: localize("names.note") || "Notes",
        icon: "fas fa-sticky-note",
      },
    ];



    const defaultTabVis = getDefaultSheetTabs(this.getSheetType());
    const defaultTabHidden = getDefaultSheetHidden(this.getSheetType());


    if (this._selectedSheet) {
      context.isShowingSelectedView = true;
      context.selectedSheetContent = await this._generateSelectedSheetTab();
      this._currentTab = null;
    } else {
      context.isShowingSelectedView = false;
    }

    context.tabPanels = defaultTabs
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


    if (!this._selectedSheet && context.tabPanels.length > 0 && (!this._currentTab || !context.tabPanels.find(t => t.key === this._currentTab))) {
       this._currentTab = context.tabPanels[0].key;
    }

    context.selectedSheet = this._selectedSheet;
    context.selectedSheetTab = this._selectedSheetTab;
    context.quickTags = CampaignCodexLinkers.createQuickTags(context.taggedNPCs);

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
  }

  static async #_npcSheetMode(event){
    this.document.setFlag("core", "sheetClass", "campaign-codex.NPCSheet");
  }


 async _onDragStart(event) {
      const el = event.currentTarget;
    if ('link' in event.target.dataset) return;
    let journalID = event.target.dataset.entryId;
    let journalData = game.journal.get(journalID);
    if (!journalData) return;
    let dragDataB = journalData.toDragData();
    if (!dragDataB) return;
    event.dataTransfer.setData('text/plain', JSON.stringify(dragDataB));
  }

  /** @override */
  _showTab(tabName, html) {
    this._currentTab = tabName;
    html.querySelectorAll(".group-tabs .group-tab").forEach((tab) => tab.classList.remove("active"));
    html.querySelectorAll(".group-tab-panel").forEach((panel) => panel.classList.remove("active"));
    html.querySelector(`.group-tabs .group-tab[data-tab="${tabName}"]`)?.classList.add("active");
    const activePanel = html.querySelector(`.group-tab-panel[data-tab="${tabName}"]`);
    activePanel?.classList.add("active");
    if (activePanel && activePanel.innerHTML.trim() === "") {
        this.render(false);
    }
  }

  // =========================================================================
  // LEFT PANEL (Tree)
  // =========================================================================
  async _generateGroupWidgetsTab(doc, context) {
    const templateData = {
      widgetsToRender: context.widgetsToRender,
      activewidget: context.activewidget,
      inactivewidgets: context.inactivewidgets,
      addedWidgetNames: context.addedWidgetNames,
      availableWidgets: context.availableWidgets,
      isGM: context.isGM,
      isWidgetTrayOpen: this._isWidgetTrayOpen
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/group-widgets.hbs", templateData);
  }

  async _generateLeftPanel(data) {
    const treeContent = await this._generateTreeNodes(data);
    const templateData = {
        treeContent: treeContent,
        toggleClass: "active", 
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/tag-sheet-sidebar.hbs", templateData);
  }

  async _generateTreeNodes(data) {
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const formatNodes = (items, type) => {
        return items
            .filter(i => !hideByPermission || i.canView)
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
            .map(i => ({
                name: i.name,
                uuid: i.uuid,
                type: type,
                displayIcon: i.iconOverride || TemplateComponents.getAsset("icon", type === "associate" ? (i.tag ? "tag" : "npc") : type),
                isSelected: this._selectedSheet?.uuid === i.uuid,
                isClickable: true,
                hasChildren: false,
                id: i.id
            }));
    };

    const treeData = [];

    // Groups
    const groups = formatNodes(data.linkedGroups, "group");
    if (groups.length > 0) treeData.push({ 
        name: localize("names.groups"), 
        type: "category", 
        uuid: "cat-groups", 
        displayIcon: TemplateComponents.getAsset("icon", "group"), 
        hasChildren: true, 
        children: groups, 
        isExpanded: this._expandedNodes.has("cat-groups"), 
        isClickable: false 
    });

    
    // Regions
    const regions = formatNodes(data.regionLinks, "region");
    if (regions.length > 0) treeData.push({ 
        name: localize("names.regions"), 
        type: "category", 
        uuid: "cat-regions", 
        displayIcon: TemplateComponents.getAsset("icon", "region"), 
        hasChildren: true, 
        children: regions, 
        isExpanded: this._expandedNodes.has("cat-regions"), 
        isClickable: false 
    });

    // Locations
    const locations = formatNodes(data.locationLinks, "location");
    if (locations.length > 0) treeData.push({ 
        name: localize("names.locations"), 
        type: "category", 
        uuid: "cat-locations", 
        displayIcon: TemplateComponents.getAsset("icon", "location"), 
        hasChildren: true, 
        children: locations, 
        isExpanded: this._expandedNodes.has("cat-locations"), 
        isClickable: false 
    });

    // Shops
    const shops = formatNodes(data.linkedShops, "shop");
    if (shops.length > 0) treeData.push({ 
        name: localize("names.shops"), 
        type: "category", 
        uuid: "cat-shops", 
        displayIcon: TemplateComponents.getAsset("icon", "shop"), 
        hasChildren: true, 
        children: shops, 
        isExpanded: this._expandedNodes.has("cat-shops"), 
        isClickable: false 
    });

    // Associates
    const associates = formatNodes(data.associates, "associate");
    if (associates.length > 0) treeData.push({ 
        name: localize("names.members"), 
        type: "category", 
        uuid: "cat-associates", 
        displayIcon: TemplateComponents.getAsset("icon", "npc"), 
        hasChildren: true, 
        children: associates, 
        isExpanded: this._expandedNodes.has("cat-associates"), 
        isClickable: false 
    });

    let html = "";
    for (const node of treeData) {
        html += await renderTemplate("modules/campaign-codex/templates/partials/tag-tree-node.hbs", { node: node, isGM: game.user.isGM });
    }
    return html;
  }

  // =========================================================================
  // Main Tab Generators
  // =========================================================================
  async _generateInfoTab(context) {
    const label = this._labelOverride(this.document, "info");
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    let actorSection = "";
    if (context.linkedActor && (!hideByPermission || context.linkedActor.canView)) {
      actorSection = TemplateComponents.actorLinkCard(context.linkedActor);
    } else if (context.isGM) {
      actorSection = TemplateComponents.dropZone("actor", TemplateComponents.getAsset("icon", "npc"), format("dropzone.link", { type: localize("names.actor")}));
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



  // =========================================================================
  // Selected Sheet Logic
  // =========================================================================

  async _generateSelectedSheetTab() {
    if (!this._selectedSheet) return "";
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");

    const selectedDoc = await fromUuid(this._selectedSheet.uuid);
    if (!selectedDoc) {
      this._selectedSheet = null;
      return "<p>Selected sheet not found. Please re-select from the tree.</p>";
    }

    const selectedData = selectedDoc.getFlag("campaign-codex", "data") || {};
    const tabOverrides = selectedDoc.getFlag("campaign-codex", "tab-overrides") || [];
    const imageAreaOverride = tabOverrides.find(o => o.key === 'imageArea');
    const linkedActor = selectedData.linkedActor
      ? await CampaignCodexLinkers.getLinkedActor(selectedData.linkedActor)
      : null;
    const selectedImage = (imageAreaOverride && !imageAreaOverride.visible)
          ? ""
          : selectedDoc.getFlag("campaign-codex", "image") || linkedActor?.img || "";

    const subTabsRaw = this._getSelectedSheetSubTabs(this._selectedSheet.type, selectedData, {}, tabOverrides);
    
    if ( subTabsRaw.length > 0 ) {
      const availableTabs = subTabsRaw.map(t => t.key);
      if ( !availableTabs.includes(this._selectedSheetTab) ) {
        this._selectedSheetTab = subTabsRaw[0].key;
      }
    }
    const subTabs = subTabsRaw.map((tab) => ({
      ...tab,
      active: tab.key === this._selectedSheetTab,
    }));

    const templateData = {
      selectedSheet: this._selectedSheet,
      selectedLabelOverride: selectedData?.sheetTypeLabelOverride || null,
      selectedImage: selectedImage,
      tagsContent: "",
      dropButtonHtml: "",
      sceneButtonHtml: "",
      actorButtonHtml: "",
      subTabs: subTabs,
      selectedTabPanels: await this._generateAllSelectedSheetTabs(selectedDoc, selectedData, subTabs),
    };

    if (this._selectedSheet.type === "npc" && linkedActor && (await CampaignCodexBaseSheet.canUserView(linkedActor.uuid))) {
        templateData.actorButtonHtml = `
              <i class="fas fa-user btn-open-actor selected-sheet-tab sheet-action" data-action="openActor" data-uuid="${linkedActor.uuid}" title="${localize("title.open.actor")}"></i>`;
    }

    if (this._selectedSheet.type === "npc" && linkedActor && canvas.scene && game.user.isGM) {
        templateData.dropButtonHtml = `
              <i class="fas fa-street-view refresh-btn btn-npc-to-scene selected-sheet-tab sheet-action" data-action="dropSelectedActorToMap" data-uuid="${this._selectedSheet.uuid}" title="${localize("message.drop")}"></i>`;
    }

    const sceneExists = await fromUuid(selectedData.linkedScene);
    if (sceneExists && 
        ["location", "region", "shop"].includes(this._selectedSheet.type) &&
        selectedData.linkedScene &&
        (!hideByPermission || (await CampaignCodexBaseSheet.canUserView(selectedData.linkedScene)))
    ) {
        templateData.sceneButtonHtml = `<i class="fas fa-map btn-open-scene selected-sheet-tab sheet-action" data-action="openGroupScene" data-uuid="${selectedDoc.uuid}" title="${format("message.open", { type: localize("names.scene") })}"></i>`;
    }

    return await renderTemplate("modules/campaign-codex/templates/partials/selected-sheet-view.hbs", templateData);
  }

  async _generateAllSelectedSheetTabs(selectedDoc, selectedData, subTabs) {
    const panelPromises = subTabs.map(async (tab) => {
        const content = tab.active 
            ? await this._generateSelectedSheetContent(selectedDoc, selectedData, tab.key)
            : ""; 
        return {
            key: tab.key,
            content: content,
            active: tab.active
        };
    });
    return Promise.all(panelPromises);
  }

  _getSelectedSheetSubTabs(type, data, calculatedCounts = {}, tabOverrides = []) {

    let baseTabs = [
      { key: "info", label:localize("names.information"), icon: "fas fa-info-circle", active: this._selectedSheetTab === "info" },
      { key: "inventory", label:localize("names.inventory"), icon: "fas fa-boxes", active: this._selectedSheetTab === "inventory" },
      { key: "quests", label: localize("names.quests"), icon: "fas fa-scroll", active: this._selectedSheetTab === "quests" },
      { key: "journals", label: localize("names.journals"), icon: "fas fa-book", active: this._selectedSheetTab === "journals" },
      { key: "widgets", label: localize("names.widgets"), icon: "fas fa-puzzle-piece", active: this._selectedSheetTab === "widgets" },
      ...(game.user.isGM ? [{ key: "notes", label: localize("names.note"), icon: "fas fa-sticky-note", active: this._selectedSheetTab === "notes" }] : []),
    ];

    if (type === "associate" || ["npc", "tag"].includes(type)) {
        baseTabs.splice(1, 0, 
            { key: "regions", label: localize("names.regions"), icon: TemplateComponents.getAsset("icon", "region"), active: this._selectedSheetTab === "regions" },
            { key: "locations", label: localize("names.locations"), icon: TemplateComponents.getAsset("icon", "location"), active: this._selectedSheetTab === "locations" },
            { key: "shops", label: localize("names.shops"), icon: TemplateComponents.getAsset("icon", "shop"), active: this._selectedSheetTab === "shops" },
            { key: "associates", label: localize("names.associates"), icon: TemplateComponents.getAsset("icon", "npc"), active: this._selectedSheetTab === "npcs" }
        );
    } else if (type === "shop") {
        baseTabs.splice(1, 0, { key: "npcs", label: localize("names.npcs"), icon: TemplateComponents.getAsset("icon", "npc"), active: this._selectedSheetTab === "npcs" });
    } else if (type === "location") {
        baseTabs.splice(1, 0, 
            { key: "shops", label: localize("names.shops"), icon: TemplateComponents.getAsset("icon", "shop"), active: this._selectedSheetTab === "shops" },
            { key: "npcs", label: localize("names.npcs"), icon: TemplateComponents.getAsset("icon", "npc"), active: this._selectedSheetTab === "npcs" }
        );
    } else if (type === "region") {
        baseTabs.splice(1, 0,
            { key: "parentregions", label: localize("names.parentregions"), icon: "fas fa-book-atlas", active: this._selectedSheetTab === "parentregions" },
            { key: "regions", label: localize("names.regions"), icon: TemplateComponents.getAsset("icon", "region"), active: this._selectedSheetTab === "regions" },
            { key: "locations", label: localize("names.locations"), icon: TemplateComponents.getAsset("icon", "location"), active: this._selectedSheetTab === "locations" },
            { key: "shops", label: localize("names.shops"), icon: TemplateComponents.getAsset("icon", "shop"), active: this._selectedSheetTab === "shops" },
            { key: "npcs", label: localize("names.npcs"), icon: TemplateComponents.getAsset("icon", "npc"), active: this._selectedSheetTab === "npcs" }
        );
    }

    const defaultTabVis = getDefaultSheetTabs(type);
    return baseTabs.map(tab => {
        const override = tabOverrides.find(o => o.key === tab.key);
        const isVisibleByDefault = defaultTabVis[tab.key] ?? true;
        if ((override?.visible ?? isVisibleByDefault) === false) return null;
        return { ...tab, label: override?.label || tab.label };
    }).filter(Boolean);
  }

  async _generateSelectedSheetContent(selectedDoc, selectedData, activeTab) {
    const enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(selectedData.description || "", { async: true, secrets: selectedDoc.isOwner });
    const enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(selectedData.notes || "", { async: true, secrets: selectedDoc.isOwner });

    switch (activeTab) {
      case "info": return this._generateSelectedInfoContent(selectedDoc, selectedData, enrichedDescription);
      case "npcs": return await this._generateSelectedNPCsContent(selectedDoc, selectedData);
      case "associates": return await this._generateSelectedAssociatesContent(selectedDoc, selectedData);
      case "inventory": return await this._generateSelectedInventoryContent(selectedDoc, selectedData);
      case "shops": return await this._generateSelectedShopsContent(selectedDoc, selectedData);
      case "locations": return await this._generateSelectedLocationsContent(selectedDoc, selectedData);
      case "regions": return await this._generateSelectedRegionsContent(selectedDoc, selectedData);
      case "parentregions": return await this._generateSelectedParentRegionsContent(selectedDoc, selectedData);
      case "widgets": 
        selectedData.widgetsToRender = await widgetManager.instantiateActiveWidgets(selectedDoc);
        return await this.generateWidgetsTab(selectedDoc, selectedData, this._labelOverride(selectedDoc, "widgets"));
      case "quests":
        const questContent = await TemplateComponents.questList(selectedDoc, selectedData.quests, game.user.isGM, true);
        return `${TemplateComponents.contentHeader("fas fa-scroll", this._labelOverride(selectedDoc, "quests") || localize("names.quests"))}${questContent || ''}`;
      case "notes":
        return `${TemplateComponents.contentHeader("fas fa-sticky-note", this._labelOverride(selectedDoc, "notes") || localize("names.note"))}<article class="cc-enriched cc-hidden-secrets themed ${isThemed()} ${gameSystemClass(game.system.id)}"><section class="rich-text-content journal-entry-content ${journalSystemClass(game.system.id)}" name="cc.secret.content.notes">${enrichedNotes || ""}</section></article>`;
      case "journals":
        const journals = TemplateComponents.standardJournalGrid(await GroupLinkers.processJournalLinks(selectedData.linkedStandardJournals), true, true);
        return `${TemplateComponents.contentHeader("fas fa-book", this._labelOverride(selectedDoc, "journals") || localize("names.journals"))}${journals}`;
      default: return "<p></p>";
    }
  }

  // =========================================================================
  // Selected Sheet Content Helpers
  // =========================================================================

  async _generateSelectedInfoContent(selectedDoc, selectedData, enrichedDescription) {
    const infoWidgets = await widgetManager.instantiateActiveWidgets(selectedDoc, "info");
    const labelOverride = this._labelOverride(selectedDoc, "info") || localize("names.information");
    return `${TemplateComponents.contentHeader("fas fa-info-circle", labelOverride)}<article class="cc-enriched cc-hidden-secrets themed ${isThemed()} ${gameSystemClass(game.system.id)}"><section class="rich-text-content journal-entry-content" name="cc.secret.content.notes">${enrichedDescription || ""}</section></article>${infoWidgets ? `<div class="info-widgets">${infoWidgets}</div>` : ""}`;
  }

  // async _generateSelectedInventoryContent(selectedDoc, selectedData) { 



  //     return await renderTemplate("modules/campaign-codex/templates/partials/selected-tab-inventory.hbs", { 
  //         inventory: await CampaignCodexLinkers.getInventory(selectedDoc, selectedData.inventory || []), 
  //         isGM: game.user.isGM, 
  //         labelOverride: this._labelOverride(selectedDoc, "inventory"), 
  //         selectedSheetUuid: this._selectedSheet.uuid 
  //     }); 
  // }

  async _generateSelectedInventoryContent(selectedDoc, selectedData) { 
    const labelOverride = this._labelOverride(selectedDoc, "inventory");
    const hideByPermission = game.settings.get("campaign-codex", "hideInventoryByPermission");
    const currency = CampaignCodexLinkers.getCurrency();
    const rawInventory = await CampaignCodexLinkers.getInventory(selectedDoc, selectedData.inventory || []) || [];
    const allowPlayerPurchasing = game.settings.get("campaign-codex","allowPlayerPurchasing")||false;

    const groups = rawInventory.reduce((acc, item) => {
      const rawType = item.type ? String(item.type) : "General";
      const typeLabel = rawType.charAt(0).toUpperCase() + rawType.slice(1);
      if (!acc[typeLabel]) acc[typeLabel] = [];
      acc[typeLabel].push(item);
      return acc;
    }, {});

    const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    const sections = sortedKeys.map(key => {
      return {
        label: key,
        items: groups[key].sort((a, b) => a.name.localeCompare(b.name))
      };
    });

    const showHeaders = sections.length > 1;

      return await renderTemplate("modules/campaign-codex/templates/partials/selected-tab-inventory.hbs", { 

          labelOverride:labelOverride,
          allowPlayerPurchasing:allowPlayerPurchasing,
          currency:currency,
          hideByPermission: hideByPermission,
          isLoot:selectedData.isLoot,
          markup:selectedData.markup,
          inventory: rawInventory,
          isGM: game.user.isGM,
          inventorySections: sections, 
          showHeaders: showHeaders,
          selectedSheetUuid: this._selectedSheet.uuid

      }); 
  }




  async _generateSelectedShopsContent(selectedDoc, selectedData) {
    const shops = await CampaignCodexLinkers.getLinkedShops(selectedDoc, selectedData.linkedShops || []);
    const label = this._labelOverride(selectedDoc, "shops") || localize("names.shops");
    if (shops.length === 0) return `${TemplateComponents.contentHeader("fas fa-house", label)}`;
    return `${TemplateComponents.contentHeader("fas fa-house", label)}<div class="shops-list">${TemplateComponents.entityGrid(shops, "shop", false, true)}</div>`;
  }

  async _generateSelectedLocationsContent(selectedDoc, selectedData) {
    const locs = await CampaignCodexLinkers.getLinkedLocations(selectedDoc, selectedData.linkedLocations || []);
    const locations = (["npc", "tag"].includes(selectedDoc.getFlag("campaign-codex", "type"))) ? locs.filter(i => i.type === "location") : locs;
    const label = this._labelOverride(selectedDoc, "locations") || localize("names.locations");
    if (locations.length === 0) return `${TemplateComponents.contentHeader("fas fa-map-marker-alt", label)}`;
    return `${TemplateComponents.contentHeader("fas fa-map-marker-alt", label)}<div class="locations-list">${TemplateComponents.entityGrid(locations, "location", false, true)}</div>`;
  }

  async _generateSelectedRegionsContent(selectedDoc, selectedData) {
    const regs = await CampaignCodexLinkers.getLinkedRegions(selectedDoc, selectedData.linkedRegions || []);
    const regions = (["npc", "tag"].includes(selectedDoc.getFlag("campaign-codex", "type"))) ? (await CampaignCodexLinkers.getLinkedLocations(selectedDoc, selectedData.linkedLocations || [])).filter(i => i.type === "region") : regs;
    const label = this._labelOverride(selectedDoc, "regions") || localize("names.regions");
    if (regions.length === 0) return `${TemplateComponents.contentHeader(TemplateComponents.getAsset("icon", "region"), label)}`;
    return `${TemplateComponents.contentHeader(TemplateComponents.getAsset("icon", "region"), label)}<div class="locations-list">${TemplateComponents.entityGrid(regions, "location", false, true)}</div>`;
  }

  async _generateSelectedParentRegionsContent(selectedDoc, selectedData) {
    const regions = await CampaignCodexLinkers.getLinkedRegions(selectedDoc, selectedData.parentRegions || []);
    const label = this._labelOverride(selectedDoc, "parentregions") || localize("names.parentregions");
    if (regions.length === 0) return `${TemplateComponents.contentHeader("fas fa-book-atlas", label)}`;
    return `${TemplateComponents.contentHeader("fas fa-book-atlas", label)}<div class="locations-list">${TemplateComponents.entityGrid(regions, "location", false, true)}</div>`;
  }

  async _generateSelectedAssociatesContent(selectedDoc, selectedData) {
    const labelOverride = this._labelOverride(selectedDoc, "associates");
    const allAssociates = await CampaignCodexLinkers.getAssociates(selectedDoc, selectedData.associates || []);
    const untaggedNPCs = allAssociates.filter(npc => !npc.tag);
    const templateData = {
        labelOverride: labelOverride,
        hasContent: untaggedNPCs.length > 0,
        dropToMapBtn: (canvas.scene && game.user.isGM) 
            ? `<div class="selected-actions"><i class="fas fa-street-view refresh-btn npcs-to-map-button" data-action="selectSheetDrop" title="${format("button.droptoscene", { type: localize("names.npc") })}" data-uuid="${this._selectedSheet.uuid}"></i></div>` 
            : "",
        npcGridHtml: TemplateComponents.entityGrid(untaggedNPCs, "associate", true, true)
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/selected-tab-associates.hbs", templateData);
  }

  async _generateSelectedNPCsContent(selectedDoc, selectedData) {
    // Basic implementation reuse or simplification based on GroupSheet pattern
    const labelOverride = this._labelOverride(selectedDoc, "npcs");
    const isLocationOrRegion = this._selectedSheet.type === "location" || this._selectedSheet.type === "region";
    const [directNPCs, shopNPCs, linkedNPCs] = await Promise.all([
        CampaignCodexLinkers.getDirectNPCs(selectedDoc, selectedData.linkedNPCs || []),
        CampaignCodexLinkers.getShopNPCs(selectedDoc, selectedData.linkedShops || []),
        CampaignCodexLinkers.getLinkedNPCs(selectedDoc, selectedData.linkedNPCs || [])
    ]);
    const allNPCs = isLocationOrRegion ? [...directNPCs, ...shopNPCs] : linkedNPCs;
    const untaggedNPCs = allNPCs.filter(npc => !npc.tag);
    const templateData = {
        labelOverride: labelOverride,
        isGM: game.user.isGM,
        hasContent: untaggedNPCs.length > 0,
        dropToMapBtn: (canvas.scene && game.user.isGM) ? `<i class="fas fa-street-view refresh-btn npcs-to-map-button" data-action="selectSheetDrop" title="${format("button.droptoscene", { type: localize("names.npc") })}" data-uuid="${this._selectedSheet.uuid}"></i>` : "",
        untaggedDirectNPCs: isLocationOrRegion ? untaggedNPCs.filter(npc => npc.source !== "shop") : untaggedNPCs,
        untaggedShopNPCs: isLocationOrRegion ? untaggedNPCs.filter(npc => npc.source === "shop") : [],
    };
    templateData.directNpcGrid = TemplateComponents.entityGrid(templateData.untaggedDirectNPCs, "associate", true, true);
    templateData.shopNpcGrid = TemplateComponents.entityGrid(templateData.untaggedShopNPCs, "associate", true, true);
    templateData.shopIcon = TemplateComponents.getAsset("icon", "shop");

    return await renderTemplate("modules/campaign-codex/templates/partials/selected-tab-npcs.hbs", templateData);
  }

  // =========================================================================
  // Event Handlers
  // =========================================================================

  static #_onToggleTreeNode(event) {
    event.preventDefault(); event.stopPropagation();
    const expandIcon = event.target;
    const treeNode = expandIcon.closest(".tree-node");
    const children = treeNode.querySelector(".tree-children");
    const uuid = treeNode.dataset.sheetUuid;
    if (children) {
      const isExpanding = children.style.display === "none" || children.style.display === "";
      if (isExpanding) {
        children.style.display = "block";
        expandIcon.classList.remove("fa-chevron-right");
        expandIcon.classList.add("fa-chevron-down");
        this._expandedNodes.add(uuid);
      } else {
        children.style.display = "none";
        expandIcon.classList.remove("fa-chevron-down");
        expandIcon.classList.add("fa-chevron-right");
        this._expandedNodes.delete(uuid);
      }
    }
  }

  static #_onExpandAll(event) {
    event.preventDefault();
    this.element.querySelectorAll(".tree-children").forEach(c => c.style.display = "block");
    this.element.querySelectorAll(".expand-toggle").forEach(i => {
        i.classList.remove("fa-chevron-right");
        i.classList.add("fa-chevron-down");
    });
    this.element.querySelectorAll(".tree-node").forEach(n => this._expandedNodes.add(n.dataset.sheetUuid));
  }

  static #_onCollapseAll(event) {
    event.preventDefault();
    this.element.querySelectorAll(".tree-children").forEach(c => c.style.display = "none");
    this.element.querySelectorAll(".expand-toggle").forEach(i => {
        i.classList.remove("fa-chevron-down");
        i.classList.add("fa-chevron-right");
    });
    this._expandedNodes.clear();
  }

  static #_selectSheet(event) {
    event.preventDefault(); event.stopPropagation();
    const target = event.target.closest('.tree-label');
    const { sheetUuid, type, name } = target?.dataset || {};
    if (sheetUuid && type) {
      this._selectedSheet = { uuid: sheetUuid, type, name };
      this._selectedSheetTab = "info";
      this.render(false);
    }
  }

  static #_SelectedSheetTabChange(event) {
    event.preventDefault();
    const tabName = event.target.dataset.tab;
    this._selectedSheetTab = tabName;
    const appElement = this.element.querySelector(".selected-sheet-container");
    const targetPanel = appElement.querySelector(`.group-tab-panel-selected-sheet[data-tab="${tabName}"]`);
    
    if (targetPanel && targetPanel.innerHTML.trim() === "") {
        this.render(false);
    } else {
        this._showSelectedSheetTab(tabName, appElement);
    }
  }

  _showSelectedSheetTab(tabName, html) {
    html.querySelectorAll(".selected-sheet-tab").forEach(tab => tab.classList.remove("active"));
    html.querySelectorAll(".group-tab-panel-selected-sheet").forEach(panel => panel.classList.remove("active"));
    html.querySelector(`.selected-sheet-tab[data-tab="${tabName}"]`)?.classList.add("active");
    html.querySelector(`.group-tab-panel-selected-sheet[data-tab="${tabName}"]`)?.classList.add("active");
  }

  static async #_onDropSingleNPCToMapClick(event) {
    event.preventDefault();
    const sheetUuid = event.target.dataset.uuid;
    const doc = await fromUuid(sheetUuid);
    if (!doc) return;
    const linkedActor = await fromUuid(doc.getFlag("campaign-codex", "data")?.linkedActor);
    if (linkedActor) await this._onDropNPCsToMap([{ id: doc.id, uuid: doc.uuid, actor: linkedActor, name: doc.name, img: doc.getFlag("campaign-codex", "image") || linkedActor.img }], { title: `Drop ${doc.name}`, showHiddenToggle: true });
  }

  static async #_onOpenScene(event) {
    event.preventDefault();
    const doc = await fromUuid(event.target.dataset.uuid);
    if (doc) await game.campaignCodex.openLinkedScene(doc);
  }

  static async #_onDropSelectedSheetNPCsToMapClick(event) {
    event.preventDefault();
    const selectedDoc = await fromUuid(event.target.dataset.uuid);
    if (!selectedDoc) return;
    const data = selectedDoc.getFlag("campaign-codex", "data") || {};
    const type = selectedDoc.getFlag("campaign-codex", "type");
    let npcs = [];
    if (type === "npc") npcs = (await CampaignCodexLinkers.getAssociates(selectedDoc, data.associates || [])).filter(n => !n.tag && n.actor);
    else if (["location", "region"].includes(type)) npcs = (await CampaignCodexLinkers.getDirectNPCs(selectedDoc, data.linkedNPCs || [])).filter(n => !n.tag && n.actor);
    else if (type === "shop") npcs = (await CampaignCodexLinkers.getLinkedNPCs(selectedDoc, data.linkedNPCs || [])).filter(n => !n.tag && n.actor);
    
    if (npcs.length > 0) await this._onDropNPCsToMap(npcs, { title: `Drop ${selectedDoc.name} NPCs` });
    else ui.notifications.warn(localize("warn.invaliddrop"));
  }


// FROM NPC

  async _handleDrop(data, event) {
    event.preventDefault();
    event.stopPropagation();
    if (data.type === "Scene") {
      return;
    } else if (data.type === "Item") {
      await this._handleItemDrop(data, event);
    } else if (data.type === "JournalEntry" || data.type === "JournalEntryPage") {
      await this._handleJournalDrop(data, event);
    } else if (data.type === "Actor") {
      return;
    }
  }
  
  async _handleJournalDrop(data, event) {
    const journal = await fromUuid(data.uuid);
    if (!journal || journal.id === this.document.id) return;
    const journalType = journal.getFlag("campaign-codex", "type");
    const dropOnInfoTab = event.target.closest('.tab-panel[data-tab="info"]');

    // console.log(journalType);

    if (((!journalType && data.type === "JournalEntry") || data.type === "JournalEntryPage")) {
        const locationData = this.document.getFlag("campaign-codex", "data") || {};
        locationData.linkedStandardJournals = locationData.linkedStandardJournals || [];

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
    } else if (journalType === "group") {
      await game.campaignCodex.linkGroupToTag(journal, this.document);
       } else {
      return; 
    }
    this.render(true);
  }



}