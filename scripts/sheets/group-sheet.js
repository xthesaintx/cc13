import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { TemplateComponents } from "./template-components.js";
import { GroupLinkers } from "./group-linkers.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { promptForName, localize, format, renderTemplate, getDefaultSheetTabs, gameSystemClass } from "../helper.js";
import { widgetManager } from "../widgets/WidgetManager.js";


export class GroupSheet extends CampaignCodexBaseSheet {
  // =========================================================================
  // Foundry VTT Overrides
  // =========================================================================
  static DEFAULT_OPTIONS = {
    classes: ["campaign-codex", "sheet", "journal-sheet", "group-sheet"],
    window: {
      title: 'Campaign Codex Group Sheet',
      icon: 'fas fa-sitemap',
    },
    position: {
      width: 1024,
      height: 768,
    },
    actions: {
      selectSheet:this.#_selectSheet,
      filterButton:this.#_filterButton,
      SelectedSheetTabChange:this.#_SelectedSheetTabChange,
      dropSelectedActorToMap:this.#_onDropSingleNPCToMapClick,
      openGroupScene:this.#_onOpenScene,
      expantToggle: this.#_onToggleTreeNode,
      removeMember: this.#_onRemoveMember,
      toggleTreeNpcs: this.#_onToggleTreeNPC,
      expandAll: this.#_onExpandAll,
      collapseAll: this.#_onCollapseAll,
      toggleTreeItems: this.#_onToggleTreeItems,
      toggleTreeNpcTags: this.#_onToggleTreeNPCTags,
      toggleTreeGroups:this.#_onToggleTreeGroups,
      toggleTreeRegions:this.#_onToggleTreeRegions,
      toggleTreeLocations:this.#_onToggleTreeLocations,
      toggleTreeShops:this.#_onToggleTreeShops,
      toggleTreeTags: this.#_onToggleTreeTags,
      selectSheetDrop: this.#_onDropSelectedSheetNPCsToMapClick,
  }
};

