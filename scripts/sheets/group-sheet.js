import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { TemplateComponents } from "./template-components.js";
import { GroupLinkers } from "./group-linkers.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { promptForName } from "../helper.js";
import { localize, format, renderTemplate } from "../helper.js";

export class GroupSheet extends CampaignCodexBaseSheet {
  // =========================================================================
  // Foundry VTT Overrides
  // =========================================================================

  constructor(document, options = {}) {
    super(document, options);
    this._selectedSheet = null;
    this._selectedSheetTab = "info";
    this._expandedNodes = new Set();
    this._showTreeItems = false;
    this._showTreeNPCTags = false;
    this._showTreeNPCs = true;
    this._showTreeTags = false;
    this._processedData = null;
  }
 
  async _render(force, options) {
    if (force) {
      this._processedData = null;
    }
    return super._render(force, options);
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: [...super.defaultOptions.classes, "group-sheet"],
      width: 1200,
      height: 800,
    });
  }

  get template() {
    return "modules/campaign-codex/templates/group-sheet.html";
  }

  async _processGroupData() {
    const groupData = this.document.getFlag("campaign-codex", "data") || {};
    const groupMembers = await GroupLinkers.getGroupMembers(groupData.members || []);
    const nestedData = await GroupLinkers.getNestedData(groupMembers);
    const treeTagNodes = await GroupLinkers.buildTagTree(nestedData);
    const missingTaggedNpcs = await GroupLinkers.formatMissingTags(treeTagNodes, nestedData.allNPCs);
    return { groupMembers, nestedData, treeTagNodes, missingTaggedNpcs };
  }

  async getData() {
    const data = await super.getData();
    data.isGM = game.user.isGM;
    if (!this._processedData) {
      this._processedData = await this._processGroupData();
    }
    const { groupMembers, nestedData, treeTagNodes, missingTaggedNpcs } = this._processedData;
    data.groupMembers = groupMembers;
    data.nestedData = nestedData;
    data.treeTagNodes = treeTagNodes;
    data.missingTaggedNpcs = missingTaggedNpcs;
    data.sheetType = "group";
      if (data.sheetTypeLabelOverride !== undefined && data.sheetTypeLabelOverride !== "") {
            data.sheetTypeLabel = data.sheetTypeLabelOverride;
        } else{
            data.sheetTypeLabel = localize("names.group");
          }
    data.customImage = this.document.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "group");
    data.leftPanel = await this._generateLeftPanel(data.groupMembers, data.nestedData, data.treeTagNodes);
    
    data.tabs = [
      {
        key: "info",
        label: localize("names.information"),
        icon: "fas fa-info-circle",
        active: !this._selectedSheet && this._currentTab === "info",
      },
      {
        key: "npcs",
        label: localize("names.npcs"),
        icon: TemplateComponents.getAsset("icon", "npc"),
        active: !this._selectedSheet && this._currentTab === "npcs",
        statistic: { value: data.nestedData.allNPCs.length },
      },
      {
        key: "inventory",
        label: localize("names.inventory"),
        icon: "fas fa-boxes",
        active: !this._selectedSheet && this._currentTab === "inventory",
        statistic: { value: data.nestedData.allItems.length },
      },
      {
        key: "locations",
        label: localize("names.locations"),
        icon: TemplateComponents.getAsset("icon", "location"),
        active: !this._selectedSheet && this._currentTab === "locations",
        statistic: { value: data.nestedData.allLocations.length },
      },
      {
        key: "quests",
        label: localize("names.quests"),
        icon: TemplateComponents.getAsset("icon", "quest"),
        active: !this._selectedSheet && this._currentTab === "quests",
      },
      { key: "journals", label: localize("names.journals"), icon: "fas fa-book", active: !this._selectedSheet && this._currentTab === "journals"},
      ...(game.user.isGM
        ? [
            {
              key: "notes",
              label: localize("names.note"),
              icon: "fas fa-sticky-note",
              active: !this._selectedSheet && this._currentTab === "notes",
            },
          ]
        : []),
    ];

    if (this._selectedSheet) {
      data.isShowingSelectedView = true;
      data.selectedSheetContent = await this._generateSelectedSheetTab();
      data.tabPanels = [];
    } else {
      data.isShowingSelectedView = false;
      data.tabPanels = [
        {
          key: "info",
          active: this._currentTab === "info",
          content: await this._generateInfoTab(data),
        },
        {
          key: "npcs",
          active: this._currentTab === "npcs",
          content: await this._generateNPCsTab(data),
        },
        {
          key: "inventory",
          active: this._currentTab === "inventory",
          content: await this._generateInventoryTab(data),
        },
        {
          key: "locations",
          active: this._currentTab === "locations",
          content: await this._generateLocationsTab(data),
        },
        {
          key: "quests",
          active: this._currentTab === "quests",
          content: await this._generateQuestsTab(data),
        },
        { key: "journals", active: this._currentTab === "journals", content:  TemplateComponents.standardJournalGrid(data.linkedStandardJournals) },
        {
          key: "notes",
          active: this._currentTab === "notes",
          content: TemplateComponents.richTextSection(this.document, data.sheetData.enrichedNotes, "notes", data.isOwnerOrHigher),
        },
      ];
    }

    data.selectedSheet = this._selectedSheet;
    data.selectedSheetTab = this._selectedSheetTab;

    return data;
  }

  activateListeners(html) {
    const nativeHtml = html instanceof jQuery ? html[0] : html;
    super.activateListeners(html);



    const singleActionMap = {
      ".btn-expand-all": this._onExpandAll,
      ".btn-collapse-all": this._onCollapseAll,
      ".toggle-tree-items": this._onToggleTreeItems,
      ".toggle-tree-npcs": this._onToggleTreeNPC,
      ".toggle-tree-npctags": this._onToggleTreeNPCTags,
      ".toggle-tree-tags": this._onToggleTreeTags,
      ".btn-close-selected": this._onCloseSelectedSheet,
      ".btn-open-scene": this._onOpenScene,
    };

    for (const [selector, handler] of Object.entries(singleActionMap)) {
      nativeHtml.querySelector(selector)?.addEventListener("click", handler.bind(this));
    }

    const multiActionMap = {
      ".expand-toggle": this._onToggleTreeNode,
      ".tree-label.clickable": this._onSelectSheet,
      ".selected-sheet-tab": this._onSelectedSheetTabChange,
      ".btn-remove-member": this._onRemoveMember,
      ".btn-focus-item": this._onFocusItem,
      ".filter-btn": this._onFilterChange,
      ".group-tab": this._onTabChange,
      ".btn-send-to-player": this._onSendToPlayer,
      ".btn-npc-to-scene": this._onDropSingleNPCToMapClick,
    };

    for (const [selector, handler] of Object.entries(multiActionMap)) {
      nativeHtml.querySelectorAll(selector).forEach((el) => el.addEventListener("click", handler.bind(this)));
    }

    const documentOpenMap = {
      ".open-item": { flag: "item", handler: this._onOpenDocument },
      ".btn-open-sheet, .group-location-card": { flag: "sheet", handler: this._onOpenDocument },
      ".open-location": { flag: "location", handler: this._onOpenDocument },
      ".open-shop": { flag: "shop", handler: this._onOpenDocument },
      ".open-associate": { flag: "associate", handler: this._onOpenDocument },
      ".btn-open-actor": { flag: "actor", handler: this._onOpenDocument },
    };

    for (const [selector, { flag, handler }] of Object.entries(documentOpenMap)) {
      nativeHtml.querySelectorAll(selector).forEach((el) => {
        el.addEventListener("click", (e) => handler.call(this, e, flag));
      });
    }


    nativeHtml.querySelector(".tag-mode-toggle")?.addEventListener("change", this._onTagToggle.bind(this));
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

  async _generateSelectedSheetTab() {
    if (!this._selectedSheet) return "";
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");

    const selectedDoc = await fromUuid(this._selectedSheet.uuid);
    if (!selectedDoc) {
      this._selectedSheet = null;
      return "<p>Selected sheet not found. Please re-select from the tree.</p>";
    }
    const selectedData = selectedDoc.getFlag("campaign-codex", "data") || {};
    const linkedActor = selectedData.linkedActor ? await CampaignCodexLinkers.getLinkedActor(selectedData.linkedActor) : null;

    // --- Prepare the data for the template ---
    const templateData = {
      selectedSheet: this._selectedSheet,
      selectedImage: selectedDoc.getFlag("campaign-codex", "image") || linkedActor?.img || "",
      tagsContent: await this._generateTagsContent(selectedData),
      dropButtonHtml: "",
      sceneButtonHtml: "",
      actorButtonHtml: "",
      subTabs: [],
      selectedSheetContent: await this._generateSelectedSheetContent(selectedDoc, selectedData, this._selectedSheetTab)
    };
    if (this._selectedSheet.type === "npc" && linkedActor && (await CampaignCodexBaseSheet.canUserView(linkedActor.uuid))) {
      templateData.actorButtonHtml = `
        <button type="button" class="btn-open-actor" data-actor-uuid="${linkedActor.uuid}" title="${localize("title.open.actor")}">
          <i class="fas fa-user"></i>
        </button>`;
    }
    if (this._selectedSheet.type === "npc" && linkedActor && canvas.scene && game.user.isGM) {
      templateData.dropButtonHtml = `
        <button type="button" class="refresh-btn btn-npc-to-scene" data-sheet-uuid="${this._selectedSheet.uuid}" title="${localize("message.drop")}">
          <i class="fas fa-street-view"></i>
        </button>`;
    }
    if (
      (this._selectedSheet.type === "location" || this._selectedSheet.type === "region" || this._selectedSheet.type === "shop") &&
      selectedData.linkedScene &&
      (!hideByPermission || (await CampaignCodexBaseSheet.canUserView(selectedData.linkedScene)))
    ) {
      templateData.sceneButtonHtml = `
        <button type="button" class="btn-open-scene" data-doc-uuid="${selectedDoc.uuid}" title="${format("message.open", { type: localize("names.scene") })}">
          <i class="fas fa-map"></i>
        </button>`;
    }
    const subTabsRaw = this._getSelectedSheetSubTabs(this._selectedSheet.type, selectedData, {});
    templateData.subTabs = subTabsRaw.map(tab => ({
        ...tab,
        active: tab.key === this._selectedSheetTab
    }));
    return await renderTemplate("modules/campaign-codex/templates/partials/selected-sheet-view.hbs", templateData);
  }


  _getSelectedSheetSubTabs(type, data, calculatedCounts = {}) {
    const baseTabs = [
      { key: "info", label:localize("names.information"), icon: "fas fa-info-circle" },
      { key: "quests", label: localize("names.quests"), icon: "fas fa-scroll" },
      { key: "journals", label: localize("names.journals"), icon: "fas fa-book" },
      ...(game.user.isGM ? [{ key: "notes", label: localize("names.note"), icon: "fas fa-sticky-note" }] : []),
    ];

    switch (type) {
      case "npc":
        baseTabs.splice(
          1,
          0,
          {
            key: "associates",
            label: localize("names.associates"),
            icon: "fas fa-users",
            count: (data.associates || []).length,
          },
          {
            key: "tags",
            label: localize("names.tags"),
            icon: "fas fa-tag",
          },
          {
            key: "shops",
            label: localize("names.shops"),
            icon: TemplateComponents.getAsset("icon", "shop"),
            count: (data.linkedShops || []).length,
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
            count: (data.linkedNPCs || []).length,
          },
          {
            key: "tags",
            label: localize("names.tags"),
            icon: "fas fa-tag",
          },
          {
            key: "inventory",
            label: localize("names.inventory"),
            icon: "fas fa-boxes",
            count: (data.inventory || []).length,
          },
        );
        break;

      case "location":
        baseTabs.splice(
          1,
          0,
          {
            key: "npcs",
            label: localize("names.npcs"),
            icon: TemplateComponents.getAsset("icon", "npc"),
            count: calculatedCounts.totalNPCs ?? (data.linkedNPCs || []).length,
          },
          {
            key: "tags",
            label: localize("names.tags"),
            icon: "fas fa-tag",
          },
          {
            key: "shops",
            label: localize("names.shops"),
            icon: TemplateComponents.getAsset("icon", "shop"),
            count: (data.linkedShops || []).length,
          },
        );
        break;

      case "region":
        baseTabs.splice(
          1,
          0,
          {
            key: "locations",
            label: localize("names.locations"),
            icon: TemplateComponents.getAsset("icon", "location"),
            count: (data.linkedLocations || []).length,
          },
          {
            key: "npcs",
            label: localize("names.npcs"),
            icon: TemplateComponents.getAsset("icon", "npc"),
            count: calculatedCounts.totalNPCs ?? (data.linkedNPCs || []).length,
          },
          {
            key: "tags",
            label: localize("names.tags"),
            icon: "fas fa-tag",
          },
          {
            key: "shops",
            label:localize("names.shops"),
            icon: TemplateComponents.getAsset("icon", "shop"),
            count: (data.linkedShops || []).length,
          },
        );
        break;
    }

    return baseTabs;
  }

  async _generateSelectedSheetContent(selectedDoc, selectedData, activeTab) {
    const enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(selectedData.description || "", {
      async: true,
      secrets: selectedDoc.isOwner,
    });
    const systemClass = game.system.id === "dnd5e" ? " dnd5e2-journal themed theme-light" : "";
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
      
      case "quests":
        return await TemplateComponents.questList(selectedDoc, selectedData.quests, game.user.isGM, true);

      case "notes":
        return `
          <article class="selected-content-section cc-enriched cc-hidden-secrets${systemClass}">
           <section class="rich-text-content journal-entry-content" name="cc.secret.content.notes">
              ${enrichedNotes || ""}
            </section>
            </article>
        `;

    case "journals": {
        const processedJournals = await GroupLinkers.processJournalLinks(selectedData.linkedStandardJournals);
        return `<div class="selected-sheet-journals">${TemplateComponents.standardJournalGrid(processedJournals, true)}</div>`;
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
    const isLocationOrRegion = this._selectedSheet.type === "location" || this._selectedSheet.type === "region";
    const [directNPCs, shopNPCs, linkedNPCs] = await Promise.all([
        CampaignCodexLinkers.getDirectNPCs(selectedDoc, selectedData.linkedNPCs || []),
        CampaignCodexLinkers.getShopNPCs(selectedDoc, selectedData.linkedShops || []),
        CampaignCodexLinkers.getLinkedNPCs(selectedDoc, selectedData.linkedNPCs || [])
    ]);
    const allNPCs = isLocationOrRegion ? [...directNPCs, ...shopNPCs] : linkedNPCs;
    const untaggedNPCs = allNPCs.filter(npc => !npc.tag);
    const templateData = {
        isGM: game.user.isGM,
        hasContent: untaggedNPCs.length > 0,
        dropToMapBtn: (canvas.scene && game.user.isGM) ? `<button type="button" class="refresh-btn npcs-to-map-button" title="${format("button.droptoscene", { type: localize("names.npc") })}" data-sheet-uuid="${this._selectedSheet.uuid}"><i class="fas fa-street-view"></i></button>` : "",
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
        templateData.untaggedDirectNPCs = untaggedNPCs; // For other types, all untagged NPCs are "direct"
        templateData.directNpcGrid = TemplateComponents.entityGrid(templateData.untaggedDirectNPCs, "associate", true, true);
    }
    
    return await renderTemplate("modules/campaign-codex/templates/partials/selected-tab-npcs.hbs", templateData);
}

  async _generateSelectedShopsContent(selectedDoc, selectedData) {
    const shops = await CampaignCodexLinkers.getLinkedShops(selectedDoc, selectedData.linkedShops || []);
    const preparedShops = shops;
    if (preparedShops.length === 0) {
      return "";
    }

    return `
      <div class="selected-content-section">
        <div class="shops-list">
         ${TemplateComponents.entityGrid(preparedShops, "shop", false, true)}
        </div>
      </div>
    `;
  }

  async _generateSelectedLocationsContent(selectedDoc, selectedData) {
    const locations = await CampaignCodexLinkers.getLinkedLocations(selectedDoc, selectedData.linkedLocations || []);
    const preparedLocations = locations;
    if (preparedLocations.length === 0) {
      return "";
    }

    return `
      <div class="selected-content-section">
        <div class="locations-list">
          ${TemplateComponents.entityGrid(preparedLocations, "location", false, true)}
        </div>
      </div>
    `;
  }

  async _generateSelectedInfoContent(selectedDoc, selectedData, enrichedDescription) {
    const systemClass = game.system.id === "dnd5e" ? " dnd5e2-journal themed theme-light" : "";
    return `
    <article class="selected-content-section cc-enriched cc-hidden-secrets${systemClass}">
        <section class="rich-text-content journal-entry-content" name="cc.secret.content.notes">
        ${enrichedDescription || ""}
        </section>
    </article>
  `;
  }
async _generateSelectedAssociatesContent(selectedDoc, selectedData) {
    const allAssociates = await CampaignCodexLinkers.getAssociates(selectedDoc, selectedData.associates || []);
    const untaggedNPCs = allAssociates.filter(npc => !npc.tag);
    const templateData = {
        hasContent: untaggedNPCs.length > 0,
        dropToMapBtn: (canvas.scene && game.user.isGM) 
            ? `<div class="selected-actions">
                 <button type="button" class="refresh-btn npcs-to-map-button" title="${format("button.droptoscene", { type: localize("names.npc") })}" data-sheet-uuid="${this._selectedSheet.uuid}">
                   <i class="fas fa-street-view"></i>
                 </button>
               </div>` 
            : "",
        npcGridHtml: TemplateComponents.entityGrid(untaggedNPCs, "associate", true, true)
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/selected-tab-associates.hbs", templateData);
}

async _generateSelectedInventoryContent(selectedDoc, selectedData) {
    const templateData = {
        inventory: await CampaignCodexLinkers.getInventory(selectedDoc, selectedData.inventory || []),
        isGM: game.user.isGM,
        selectedSheetUuid: this._selectedSheet.uuid
    };
    return await renderTemplate("modules/campaign-codex/templates/partials/selected-tab-inventory.hbs", templateData);
}

async _generateLeftPanel(groupMembers, nestedData, tagNodes) {
  const templateData = {
    toggleClass: this._showTreeItems ? "active" : "",
    toggleClassNPCTags: this._showTreeNPCTags ? "active" : "",
    toggleClassNPC: this._showTreeNPCs ? "active" : "",
    toggleClassTag: this._showTreeTags ? "active" : "",
    _showTreeTags: this._showTreeTags,
    treeContent: this._showTreeTags 
      ? await this._generateTreeTagNodes(tagNodes) 
      : await this._generateTreeNodes(groupMembers, nestedData)
  };
  return await renderTemplate("modules/campaign-codex/templates/partials/group-sheet-sidebar.hbs", templateData);
}

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
                displayIcon: TemplateComponents.getAsset("icon", node.tag ? "tag" : node.type),
                children: processedChildren // Attach the prepared children
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


/**
 * Recursively prepares a clean data structure for the standard tree view template.
 * @param {Array} nodes - The raw nodes to process.
 * @param {object} nestedData - The full nested data object.
 * @returns {Array} - The processed nodes with all display properties.
 */
_prepareTreeNodes(nodes, nestedData) {
    if (!nodes) return [];
    const typeOrder = { group: 1, region: 2, location: 3, shop: 4, npc: 5 };
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const sortedNodes = [...nodes].sort((a, b) => {
        const typeA = typeOrder[a.type] || 99;
        const typeB = typeOrder[b.type] || 99;
        if (typeA !== typeB) return typeA - typeB;
        return a.name.localeCompare(b.name);
    });
      return sortedNodes.map(node => {
        const passesDisplayFilter = (node.type !== "npc") || (node.tag && this._showTreeNPCTags) || (!node.tag && this._showTreeNPCs);
        const shouldRender = passesDisplayFilter && (!hideByPermission || node.canView);
        if (!shouldRender) return null; 
        const children = this._getChildrenForMember(node, nestedData);
        const processedChildren = this._prepareTreeNodes(children, nestedData); 
        return {
            ...node,
            isSelected: this._selectedSheet?.uuid === node.uuid,
            isExpanded: this._expandedNodes.has(node.uuid),
            hasChildren: processedChildren.length > 0,
            isClickable: node.type !== "item",
            displayIcon: TemplateComponents.getAsset("icon", node.tag ? "tag" : node.type),
            children: processedChildren,
        };
    }).filter(Boolean);
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
        break;
      case "location":
        children.push(...(nestedData.shopsByLocation[member.uuid] || []));
        if (this._showTreeNPCs || this._showTreeNPCTags) {
          children.push(...(nestedData.npcsByLocation[member.uuid] || []));
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
        break;
    }

    return children.filter((child) => {
      const isViewable = !hideByPermission || child.canView;
      if (!isViewable) {
        return false; 
      }
      if (child.type !== "npc") {
        return true;
      }
      const isStandardNpc = child.type === "npc" && !child.tag;
      const isTaggedNpc = child.type === "npc" && child.tag === true;
      if (this._showTreeNPCs && isStandardNpc) {
        return true;
      }
      if (this._showTreeNPCTags && isTaggedNpc) {
        return true;
      }
      return false;
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
    const nestedData = data.nestedData;
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const hideInventoryByPermission = game.settings.get("campaign-codex", "hideInventoryByPermission");
    const sortAlpha = game.settings.get("campaign-codex", "sortCardsAlpha");
    const shopsForTemplate = [];
    for (const [shopUuid, items] of Object.entries(nestedData.itemsByShop)) {
        const shop = nestedData.allShops.find((s) => s.uuid === shopUuid);
        if (!shop || items.length === 0 || (hideByPermission && !shop.canView)) {
            continue;
        }
        let processedItems = hideInventoryByPermission
            ? items.filter(item => item.canView)
            : items;
        if (sortAlpha) {
            processedItems.sort((a, b) => a.name.localeCompare(b.name));
        }
        shopsForTemplate.push({
            ...shop,
            items: processedItems
        });
    }
    return await renderTemplate("modules/campaign-codex/templates/partials/group-tab-inventory.hbs", {
        shops: shopsForTemplate
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
    const visibleQuests = game.user.isGM ? docData.quests : docData.quests.filter(q => q.visible);
    const hideSection = !visibleQuests || visibleQuests.length === 0;
  return {
      name: doc.name,
      hide: hideSection,
      icon: TemplateComponents.getAsset("icon", docType),
      questListHtml: await TemplateComponents.questList(doc, docData.quests, game.user.isGM, true)
    };
  });

  const processedEntities = (await Promise.all(templateDataPromises)).filter(Boolean);
  return renderTemplate("modules/campaign-codex/templates/partials/group-tab-quests.hbs", {
    entities: processedEntities
  });
}


  // =========================================================================
  // Filtered NPC Tab Generation
  // =========================================================================


async _generateNPCsTab(data) {
  // 1. Prepare the list of unique NPCs
  const allAvailableNPCs = [
    ...data.nestedData.allNPCs, 
    ...(data.missingTaggedNpcs || [])
  ];
  const uniqueNpcs = [...new Map(allAvailableNPCs.map(npc => [npc.uuid, npc])).values()];
  const templateData = {
    filters: [
      { dataFilter: 'all',       title: localize("title.all"),        iconClass: 'fas fa-users',                  class: 'npcs-all active' },
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

  _onFilterChange(event) {
    const nativeElement = this.element instanceof jQuery ? this.element[0] : this.element;
    const filter = event.currentTarget.dataset.filter;
    const cards = nativeElement.querySelectorAll(".entity-card");

    nativeElement.querySelectorAll(".filter-btn").forEach((btn) => btn.classList.remove("active"));
    event.currentTarget.classList.add("active");

    cards.forEach((card) => {
      const cardFilter = card.dataset.filter;
    if (filter === "all" || (cardFilter && cardFilter.includes(filter))) {
        card.style.display = "flex";
      } else {
        card.style.display = "none";
      }
    });
  }

  // =========================================================================
async _generateLocationsTab(data) {
    const rawLocations = [...data.nestedData.allLocations, ...data.nestedData.allRegions];
    const sortAlpha = game.settings.get("campaign-codex", "sortCardsAlpha");
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    let processedLocations = hideByPermission 
        ? rawLocations.filter(loc => loc.canView) 
        : rawLocations;
    if (sortAlpha) {
        processedLocations.sort((a, b) => a.name.localeCompare(b.name));
    }
    processedLocations.forEach(location => {
        location.displayIcon = TemplateComponents.getAsset("icon", location.type === "region" ? "region" : "location");
    });
    return await renderTemplate("modules/campaign-codex/templates/partials/group-tab-locations.hbs", {
        locations: processedLocations
    });
}


  // =========================================================================
  // Event Handlers
  // =========================================================================

  async _onTagToggle(event) {
    const tagToggle = event.target.checked;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.tagToggle = tagToggle;
    await this.document.setFlag("campaign-codex", "data", currentData);
    
  }

  _calculateGroupStats(nestedData) {
    return {
      regions: nestedData.allRegions.length,
      locations: nestedData.allLocations.length,
      shops: nestedData.allShops.length,
      npcs: nestedData.allNPCs.length,
      items: nestedData.allItems.length,
    };
  }

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

    const existingMembers = await GroupLinkers.getGroupMembers(currentMembers);
    const nestedData = await GroupLinkers.getNestedData(existingMembers);
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

  async _onRemoveMember(event) {
    const memberUuid = event.currentTarget.dataset.sheetUuid;
    await this._saveFormData();

    const groupData = this.document.getFlag("campaign-codex", "data") || {};
    groupData.members = (groupData.members || []).filter((uuid) => uuid !== memberUuid);
    await this.document.setFlag("campaign-codex", "data", groupData);
    this._processedData = null;
    this.render(true);
    ui.notifications.info("Removed member from group");
  }

  _onToggleTreeNode(event) {
    event.preventDefault();
    event.stopPropagation();

    const expandIcon = event.currentTarget;
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

  _onExpandAll(event) {
    const nativeElement = this.element instanceof jQuery ? this.element[0] : this.element;
    nativeElement.querySelectorAll(".tree-node").forEach((el) => {
      const uuid = el.dataset.sheetUuid;
      if (uuid && el.querySelector(".tree-children")) {
        this._expandedNodes.add(uuid);
      }
    });
    this.render(false);
  }

  _onCollapseAll(event) {
    this._expandedNodes.clear();
    this.render(false);
  }

  _onFocusItem(event) {
    const uuid = event.currentTarget.dataset.sheetUuid;
  }

  _onTabChange(event) {
    event.preventDefault();
    const tab = event.currentTarget.dataset.tab;

    if (this._selectedSheet) {
      this._selectedSheet = null;
    }

    this._currentTab = tab;
    this.render(false);
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

  _onToggleTreeNPC(event) {
    event.preventDefault();
    this._showTreeNPCs = !this._showTreeNPCs;
    this.render(false);
  }

  _onToggleTreeNPCTags(event) {
    event.preventDefault();
    this._showTreeNPCTags = !this._showTreeNPCTags;
    this.render(false);
  }

  _onToggleTreeTags(event) {
    event.preventDefault();
    this._showTreeTags = !this._showTreeTags;
    this.render(false);
  }

  _onToggleTreeItems(event) {
    event.preventDefault();
    this._showTreeItems = !this._showTreeItems;
    this.render(false);
  }

  _onSelectSheet(event) {
    event.preventDefault();
    event.stopPropagation();
    if (
      event.target.classList.contains("expand-toggle") ||
      event.target.closest(".tree-actions") ||
      event.target.classList.contains("fa-chevron-right") ||
      event.target.classList.contains("fa-chevron-down")
    ) {
      return;
    }
    


    const treeNode = event.currentTarget.closest(".tree-node");
    const uuid = treeNode.dataset.sheetUuid;
    const type = treeNode.dataset.type;
    const name = event.currentTarget.textContent.trim();

    this._selectedSheet = { uuid, type, name };
    this._selectedSheetTab = "info";
    this.render(false);
  }

  _onCloseSelectedSheet(event) {
    event.preventDefault();
    this._selectedSheet = null;
    this._selectedSheetTab = "info";
    this._currentTab = "info";
    this.render(false);
  }

  _onSelectedSheetTabChange(event) {
    event.preventDefault();
    const tab = event.currentTarget.dataset.tab;
    this._selectedSheetTab = tab;
    this.render(false);
  }

  async _onOpenScene(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const docUuid = button.dataset.docUuid;
    if (!docUuid) return;
    const doc = await fromUuid(docUuid);
    if (!doc) {
      ui.notifications.error("Could not find the source document.");
      return;
    }
    await game.campaignCodex.openLinkedScene(doc);
  }

  async _onSendToPlayer(event) {
    event.stopPropagation();
    const button = event.currentTarget;
    const shopUuid = button.dataset.sheetUuid;
    const itemUuid = button.dataset.itemUuid;

    const shopDoc = await fromUuid(shopUuid);
    const itemDoc = await fromUuid(itemUuid);

    if (!shopDoc || !itemDoc) {
      ui.notifications.warn("Could not find the shop or item to send.");
      return;
    }

    TemplateComponents.createPlayerSelectionDialog(itemDoc.name, async (targetActor) => {
      await this._transferItemToActor(itemDoc, targetActor, shopDoc);
    });
  }

  // async _transferItemToActor(item, targetActor, shopDoc) {
  //   try {
  //     const itemData = item.toObject();
  //     delete itemData._id;

  //     const currentData = shopDoc.getFlag("campaign-codex", "data") || {};
  //     const inventory = currentData.inventory || [];
  //     const shopItem = inventory.find((i) => i.itemUuid === item.uuid);
  //     const quantity = shopItem ? shopItem.quantity : 1;

  //     itemData.system.quantity = Math.min(quantity, 1);

  //     await targetActor.createEmbeddedDocuments("Item", [itemData]);

  //     if (shopItem && shopItem.quantity > 1) {
  //       shopItem.quantity -= 1;
  //       await shopDoc.setFlag("campaign-codex", "data", currentData);
  //     } else {
  //       currentData.inventory = inventory.filter((i) => i.itemUuid !== item.uuid);
  //       await shopDoc.setFlag("campaign-codex", "data", currentData);
  //     }

  //     ui.notifications.info(`Sent "${item.name}" to ${targetActor.name}`);

  //     const targetUser = game.users.find((u) => u.character?.id === targetActor.id);
  //     if (targetUser && targetUser.active) {
  //       ChatMessage.create({
  //         content: `<p><strong>${game.user.name}</strong> sent you <strong>${item.name}</strong> from ${shopDoc.name}!</p>`,
  //         whisper: [targetUser.id],
  //       });
  //     }

  //     this.render(false);
  //   } catch (error) {
  //     console.error("Error transferring item:", error);
  //     ui.notifications.error("Failed to transfer item");
  //   }
  // }

  async _onDropSingleNPCToMapClick(event) {
    event.preventDefault();
    const sheetUuid = event.currentTarget.dataset.sheetUuid;
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
    if (data.type === "JournalEntry" || data.type === "JournalEntryPage") {
      const doc = await fromUuid(data.uuid);
      if (!doc) return;

      const journal = doc instanceof JournalEntryPage ? doc.parent : doc;
      const journalType = journal ? journal.getFlag("campaign-codex", "type") : undefined;

      const dropOnInfoTab = event.target.closest('.group-tab-panel[data-tab="info"]');

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
      }

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

  async _onDrop(event) {
    event.preventDefault();
    if (this._dropping) return;
    this._dropping = true;

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch (err) {
      this._dropping = false;
      return;
    }

    try {
      this._processedData = null;
      await this._handleDrop(data, event);
      this.render(true);
    } catch (error) {
      console.error("Campaign Codex | Error handling group drop:", error);
    } finally {
      this._dropping = false;
    }
  }

  _onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "link";
  }
}