  static PARTS = {
    main: {
      template: "modules/campaign-codex/templates/group-sheet.html",
      scrollable: [
        "", ".scrollable", 
        ".tree-content",
        ".group-tab-panel-selected-sheet.info", 
        ".group-tab-panel-selected-sheet.regions", 
        ".group-tab-panel-selected-sheet.locations", 
        ".group-tab-panel-selected-sheet.shops", 
        ".group-tab-panel-selected-sheet.associates", 
        ".group-tab-panel-selected-sheet.npcs", 
        ".group-tab-panel-selected-sheet.tags", 
        ".group-tab-panel-selected-sheet.quests", 
        ".group-tab-panel-selected-sheet.journals", 
        ".group-tab-panel-selected-sheet.notes", 
        ".group-tab-panel-selected-sheet.widgets", 
        ".group-tab-panel-selected-sheet.notes", 
        ".group-tab-panel.info", 
        ".group-tab-panel.regions", 
        ".group-tab-panel.locations", 
        ".group-tab-panel.inventory", 
        ".group-tab-panel.npcs", 
        ".group-tab-panel.quests", 
        ".group-tab-panel.completed-quests", 
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
    this._showTreeItems = false;
    this._showTreeNPCTags = false;
    this._showTreeNPCs = true;
    this._showTreeGroups = true;
    this._showTreeRegions = true;
    this._showTreeLocations = true;
    this._showTreeShops = true;
    this._showTreeTags = false;
    this._processedData = null;
    this._currentTab ="info";
  }

  async _processGroupData() {
    const groupData = this.document.getFlag("campaign-codex", "data") || {};
    const groupMembers = await GroupLinkers.getGroupMembers(groupData.members || []);
    const nestedData = await GroupLinkers.getNestedData(groupMembers);
    const treeTagNodes = await GroupLinkers.buildTagTree(nestedData);
    const missingTaggedNpcs = await GroupLinkers.formatMissingTags(treeTagNodes, nestedData.allNPCs);
    return { groupMembers, nestedData, treeTagNodes, missingTaggedNpcs };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
      new foundry.applications.ux.DragDrop.implementation({
        dragSelector: ".tree-label",
        permissions: {
          dragstart: game.user.isGM,
        },
        callbacks: {
          dragstart: this._onDragStart.bind(this),
        }
      }).bind(this.element);
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
        key: "completed-quests", 
        label: localize("names.completedquests"), 
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
      this._processedData = await this._processGroupData();
    }
    context.isGM = game.user.isGM;

    const { groupMembers, nestedData, treeTagNodes, missingTaggedNpcs } = this._processedData;
    context.groupMembers = groupMembers;
    context.nestedData = nestedData;
    context.treeTagNodes = treeTagNodes;
    context.missingTaggedNpcs = missingTaggedNpcs;
    context.sheetType = "group";
      if (context.sheetTypeLabelOverride !== undefined && data.sheetTypeLabelOverride !== "") {
            context.sheetTypeLabel = context.sheetTypeLabelOverride;
        } else{
            context.sheetTypeLabel = localize("names.group");
          }
    context.customImage = this.document.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "group");
    context.leftPanel = await this._generateLeftPanel(context.groupMembers, context.nestedData, context.treeTagNodes);
    
    // WIDGETS CONFIGURATION
    const sheetWidgets = this.document.getFlag("campaign-codex", "sheet-widgets") || []; 
    context.activewidget = sheetWidgets.filter(w => w.active);
    context.inactivewidgets = sheetWidgets.filter(w => !w.active);
    const allAvailable = Array.from(widgetManager.widgetRegistry.keys());
    context.addedWidgetNames = sheetWidgets.map(w => w.widgetName);
    context.availableWidgets = allAvailable.map(name => ({ name: name }));
    context.widgetsToRender = await widgetManager.instantiateActiveWidgets(this.document);

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
        active: !this._selectedSheet && this._currentTab === "info",
        content:  await this._generateInfoTab(context),
        label: localize("names.info"),
        icon: "fas fa-info-circle",
      },
      {
        key: "regions",
        active: !this._selectedSheet && this._currentTab === "regions",
        content: await this._generateRegionsTab(context),
        label: localize("names.regions"),
        icon: TemplateComponents.getAsset("icon", "region"),
      },
      {
        key: "locations",
        active: !this._selectedSheet && this._currentTab === "locations",
        content: await this._generateLocationsTab(context),
        label: localize("names.locations"),
        icon: TemplateComponents.getAsset("icon", "location"),
      },
      {
        key: "inventory",
        active: !this._selectedSheet && this._currentTab === "inventory",
        content: await this._generateInventoryTab(context),
        icon: "fas fa-boxes",
        label: localize("names.inventory"),
      },
      {
        key: "npcs",
        active: !this._selectedSheet && this._currentTab === "npcs",
        content: await this._generateNPCsTab(context),
        label: localize("names.npcs"),
        icon: TemplateComponents.getAsset("icon", "npc"),
      },
      { 
        key: "quests", 
        active: !this._selectedSheet && this._currentTab === "quests", 
        content: await this._generateQuestsTab(context) ,  
        label: localize("names.quests"), 
        icon: "fas fa-scroll", 
      }, 
      { 
        key: "completed-quests", 
        active: !this._selectedSheet && this._currentTab === "completed-quests", 
        content: await this._generateCompletedQuestsTab(context) ,  
        label: localize("names.completedquests"), 
        icon: "fas fa-check-circle", 
      }, 
      { 
        key: "journals", 
        active: !this._selectedSheet && this._currentTab === "journals", 
        content: await this._generateJournalsTab(context), 
        label: localize("names.journals"), 
        icon: "fas fa-book", 
      },
      { 
        key: "widgets", 
        active: !this._selectedSheet && this._currentTab === "widgets",
        content: await this._generateGroupWidgetsTab(this.document, context),
        label: localize("names.widgets"), 
        icon: "fas fa-puzzle-piece", 
      },
      {
        key: "notes",
        active: !this._selectedSheet && this._currentTab === "notes",
        content: await CampaignCodexBaseSheet.generateNotesTab(this.document, context),
        label: localize("names.note") || "Notes",
        icon: "fas fa-sticky-note", 
      },
    ];

    const defaultTabVis = getDefaultSheetTabs(this.getSheetType());
 
    if (this._selectedSheet) {
      context.isShowingSelectedView = true;
      context.selectedSheetContent = await this._generateSelectedSheetTab();
      this._currentTab =null;
      // context.tabPanels = [];
    } else 
    {
      context.isShowingSelectedView = false;
    }
      context.tabPanels = defaultTabs
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

    // END OF TABS
    context.selectedSheet = this._selectedSheet;
    context.selectedSheetTab = this._selectedSheetTab;

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
  }


  // =========================================================================
  // Base Sheet Overrides
  // =========================================================================

  /** @override */
  _showTab(tabName, html) {
    html.querySelectorAll(".group-tabs .group-tab").forEach((tab) => tab.classList.remove("active"));
    html.querySelectorAll(".group-tab-panel").forEach((panel) => panel.classList.remove("active"));
    html.querySelector(`.group-tabs .group-tab[data-tab="${tabName}"]`)?.classList.add("active");
    html.querySelector(`.group-tab-panel[data-tab="${tabName}"]`)?.classList.add("active");
  }


  // =========================================================================
  // Actions
  // =========================================================================
  

  static #_onExpandAll(event) {
    event.preventDefault();
    const nativeElement = this.element;
    
    nativeElement.querySelectorAll(".tree-node").forEach((treeNode) => {
      const children = treeNode.querySelector(".tree-children");
      const uuid = treeNode.dataset.sheetUuid;

      if (children) {
        const expandIcon = treeNode.querySelector(".expand-toggle"); 
        
        children.style.display = "block";
        if (expandIcon) {
          expandIcon.classList.remove("fa-chevron-right");
          expandIcon.classList.add("fa-chevron-down");
        }
        if (uuid) {
          this._expandedNodes.add(uuid);
        }
      }
    });
  }
  static #_onCollapseAll(event) {
    event.preventDefault();
    const nativeElement = this.element;
    
    nativeElement.querySelectorAll(".tree-node").forEach((treeNode) => {
      const children = treeNode.querySelector(".tree-children");

      if (children) {
        const expandIcon = treeNode.querySelector(".expand-toggle"); 

        children.style.display = "none";
        if (expandIcon) {
          expandIcon.classList.remove("fa-chevron-down");
          expandIcon.classList.add("fa-chevron-right");
        }
      }
    });
    
    this._expandedNodes.clear(); // Clear the state after visually collapsing all
  }

  static #_onToggleTreeGroups(event) {
    event.preventDefault();
    this._showTreeGroups = !this._showTreeGroups;
    this.render();
  }

  static #_onToggleTreeRegions(event) {
    event.preventDefault();
    this._showTreeRegions = !this._showTreeRegions;
    this.render();
  }
  
  static #_onToggleTreeLocations(event) {
    event.preventDefault();
    this._showTreeLocations = !this._showTreeLocations;
    this.render();
  }
  
  static #_onToggleTreeShops(event) {
    event.preventDefault();
    this._showTreeShops = !this._showTreeShops;
    this.render();
  }

  static #_onToggleTreeNPC(event) {
    event.preventDefault();
    this._showTreeNPCs = !this._showTreeNPCs;
    this.render();
  }

    static #_onToggleTreeNPCTags(event) {
    event.preventDefault();
    this._showTreeNPCTags = !this._showTreeNPCTags;
    this.render();
  }

    static #_onToggleTreeTags(event) {
    event.preventDefault();
    this._showTreeTags = !this._showTreeTags;
    this.render();
  }

    static #_onToggleTreeItems(event) {
    event.preventDefault();
    this._showTreeItems = !this._showTreeItems;
    this.render();
  }



  static #_selectSheet(event) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target.closest('.tree-label');
    const treeNode = target?.dataset;
    if (treeNode){
      const uuid = treeNode.sheetUuid;
      const type = treeNode.type;
      const name = treeNode.name;
      this._selectedSheet = { uuid, type, name };
      this._selectedSheetTab = "info";
      this.render(false);
    }
  }

  static #_filterButton(event) {
    const clickedButton = event.target;
    const filter = clickedButton?.dataset.filter;
    const cards = this.element.querySelectorAll(".npc-grid-container .entity-card");
    const siblingButtons = clickedButton.parentElement.children;
    for (const btn of siblingButtons) {
      btn.classList.remove("active");
    }
    clickedButton.classList.add("active");
    cards.forEach((card) => {
      const cardFilter = card.dataset.filter;
      if (filter === "all" || (cardFilter && cardFilter.includes(filter))) {
        card.style.display = "flex";
      } else {
        card.style.display = "none";
      }
    });
  }

  _showSelectedSheetTab(tabName, html) {
    html.querySelectorAll(".selected-sheet-tab").forEach((tab) => tab.classList.remove("active"));
    html.querySelectorAll(".group-tab-panel-selected-sheet").forEach((panel) => panel.classList.remove("active"));
    html.querySelector(`.selected-sheet-tab[data-tab="${tabName}"]`)?.classList.add("active");
    html.querySelector(`.group-tab-panel-selected-sheet[data-tab="${tabName}"]`)?.classList.add("active");
  }

  static #_SelectedSheetTabChange(event) {
      event.preventDefault();
      const tabName = event.target.dataset.tab;
      this._selectedSheetTab = tabName;
      const appElement = this.element.querySelector(".selected-sheet-container");
      this._showSelectedSheetTab(tabName, appElement);
  }


  static async #_onDropSingleNPCToMapClick(event) {
    event.preventDefault();
    const sheetUuid = event.target.dataset.uuid;
    try {
      const selectedDoc = await fromUuid(sheetUuid);
      if (!selectedDoc) {
        ui.notifications.warn("Selected sheet not found");
        return;
      }
      const npcData = selectedDoc.getFlag("campaign-codex", "data") || {};
      if (!npcData.linkedActor) return ui.notifications.warn("This NPC has no linked actor to drop!");
      const linkedActor = await fromUuid(npcData.linkedActor);
      if (!linkedActor) return ui.notifications.warn(localize("warn.actornotfound"));
      const npcForDrop = {
        id: selectedDoc.id,
        uuid: selectedDoc.uuid,
        name: selectedDoc.name,
        img: selectedDoc.getFlag("campaign-codex", "image") || linkedActor.img,
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


  static async #_onDropSelectedSheetNPCsToMapClick(event) {
    event.preventDefault();
    const sheetUuid = event.target.dataset.uuid;
    try {
      const selectedDoc = await fromUuid(sheetUuid);
        if (!selectedDoc) 
        {
          ui.notifications.warn("Selected sheet not found");
          return;
        }
      const docData = selectedDoc.getFlag("campaign-codex", "data") || {};
      const docType = selectedDoc.getFlag("campaign-codex", "type") || {};
        if (docType === "location" || docType === "region")
        {
          const rawDirectNPCs = await CampaignCodexLinkers.getDirectNPCs(selectedDoc, docData.linkedNPCs || []);
          const directNPCs = rawDirectNPCs.filter((npc) => npc.tag !== true);
          if (directNPCs && directNPCs.length > 0) {
             await this._onDropNPCsToMap(directNPCs, {title: `Drop ${selectedDoc.name} NPCs to Map`,});
          }
        } else if (docType === "shop") {
          const rawLinkedNPCs = await CampaignCodexLinkers.getLinkedNPCs(this.document, docData.linkedNPCs || []);
          const linkedNPCs = rawLinkedNPCs.filter((npc) => npc.tag !== true);
          if (linkedNPCs && linkedNPCs.length > 0) {
            await this._onDropNPCsToMap(linkedNPCs, {title: `Drop ${selectedDoc.name} NPCs to Map`,});
          }
        } else if (docType === "npc") {
          
          const associates = await CampaignCodexLinkers.getAssociates(docData, docData.associates || []);
          const taggedNPCs = associates.filter((npc) => npc.tag === true);
          const associatesWithoutTaggedNPCs = associates.filter((npc) => npc.tag !== true);

          if (associatesWithoutTaggedNPCs.length > 0) {
            await this._onDropNPCsToMap(associatesWithoutTaggedNPCs, {
              title: format("message.droptomap", { type: this.document.name }),
            });
          }
        } else {
          console.log("No Sheet Selected");
        }
      }
      catch (error)
      {

      }
}


  static async #_onOpenScene(event) {
    event.preventDefault();
    const button = event.target;
    const docUuid = button.dataset.uuid;
    if (!docUuid) return;
    const doc = await fromUuid(docUuid);
    if (!doc) {
      ui.notifications.error("Could not find the source document.");
      return;
    }
    await game.campaignCodex.openLinkedScene(doc);
  }

  static #_onToggleTreeNode(event) {
    event.preventDefault();
    event.stopPropagation();

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

  static async #_onRemoveMember(event) {
    const memberUuid = event.target.dataset.uuid;
    // await this._saveFormData();
    if(!memberUuid) return;
    const groupData = this.document.getFlag("campaign-codex", "data") || {};
    groupData.members = (groupData.members || []).filter((uuid) => uuid !== memberUuid);
    await this.document.setFlag("campaign-codex", "data", groupData);
    this._processedData = null;
    this.render();
    ui.notifications.info("Removed member from group");
  }



  // =========================================================================
  // Selected Sheet Generation
  // =========================================================================

  async _generateTagsContent(data) {
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");

    const allPossibleNpcs = [...(data.associates || []), ...(data.linkedNPCs || [])];
    const uniqueUuids = [...new Set(allPossibleNpcs)];
    const linkedTags = await CampaignCodexLinkers.getTaggedNPCs(uniqueUuids);

    const visibleTags = linkedTags.filter((tag) => !hideByPermission || tag.canView);

    if (visibleTags.length === 0) {
      return "";
    }

    return `
      <div class="entity-locations tag-mode-tags">
        <i class="fas fa-tag"></i>
        ${visibleTags.map((tag) => `<span class="location-tag tag-mode">${tag.name}</span>`).join("")}
      </div>
    `;
  }

async _generateAllSelectedSheetTabs(selectedDoc, selectedData, subTabs) {
    const panelPromises = subTabs.map(async (tab) => {
        const content = await this._generateSelectedSheetContent(selectedDoc, selectedData, tab.key);
        return {
            key: tab.key,
            content: content,
            active: tab.active
        };
    });
    return Promise.all(panelPromises);
}

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

  // --- Prepare the data for the template ---
  const templateData = {
    selectedSheet: this._selectedSheet,
    selectedLabelOverride: selectedData?.sheetTypeLabelOverride || null,
    selectedImage: selectedImage,
    tagsContent: await this._generateTagsContent(selectedData),
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
    (this._selectedSheet.type === "location" ||
      this._selectedSheet.type === "region" ||
      this._selectedSheet.type === "shop") &&
    selectedData.linkedScene &&
    (!hideByPermission || (await CampaignCodexBaseSheet.canUserView(selectedData.linkedScene)))
  ) {
    templateData.sceneButtonHtml = `<i class="fas fa-map btn-open-scene selected-sheet-tab sheet-action" data-action="openGroupScene" data-uuid="${selectedDoc.uuid}" title="${format("message.open", { type: localize("names.scene") })}"></i>`;
  }

  return await renderTemplate("modules/campaign-codex/templates/partials/selected-sheet-view.hbs", templateData);
}

  _getSelectedSheetSubTabs(type, data, calculatedCounts = {}, tabOverrides = []) { // <-- Add tabOverrides argument
    const baseTabs = [
      { key: "info", label:localize("names.information"), icon: "fas fa-info-circle", active: this._selectedSheetTab === "info" },
      { key: "inventory", label:localize("names.inventory"), icon: "fas fa-boxes", active: this._selectedSheetTab === "inventory"  },
      { key: "quests", label: localize("names.quests"), icon: "fas fa-scroll", active: this._selectedSheetTab === "quests"  },
      { key: "journals", label: localize("names.journals"), icon: "fas fa-book", active: this._selectedSheetTab === "journals"  },
      { key: "widgets", label: localize("names.widgets"), icon: "fas fa-puzzle-piece", active: this._selectedSheetTab === "widgets"  },
      ...(game.user.isGM ? [{ key: "notes", label: localize("names.note"), icon: "fas fa-sticky-note", active: this._selectedSheetTab === "notes"  }] : []),
      { key: "tags", label:localize("names.tags"), icon: "fas fa-tag", active: this._selectedSheetTab === "tags"  },
    ];

    switch (type) {
      case "npc":
        baseTabs.splice(
          1,
          0,
          {
            key: "regions",
            label: localize("names.regions"),
            icon: TemplateComponents.getAsset("icon", "region"),
            active: this._selectedSheetTab === "regions",
          },
          {
            key: "locations",
            label: localize("names.locations"),
            icon: TemplateComponents.getAsset("icon", "location"),
            active: this._selectedSheetTab === "locations",
          },
          {
            key: "shops",
            label:localize("names.shops"),
            icon: TemplateComponents.getAsset("icon", "shop"),
            active: this._selectedSheetTab === "shops",
          },
          {
            key: "associates",
            label: localize("names.associates"),
            icon: TemplateComponents.getAsset("icon", "npc"),
            active: this._selectedSheetTab === "npcs",
          },
        );
        break;

      case "shop":
        baseTabs.splice(
          1,
          0,
          {
            key: "npcs",
            label: localize("names.npcs"),
            icon: TemplateComponents.getAsset("icon", "npc"),
            active: this._selectedSheetTab === "npcs",
          },
        );
        break;

      case "location":
        baseTabs.splice(
          1,
          0,
          {
            key: "shops",
            label:localize("names.shops"),
            icon: TemplateComponents.getAsset("icon", "shop"),
            active: this._selectedSheetTab === "shops",
          },
          {
            key: "npcs",
            label: localize("names.npcs"),
            icon: TemplateComponents.getAsset("icon", "npc"),
            active: this._selectedSheetTab === "npcs",
          },
        );
        break;

      case "region":
        baseTabs.splice(
          1,
          0,
          {
            key: "regions",
            label: localize("names.regions"),
            icon: TemplateComponents.getAsset("icon", "region"),
            active: this._selectedSheetTab === "regions",
          },
          {
            key: "locations",
            label: localize("names.locations"),
            icon: TemplateComponents.getAsset("icon", "location"),
            active: this._selectedSheetTab === "locations",
          },
          {
            key: "shops",
            label:localize("names.shops"),
            icon: TemplateComponents.getAsset("icon", "shop"),
            active: this._selectedSheetTab === "shops",
          },
          {
            key: "npcs",
            label: localize("names.npcs"),
            icon: TemplateComponents.getAsset("icon", "npc"),
            active: this._selectedSheetTab === "npcs",
          },
        );
        break;
    }

    const defaultTabVis = getDefaultSheetTabs(type); 

    const processedTabs = baseTabs
      .map(tab => {
        const override = tabOverrides.find(o => o.key === tab.key);
        const isVisibleByDefault = defaultTabVis[tab.key] ?? true; 
        const isVisible = override?.visible ?? isVisibleByDefault;

        if (!isVisible) return null;

        const finalLabel = override?.label || tab.label;
        return {
          ...tab,
          label: finalLabel,
        };
      })
      .filter(Boolean); 

    return processedTabs; 
  }

  async _generateSelectedSheetContent(selectedDoc, selectedData, activeTab) {
    const enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(selectedData.description || "", {
      async: true,
      secrets: selectedDoc.isOwner,
    });
    const systemClass = gameSystemClass(game.system.id);
    const enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(selectedData.notes || "", {
      async: true,
      secrets: selectedDoc.isOwner,
    });

    switch (activeTab) {
      case "info":
        return this._generateSelectedInfoContent(selectedDoc, selectedData, enrichedDescription);

      case "npcs":
        return await this._generateSelectedNPCsContent(selectedDoc, selectedData);

      case "associates":
        return await this._generateSelectedAssociatesContent(selectedDoc, selectedData);

      case "inventory":
        return await this._generateSelectedInventoryContent(selectedDoc, selectedData);

      case "tags":
        return await this._generateSelectedTagsContent(selectedDoc, selectedData);

      case "shops":
        return await this._generateSelectedShopsContent(selectedDoc, selectedData);

      case "locations":
        return await this._generateSelectedLocationsContent(selectedDoc, selectedData);
      
      case "regions":
        return await this._generateSelectedRegionsContent(selectedDoc, selectedData);

      case "widgets":
        const widgetLabelOverride = this._labelOverride(selectedDoc, "widgets");
        selectedData.widgetsToRender = await widgetManager.instantiateActiveWidgets(selectedDoc);
        return await CampaignCodexBaseSheet.generateWidgetsTab(selectedDoc, selectedData, widgetLabelOverride);

      case "quests":
        const questLabelOverride = this._labelOverride(selectedDoc, "quests")|| localize("names.quests");
         const processedQuests = await TemplateComponents.questList(selectedDoc, selectedData.quests, game.user.isGM, true);
         return `
          ${TemplateComponents.contentHeader("fas fa-scroll", questLabelOverride)}
          ${processedQuests ? processedQuests : ''}
         `

      case "notes":
        const notesLabelOverride = this._labelOverride(selectedDoc, "notes") || localize("names.note") ;
        return `
          ${TemplateComponents.contentHeader("fas fa-sticky-note", notesLabelOverride)}
          <article class="cc-enriched cc-hidden-secrets${systemClass}">
           <section class="rich-text-content journal-entry-content" name="cc.secret.content.notes">
              ${enrichedNotes || ""}
            </section>
            </article>
        `;

    case "journals": {
        const journalsLabelOverride = this._labelOverride(selectedDoc, "journals") || localize("names.journals") ;
        let processedJournals = [];
        processedJournals = await GroupLinkers.processJournalLinks(selectedData.linkedStandardJournals);
        const journals = TemplateComponents.standardJournalGrid(processedJournals, true, true);
        return `
          ${TemplateComponents.contentHeader("fas fa-book", journalsLabelOverride)}
          ${journals}`;
    }
      default:
        return "<p></p>";
    }
  }


async _generateSelectedTagsContent(selectedDoc, selectedData) {
    let allPossibleNpcs = [];
    if (this._selectedSheet.type === "location" || this._selectedSheet.type === "region") {
        const [directNPCs, shopNPCs] = await Promise.all([
            CampaignCodexLinkers.getDirectNPCs(selectedDoc, selectedData.linkedNPCs || []),
            CampaignCodexLinkers.getShopNPCs(selectedDoc, selectedData.linkedShops || []),
        ]);
        allPossibleNpcs = [...directNPCs, ...shopNPCs];
    } else { 
        const [npcs, associates] = await Promise.all([
            CampaignCodexLinkers.getLinkedNPCs(selectedDoc, selectedData.linkedNPCs || []),
            CampaignCodexLinkers.getAssociates(selectedDoc, selectedData.associates || [])
        ]);
        allPossibleNpcs = [...npcs, ...associates];
    }
    const taggedNpcMap = allPossibleNpcs.reduce((acc, npc) => {
        if (npc.tag === true) {
            acc.set(npc.uuid, npc);
        }
        return acc;
    }, new Map());

    const taggedNPCs = [...taggedNpcMap.values()];
    const templateData = {
        taggedNPCs: taggedNPCs,
        npcGridHtml: TemplateComponents.entityGrid(taggedNPCs, "associate", true, true)
    };

    return await renderTemplate("modules/campaign-codex/templates/partials/selected-tab-tags.hbs", templateData);
}

async _generateSelectedNPCsContent(selectedDoc, selectedData) {
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
        labelOverride:labelOverride,
        isGM: game.user.isGM,
        hasContent: untaggedNPCs.length > 0,
        dropToMapBtn: (canvas.scene && game.user.isGM) ? `<i class="fas fa-street-view refresh-btn npcs-to-map-button" data-action="selectSheetDrop" title="${format("button.droptoscene", { type: localize("names.npc") })}" data-uuid="${this._selectedSheet.uuid}"></i>` : "",
        untaggedDirectNPCs: [],
        untaggedShopNPCs: [],
        directNpcGrid: "",
        shopNpcGrid: "",
        shopIcon: TemplateComponents.getAsset("icon", "shop")
    };

    if (isLocationOrRegion) {
        templateData.untaggedDirectNPCs = untaggedNPCs.filter(npc => npc.source !== "shop");
        templateData.untaggedShopNPCs = untaggedNPCs.filter(npc => npc.source === "shop");
        templateData.directNpcGrid = TemplateComponents.entityGrid(templateData.untaggedDirectNPCs, "associate", true, true);
        templateData.shopNpcGrid = TemplateComponents.entityGrid(templateData.untaggedShopNPCs, "associate", true, true);
    } else {
        templateData.untaggedDirectNPCs = untaggedNPCs; 
        templateData.directNpcGrid = TemplateComponents.entityGrid(templateData.untaggedDirectNPCs, "associate", true, true);
    }
    
    return await renderTemplate("modules/campaign-codex/templates/partials/selected-tab-npcs.hbs", templateData);
}

  async _generateSelectedShopsContent(selectedDoc, selectedData) {
    const labelOverride = this._labelOverride(selectedDoc, "shops") ||localize("names.shops");
    const shops = await CampaignCodexLinkers.getLinkedShops(selectedDoc, selectedData.linkedShops || []);
    const preparedShops = shops;
    if (preparedShops.length === 0) {
      return `${TemplateComponents.contentHeader("fas fa-house", labelOverride)}`;
    }

    return `
      ${TemplateComponents.contentHeader("fas fa-house", labelOverride)}
        <div class="shops-list">
         ${TemplateComponents.entityGrid(preparedShops, "shop", false, true)}
        </div>
    `;
  }

 

  async _generateSelectedRegionsContent(selectedDoc, selectedData) {
    const labelOverride = this._labelOverride(selectedDoc, "regions") ||localize("names.regions");
    let regions = await CampaignCodexLinkers.getLinkedRegions(selectedDoc, selectedData.linkedRegions || []);
    if (selectedDoc && selectedDoc.getFlag("campaign-codex", "type") === "npc"){
      const locations = await CampaignCodexLinkers.getLinkedLocations(selectedDoc, selectedData.linkedLocations || []);
      regions = locations.filter(item => item.type === "region");
    }

    if (regions.length === 0) {
      return `${TemplateComponents.contentHeader("fas fa-globe", labelOverride)}`;
    }

    return `
      ${TemplateComponents.contentHeader("fas fa-globe", labelOverride)}
        <div class="locations-list">
          ${TemplateComponents.entityGrid(regions, "location", false, true)}
        </div>
    `;
  }

  async _generateSelectedLocationsContent(selectedDoc, selectedData) {
    const labelOverride = this._labelOverride(selectedDoc, "locations") ||localize("names.locations");
    const locations = await CampaignCodexLinkers.getLinkedLocations(selectedDoc, selectedData.linkedLocations || []);
    let preparedLocations = locations;
    if (selectedDoc && selectedDoc.getFlag("campaign-codex", "type") === "npc"){
      const locations = await CampaignCodexLinkers.getLinkedLocations(selectedDoc, selectedData.linkedLocations || []);
      preparedLocations = locations.filter(item => item.type === "location");
    }
    if (preparedLocations.length === 0) {
      return `${TemplateComponents.contentHeader("fas fa-map-marker-alt", labelOverride)}`;
    }

    return `
      ${TemplateComponents.contentHeader("fas fa-map-marker-alt", labelOverride)}
        <div class="locations-list">
          ${TemplateComponents.entityGrid(preparedLocations, "location", false, true)}
        </div>
    `;
  }

  async _generateSelectedInfoContent(selectedDoc, selectedData, enrichedDescription) {
    const labelOverride = this._labelOverride(selectedDoc, "info") ||localize("names.information");
    const systemClass = gameSystemClass(game.system.id);
    return `
    ${TemplateComponents.contentHeader("fas fa-info-circle", labelOverride)}
    <article class="cc-enriched cc-hidden-secrets ${systemClass}">
        <section class="rich-text-content journal-entry-content" name="cc.secret.content.notes">
        ${enrichedDescription || ""}
        </section>
    </article>
  `;
  }
async _generateSelectedAssociatesContent(selectedDoc, selectedData) {
    const labelOverride = this._labelOverride(selectedDoc, "associates");
    const allAssociates = await CampaignCodexLinkers.getAssociates(selectedDoc, selectedData.associates || []);
    const untaggedNPCs = allAssociates.filter(npc => !npc.tag);
    const templateData = {
        labelOverride: labelOverride,
        hasContent: untaggedNPCs.length > 0,
        dropToMapBtn: (canvas.scene && game.user.isGM) 
            ? `<div class="selected-actions">
                 <i class="fas fa-street-view refresh-btn npcs-to-map-button" data-action="selectSheetDrop" title="${format("button.droptoscene", { type: localize("names.npc") })}" data-uuid="${this._selectedSheet.uuid}"></i>
               </div>` 
            : "",
        npcGridHtml: TemplateComponents.entityGrid(untaggedNPCs, "associate", true, true)
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/selected-tab-associates.hbs", templateData);
}

async _generateSelectedInventoryContent(selectedDoc, selectedData) {
      const labelOverride = this._labelOverride(selectedDoc, "inventory");
    const templateData = {
        inventory: await CampaignCodexLinkers.getInventory(selectedDoc, selectedData.inventory || []),
        isGM: game.user.isGM,
        labelOverride:labelOverride,
        selectedSheetUuid: this._selectedSheet.uuid
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/selected-tab-inventory.hbs", templateData);
}

  // =========================================================================
  // LEFT PANEL
  // =========================================================================


async _generateLeftPanel(groupMembers, nestedData, tagNodes) {
  const templateData = {
    toggleClass: this._showTreeItems ? "active" : "",
    toggleClassNPCTags: this._showTreeNPCTags ? "active" : "",
    toggleClassGroups: this._showTreeGroups ? "active" : "",
    toggleClassRegions: this._showTreeRegions ? "active" : "",
    toggleClassLocations: this._showTreeLocations ? "active" : "",
    toggleClassShops: this._showTreeShops ? "active" : "",
    toggleClassNPC: this._showTreeNPCs ? "active" : "",
    toggleClassTag: this._showTreeTags ? "active" : "",
    _showTreeTags: this._showTreeTags,
    treeContent: this._showTreeTags 
      ? await this._generateTreeTagNodes(tagNodes) 
      : await this._generateTreeNodes(groupMembers, nestedData)
  };
  return await renderTemplate("modules/campaign-codex/templates/partials/group-sheet-sidebar.hbs", templateData);
}


  // =========================================================================
  // TREE TAG VIEW
  // =========================================================================



/**
 * Recursively prepares a clean data structure for the tag tree template.
 * @param {Array} nodes - The raw nodes to process.
 * @returns {Array} - The processed nodes with display properties.
 */
_prepareTreeTagNodes(nodes) {
    if (!nodes || nodes.length === 0) return [];
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const typeOrder = { tag: 1, group: 2, region: 3, location: 4, shop: 5, npc: 6, associate: 6 };
    return nodes
        .filter(child => !hideByPermission || child.canView)
        .sort((a, b) => {
            const typeA = typeOrder[a.type] || 99;
            const typeB = typeOrder[b.type] || 99;
            if (typeA !== typeB) return typeA - typeB;
            return a.name.localeCompare(b.name);
        })
        .map(node => {
            const childrenData = node.associates ? [...node.associates, ...node.locations, ...node.shops, ...node.regions] : [];
            const processedChildren = this._prepareTreeTagNodes(childrenData);
            return {
                ...node, 
                isSelected: this._selectedSheet && this._selectedSheet.uuid === node.uuid,
                isExpanded: this._expandedNodes.has(node.uuid),
                hasChildren: processedChildren.length > 0,
                displayIcon: node.iconOverride || TemplateComponents.getAsset("icon", node.tag ? "tag" : node.type),
                children: processedChildren,
                id: node.id,
            };
        });
}

async _generateTreeTagNodes(nodes) {
    const preparedNodes = this._prepareTreeTagNodes(nodes);
    let html = "";
    for (const node of preparedNodes) {
        html += await renderTemplate("modules/campaign-codex/templates/partials/group-tree-tag-node.hbs", { node: node });
    }
    return html;
}


  // =========================================================================
  // MAIN TREE
  // =========================================================================

/**
 * Recursively prepares a clean data structure for the standard tree view template.
 * @param {Array} nodes - The raw nodes to process.
 * @param {object} nestedData - The full nested data object.
 * @returns {Array} - The processed nodes with all display properties.
 */
_prepareTreeNodes(nodes, nestedData) {
    if (!nodes) return [];
    const typeOrder = { group: 1, region: 2, location: 3, shop: 4, npc: 5, item: 6 };
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    
    const sortedNodes = [...nodes].sort((a, b) => {
        const typeA = typeOrder[a.type] || 99;
        const typeB = typeOrder[b.type] || 99;
        if (typeA !== typeB) return typeA - typeB;
        return a.name.localeCompare(b.name);
    });

    return sortedNodes.map(node => {
        const isViewable = !hideByPermission || node.canView;
        if (!isViewable) return null;

        let passesDisplayFilter = false;
        switch (node.type) {
            case "group":
                passesDisplayFilter = this._showTreeGroups;
                break;
            case "region":
                passesDisplayFilter = this._showTreeRegions;
                break;
            case "location":
                passesDisplayFilter = this._showTreeLocations; 
                break;
            case "shop":
                passesDisplayFilter = this._showTreeShops;
                break;
            case "npc":
                passesDisplayFilter = (node.tag && this._showTreeNPCTags) || (!node.tag && this._showTreeNPCs);
                break;
            case "item":
                passesDisplayFilter = this._showTreeItems;
                break;
            default:
                passesDisplayFilter = false; // Unknown types are hidden
        }
        
        if (!passesDisplayFilter) return null;

        const children = this._getChildrenForMember(node, nestedData);
        const processedChildren = this._prepareTreeNodes(children, nestedData); 

        return {
            ...node,
            isSelected: this._selectedSheet?.uuid === node.uuid,
            isExpanded: this._expandedNodes.has(node.uuid),
            hasChildren: processedChildren.length > 0,
            isClickable: node.type !== "item",
            displayIcon: node.iconOverride || TemplateComponents.getAsset("icon", node.tag ? "tag" : node.type),
            children: processedChildren,
            id: node.id,
        };
    }).filter(Boolean); // Filter out the nulls
}

async _generateTreeNodes(nodes, nestedData) {
    const preparedNodes = this._prepareTreeNodes(nodes, nestedData);
    let html = "";



    for (const node of preparedNodes) {
        html += await renderTemplate("modules/campaign-codex/templates/partials/group-tree-node.hbs", { 
            node: node,
            isGM: game.user.isGM 
        });
    }
    return html;
}

_getChildrenForMember(member, nestedData) {
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    let children = [];
    switch (member.type) {
      case "group":
        children.push(...(nestedData.membersByGroup[member.uuid] || []));
        break;
      case "region":
        children.push(...(nestedData.regionsByRegion[member.uuid] || []));
        children.push(...(nestedData.locationsByRegion[member.uuid] || []));
        children.push(...(nestedData.shopsByRegion[member.uuid] || []));
        if (this._showTreeNPCs || this._showTreeNPCTags) {
          children.push(...(nestedData.npcsByRegion[member.uuid] || []));
        }
        if (this._showTreeItems) {
          children.push(...(nestedData.itemsByShop[member.uuid] || []));
        }
        break;
      case "location":
        children.push(...(nestedData.shopsByLocation[member.uuid] || []));
        if (this._showTreeNPCs || this._showTreeNPCTags) {
          children.push(...(nestedData.npcsByLocation[member.uuid] || []));
        }
        if (this._showTreeItems) {
          children.push(...(nestedData.itemsByShop[member.uuid] || []));
        }
        break;
      case "shop":
        if (this._showTreeNPCs || this._showTreeNPCTags) {
          children.push(...(nestedData.npcsByShop[member.uuid] || []));
        }
        if (this._showTreeItems) {
          children.push(...(nestedData.itemsByShop[member.uuid] || []));
        }
        break;
      case "npc":
        if (this._showTreeItems) {
          children.push(...(nestedData.itemsByShop[member.uuid] || []));
        }
        break;
    }

    return children.filter((child) => {
      const isViewable = !hideByPermission || child.canView;
      if (!isViewable) {
        return false; 
      }
      if (child.type === "item") {
        return this._showTreeItems;
      }
      if (child.type === "npc") {
        const isStandardNpc = !child.tag;
        const isTaggedNpc = child.tag === true;
        return (this._showTreeNPCs && isStandardNpc) || (this._showTreeNPCTags && isTaggedNpc);
      }
      // All other types (group, region, location, shop) are allowed
      return true;
    });
}


  // =========================================================================
  // Main Sheet Tab Generation
  // =========================================================================

  async _generateInfoTab(data) {
    const templateData = {
      isGM: data.isGM,
      dropZone: game.user.isGM 
        ? TemplateComponents.dropZone("member", "fas fa-plus-circle", "", "") 
        : "",
      richTextDescription: TemplateComponents.richTextSection(this.document, data.sheetData.enrichedDescription, "description", data.isOwnerOrHigher)
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/group-tab-info.hbs", templateData);
  }

async _generateInventoryTab(data) {
    const defaultTabvisibility = game.settings.get("campaign-codex", "defaultTabVisibility");
    const nestedData = data.nestedData;
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const hideInventoryByPermission = game.settings.get("campaign-codex", "hideInventoryByPermission");
    const sortAlpha = game.settings.get("campaign-codex", "sortCardsAlpha");
    const shopsForTemplate = [];
    const inventoryHolders =[...nestedData.allShops,...nestedData.allLocations,...nestedData.allRegions,...nestedData.allNPCs];

    for (const [shopUuid, items] of Object.entries(nestedData.itemsByShop)) {
        const shop = inventoryHolders.find((s) => s.uuid === shopUuid);

        const inventoryKey = `${shop.type}.inventory`;
        const isDefaultVisible = defaultTabvisibility[inventoryKey] ?? true;
        const inventoryOverride = shop.tabOverrides?.find(o => o.key === 'inventory');
        let isInventoryVisible = isDefaultVisible; 

        if (inventoryOverride !== undefined) {
            isInventoryVisible = inventoryOverride.visible ?? isDefaultVisible;
        }

        if (!shop || items.length === 0 || (hideByPermission && !shop.canView) || !isInventoryVisible) {
        continue;
        }

        const imageAreaOverride = shop.tabOverrides?.find(override => override.key === "imageArea");

        let processedItems = hideInventoryByPermission
            ? items.filter(item => item.canView)
            : items;
        if (sortAlpha) {
            processedItems.sort((a, b) => a.name.localeCompare(b.name));
        }
        shopsForTemplate.push({
            ...shop,
            showImage:imageAreaOverride?.visible ?? true,
            items: processedItems,
            isGM:data.isGM
        });
    }
    if (sortAlpha) {
        shopsForTemplate.sort((a, b) => a.name.localeCompare(b.name));
    }
    return await renderTemplate("modules/campaign-codex/templates/partials/group-tab-inventory.hbs", {
        shops: shopsForTemplate
    });
}


async _generateJournalsTab(context) {
    const journals = await TemplateComponents.standardJournalGrid(context.linkedStandardJournals) 
    return await renderTemplate("modules/campaign-codex/templates/partials/group-tab-journals.hbs", {
        journals: journals
    });
}


async _generateQuestsTab(data) {
  const entitiesWithQuests = [
    ...data.nestedData.allLocations, 
    ...data.nestedData.allRegions, 
    ...data.nestedData.allShops, 
    ...data.nestedData.allNPCs
  ].filter(item => item.quests && item.canView);
  const templateDataPromises = entitiesWithQuests.map(async (entity) => {
    const doc = await fromUuid(entity.uuid);
    if (!doc) return null; 
    const docData = doc.getFlag("campaign-codex", "data") || {};
    if (!docData.quests || docData.quests.length === 0) return null;
    const docType = doc.getFlag("campaign-codex", "type") || "quest";
    // Filter out completed quests
    const incompleteQuests = docData.quests.filter(q => !q.completed);
    const visibleQuests = game.user.isGM ? incompleteQuests : incompleteQuests.filter(q => q.visible);
    const hideSection = !visibleQuests || visibleQuests.length === 0;
    // Sort quests: pinned first, then by name
    const sortedQuests = visibleQuests.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (a.title || "").localeCompare(b.title || "");
    });
  return {
      name: doc.name,
      uuid: doc.uuid,
      type: docType,
      hide: hideSection,
      icon: TemplateComponents.getAsset("icon", docType),
      iconOverride: doc.getFlag("campaign-codex", "icon-override") || null,
      questListHtml: await TemplateComponents.questList(doc, sortedQuests, game.user.isGM, true)
    };
  });

  const processedEntities = (await Promise.all(templateDataPromises)).filter(Boolean);
  // Sort entities by name
  processedEntities.sort((a, b) => a.name.localeCompare(b.name));
  return renderTemplate("modules/campaign-codex/templates/partials/group-tab-quests.hbs", {
    entities: processedEntities
  });
}

async _generateCompletedQuestsTab(data) {
  const entitiesWithQuests = [
    ...data.nestedData.allLocations, 
    ...data.nestedData.allRegions, 
    ...data.nestedData.allShops, 
    ...data.nestedData.allNPCs
  ].filter(item => item.quests && item.canView);
  const templateDataPromises = entitiesWithQuests.map(async (entity) => {
    const doc = await fromUuid(entity.uuid);
    if (!doc) return null; 
    const docData = doc.getFlag("campaign-codex", "data") || {};
    if (!docData.quests || docData.quests.length === 0) return null;
    const docType = doc.getFlag("campaign-codex", "type") || "quest";
    // Filter only completed quests
    const completedQuests = docData.quests.filter(q => q.completed);
    const visibleQuests = game.user.isGM ? completedQuests : completedQuests.filter(q => q.visible);
    const hideSection = !visibleQuests || visibleQuests.length === 0;
    // Sort quests: pinned first, then by name
    const sortedQuests = visibleQuests.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (a.title || "").localeCompare(b.title || "");
    });
  return {
      name: doc.name,
      uuid: doc.uuid,
      type: docType,
      hide: hideSection,
      icon: TemplateComponents.getAsset("icon", docType),
      iconOverride: doc.getFlag("campaign-codex", "icon-override") || null,
      questListHtml: await TemplateComponents.questList(doc, sortedQuests, game.user.isGM, true)
    };
  });

  const processedEntities = (await Promise.all(templateDataPromises)).filter(Boolean);
  // Sort entities by name
  processedEntities.sort((a, b) => a.name.localeCompare(b.name));
  return renderTemplate("modules/campaign-codex/templates/partials/group-tab-completed-quests.hbs", {
    entities: processedEntities
  });
}


  // =========================================================================
  // Filtered NPC Tab Generation
  // =========================================================================


async _generateNPCsTab(data) {
  const allAvailableNPCs = [
    ...data.nestedData.allNPCs, 
    ...(data.missingTaggedNpcs || [])
  ];
  const uniqueNpcs = [...new Map(allAvailableNPCs.map(npc => [npc.uuid, npc])).values()];

  const templateData = {
    filters: [
      { dataFilter: 'all',       title: localize("title.all"),        iconClass: 'fas fa-users',                  class: 'npcs-all active' },
      { dataFilter: 'region',  title: localize("names.region"),   iconClass: TemplateComponents.getAsset("icon", "region"), class: 'npcs-region' },
      { dataFilter: 'location',  title: localize("names.location"),   iconClass: TemplateComponents.getAsset("icon", "location"), class: 'npcs-location' },
      { dataFilter: 'shop',      title: localize("names.shop"),       iconClass: TemplateComponents.getAsset("icon", "shop"),     class: 'npcs-shop' },
      { dataFilter: 'tag',       title: localize("names.tag"),        iconClass: 'fas fa-tag',                    class: 'npcs-tag' },
      { dataFilter: 'character', title: localize("names.player"),      iconClass: 'fas fa-user-secret',            class: 'npcs-player' }
    ],
    npcGridHtml: await this._generateNPCCards(uniqueNpcs)
  };

  return renderTemplate("modules/campaign-codex/templates/partials/group-tab-npcs.hbs", templateData);
}

  async _generateNPCCards(npcs) {
    const npcCards = game.settings.get("campaign-codex", "sortCardsAlpha");
    const npcstoRender = npcCards ? [...npcs].sort((a, b) => a.name.localeCompare(b.name)) : npcs;
    const cardPromises = npcstoRender.map(async (npc) => {
      const sourcesArray = [];
      if (npc.regions.length > 0) {
        sourcesArray.push("region");
      }
      if (npc.locations.length > 0) {
        sourcesArray.push("location");
      }
      if (npc.shops.length > 0) {
        sourcesArray.push("shop");
      }
      if (npc.tag) {
        sourcesArray.push("tag");
      }
      const sources = sourcesArray.join(" ");
      const actorType = npc.actor?.type ?? "";

      const customData = { "data-filter": `${sources} ${actorType}` };
      return TemplateComponents.entityCard(npc, "associate", true, true, customData);
    });

    const htmlCards = await Promise.all(cardPromises);
    return htmlCards.join("");
  }


  // =========================================================================
  // Location & REGION Tab Generation
  // =========================================================================

async _generateRegionsTab(data) {
    const rawRegions = [...data.nestedData.allRegions];
    const sortAlpha = game.settings.get("campaign-codex", "sortCardsAlpha");
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    let processedRegions = hideByPermission 
        ? rawRegions.filter(loc => loc.canView) 
        : rawRegions;
    if (sortAlpha) {
        processedRegions.sort((a, b) => a.name.localeCompare(b.name));
    }
    processedRegions.forEach(location => {
        const imageAreaOverride = location.tabOverrides?.find(override => override.key === "imageArea");
        location.showImage = imageAreaOverride?.visible ?? true,
        location.displayIcon = TemplateComponents.getAsset("icon", location.type === "region" ? "region" : "location");
    });
    return await renderTemplate("modules/campaign-codex/templates/partials/group-tab-regions.hbs", {
        regions: processedRegions
    });
}


async _generateLocationsTab(data) {
    const rawLocations = [...data.nestedData.allLocations];
    const sortAlpha = game.settings.get("campaign-codex", "sortCardsAlpha");
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    let processedLocations = hideByPermission 
        ? rawLocations.filter(loc => loc.canView) 
        : rawLocations;
    if (sortAlpha) {
        processedLocations.sort((a, b) => a.name.localeCompare(b.name));
    }
    processedLocations.forEach(location => {
        const imageAreaOverride = location.tabOverrides?.find(override => override.key === "imageArea");
        location.showImage = imageAreaOverride?.visible ?? true,
        location.displayIcon = TemplateComponents.getAsset("icon", location.type === "region" ? "region" : "location");
    });
    return await renderTemplate("modules/campaign-codex/templates/partials/group-tab-locations.hbs", {
        locations: processedLocations
    });
}

  // =========================================================================
  // Group Widgets Tab
  // =========================================================================

  async _generateGroupWidgetsTab(doc, context) {
    const templateData = {
      widgetsToRender: context.widgetsToRender,
      activewidget: context.activewidget,
      inactivewidgets: context.inactivewidgets,
      addedWidgetNames: context.addedWidgetNames,
      availableWidgets: context.availableWidgets,
      isGM: context.isGM
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/group-widgets.hbs", templateData);
  }

  // =========================================================================
  // Event Handlers
  // =========================================================================

  async _addMemberToGroup(newMemberUuid) {
    if (newMemberUuid === this.document.uuid) {
      ui.notifications.warn(localize("group.self"));
      return;
    }

    const newMemberDoc = await fromUuid(newMemberUuid);
    if (!newMemberDoc) {
      ui.notifications.error(localize("group.self"));
      return;
    }

    if (newMemberDoc.getFlag("campaign-codex", "type") === "group") {
      const membersOfNewGroup = await GroupLinkers.getGroupMembers(newMemberDoc.getFlag("campaign-codex", "data")?.members || []);
      
      const nestedDataOfNewGroup = await GroupLinkers.getNestedData(membersOfNewGroup);

      if (nestedDataOfNewGroup.allGroups.some((g) => g.uuid === this.document.uuid)) {
        ui.notifications.warn(`Cannot add "${newMemberDoc.name}" as it would create a circular dependency.`);
        return;
      }
    }

    const groupData = this.document.getFlag("campaign-codex", "data") || {};
    let currentMembers = groupData.members || [];

    // const existingMembers = await GroupLinkers.getGroupMembers(currentMembers);
    // const nestedData = await GroupLinkers.getNestedData(existingMembers);
    const nestedData = this._processedData.nestedData;
    const allExistingNestedUuids = new Set([
      ...nestedData.allGroups.map((i) => i.uuid),
      ...nestedData.allRegions.map((i) => i.uuid),
      ...nestedData.allLocations.map((i) => i.uuid),
      ...nestedData.allShops.map((i) => i.uuid),
      ...nestedData.allNPCs.map((i) => i.uuid),
    ]);

    if (allExistingNestedUuids.has(newMemberUuid)) {
      ui.notifications.warn(`"${newMemberDoc.name}" is already included in this group as a child of another member.`);
      return;
    }

    const newMemberAsGroupMember = [
      {
        uuid: newMemberUuid,
        type: newMemberDoc.getFlag("campaign-codex", "type"),
      },
    ];

    const nestedDataOfNewMember = await GroupLinkers.getNestedData(newMemberAsGroupMember);
    const allNestedUuidsOfNewMember = new Set([
      ...nestedDataOfNewMember.allGroups.map((i) => i.uuid),
      ...nestedDataOfNewMember.allRegions.map((i) => i.uuid),
      ...nestedDataOfNewMember.allLocations.map((i) => i.uuid),
      ...nestedDataOfNewMember.allShops.map((i) => i.uuid),
      ...nestedDataOfNewMember.allNPCs.map((i) => i.uuid),
    ]);

    const membersToRemove = currentMembers.filter((memberUuid) => allNestedUuidsOfNewMember.has(memberUuid));
    let updatedMembers = currentMembers.filter((memberUuid) => !allNestedUuidsOfNewMember.has(memberUuid));

    updatedMembers.push(newMemberUuid);
    groupData.members = updatedMembers;
    await this.document.setFlag("campaign-codex", "data", groupData);

    this._processedData = null;
    this.render(true);

    let notification = `Added "${newMemberDoc.name}" to the group.`;
    if (membersToRemove.length > 0) {
      notification += ` Removed ${membersToRemove.length} redundant top-level member(s).`;
    }
    ui.notifications.info(notification);
  }


  getSheetType() {
    return "group";
  }

  async _isRelatedDocument(changedDocUuid) {
    if (!this.document.getFlag) return false;
    

    if (!this._processedData) {
        this._processedData = await this._processGroupData();
    }
    const nestedData = this._processedData.nestedData;

    const allUuids = new Set([
      ...nestedData.allGroups.map((i) => i.uuid),
      ...nestedData.allRegions.map((i) => i.uuid),
      ...nestedData.allLocations.map((i) => i.uuid),
      ...nestedData.allShops.map((i) => i.uuid),
      ...nestedData.allNPCs.map((i) => i.uuid),
      ...nestedData.allItems.map((i) => i.uuid),
    ]);

    if (allUuids.has(changedDocUuid)) {
      return true;
    }

    for (const npc of nestedData.allNPCs) {
      if (npc.actor && npc.actor.uuid === changedDocUuid) {
        return true;
      }
    }

    return await super._isRelatedDocument(changedDocUuid);
  }


  async _onDropNPCsToMapClick(event) {
    event.preventDefault();
    const sheetUuid = event.currentTarget.dataset.sheetUuid;
    try {
      const selectedDoc = await fromUuid(sheetUuid);
      if (!selectedDoc) {
        ui.notifications.warn("Selected sheet not found");
        return;
      }
      const selectedData = selectedDoc.getFlag("campaign-codex", "data") || {};
      const selectedType = this._selectedSheet.type;
      let npcsToMap = [];
      if (selectedType === "npc" && selectedData.associates) {
        const associates = await CampaignCodexLinkers.getAssociates(selectedDoc, selectedData.associates || []);
        const filteredAssociates = associates.filter((npc) => npc.actor);
        npcsToMap.push(...filteredAssociates);
      } else if (selectedType === "shop" || selectedType === "location") {
        const npcs = await CampaignCodexLinkers.getLinkedNPCs(selectedDoc, selectedData.linkedNPCs || []);
        npcsToMap = npcs.filter((npc) => npc.actor);
      }

      if (npcsToMap.length > 0) {
        await this._onDropNPCsToMap(npcsToMap, {
          title: `Drop ${this._selectedSheet.name} NPCs to Map`,
        });
      } else {
        ui.notifications.warn(localize("warn.invaliddrop"));
      }
    } catch (error) {
      console.error("Campaign Codex | Error dropping NPCs to map:", error);
      ui.notifications.error(localize("warn.failedtodrop"));
    }
  }

  // =========================================================================
  // Drop Logic
  // =========================================================================


  async _handleDrop(data, event) {
    event.preventDefault();
    event.stopPropagation();
    if (data.type === "JournalEntry" || data.type === "JournalEntryPage") {
      const journal = await fromUuid(data.uuid);
      if (!journal) return;

      const journalType = journal ? journal.getFlag("campaign-codex", "type") : undefined;

      // STANDARD JOURNAL
      if (((!journalType && data.type === "JournalEntry") || data.type === "JournalEntryPage")) {
        const docData = this.document.getFlag("campaign-codex", "data") || {};
        docData.linkedStandardJournals = docData.linkedStandardJournals || [];
        if (!docData.linkedStandardJournals.includes(journal.uuid)) {
            docData.linkedStandardJournals.push(journal.uuid);
            await this.document.setFlag("campaign-codex", "data", docData);
            ui.notifications.info(`Linked journal "${journal.name}".`);
        } else {
            ui.notifications.warn(`Journal "${journal.name}" is already linked.`);
        }
      }

      // CC JOURNAL
      if (journal && journalType) {
        await this._addMemberToGroup(journal.uuid);
      }

    } else if (data.type === "Actor") {
      const actor = await fromUuid(data.uuid);
      const npcJournal = await game.campaignCodex.findOrCreateNPCJournalForActor(actor);
      if (npcJournal) {
        await this._addMemberToGroup(npcJournal.uuid);
      }
    }
  }


}
