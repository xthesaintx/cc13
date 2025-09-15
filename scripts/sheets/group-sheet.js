import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { TemplateComponents } from "./template-components.js";
import { GroupLinkers } from "./group-linkers.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { promptForName } from "../helper.js";
import { localize, format } from "../helper.js";

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
    return { groupMembers, nestedData, treeTagNodes };
  }

  async getData() {
    const data = await super.getData();
    data.isGM = game.user.isGM;
    if (!this._processedData) {
      this._processedData = await this._processGroupData();
    }
    const { groupMembers, nestedData, treeTagNodes } = this._processedData;
    data.groupMembers = groupMembers;
    data.nestedData = nestedData;
    data.treeTagNodes = treeTagNodes;
    data.sheetType = "group";
    data.sheetTypeLabel = localize("names.group");
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
      { key: "journals", label: localize("names.journals"), icon: "fas fa-book", active: !this._selectedSheet && this._currentTab === "journals"},
      ...(game.user.isGM
        ? [
            {
              key: "notes",
              label: localize("names.note"),
              icon: "fas fa-sticky-note",
              active: this._currentTab === "notes",
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
          content: this._generateInfoTab(data),
        },
        {
          key: "npcs",
          active: this._currentTab === "npcs",
          content: await this._generateNPCsTab(data),
        },
        {
          key: "inventory",
          active: this._currentTab === "inventory",
          content: this._generateInventoryTab(data),
        },
        {
          key: "locations",
          active: this._currentTab === "locations",
          content: this._generateLocationsTab(data),
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
    let actorButtonHtml = "";
    if (this._selectedSheet.type === "npc" && selectedData.linkedActor && (await CampaignCodexBaseSheet.canUserView(selectedData.linkedActor))) {
      actorButtonHtml = `
<button type="button" class="btn-open-actor" data-actor-uuid="${selectedData.linkedActor}" title="${localize("title.open.actor")}">
          <i class="fas fa-user"></i>
        </button>
      `;
    }
    let dropButtonHtml = "";
    if (this._selectedSheet.type === "npc" && selectedData.linkedActor && canvas.scene && game.user.isGM) {
      dropButtonHtml = `
      <button type="button" class="refresh-btn btn-npc-to-scene" data-sheet-uuid="${this._selectedSheet.uuid}" title="${localize("message.drop")}">
        <i class="fas fa-street-view"></i>
      </button>
    `;
    }
    let sceneButtonHtml = "";
    if (
      (this._selectedSheet.type === "location" || this._selectedSheet.type === "region" || this._selectedSheet.type === "shop") &&
      selectedData.linkedScene &&
      (!hideByPermission || selectedData.linkedScene.canView)
    ) {
      sceneButtonHtml = `
      <button type="button" class="btn-open-scene" data-doc-uuid="${selectedDoc.uuid}" title="${format("message.open", { type: localize("names.scene") })}">
        <i class="fas fa-map"></i>
      </button>
        `;
    }

    let calculatedCounts = {};

    const subTabs = this._getSelectedSheetSubTabs(this._selectedSheet.type, selectedData, calculatedCounts);
    return `
      <div class="selected-sheet-container">
        <div class="selected-sheet-header">
          <div class="selected-sheet-info">
            <i class="${TemplateComponents.getAsset("icon", selectedData.tagMode ? "tag" : this._selectedSheet.type)}"></i> 
            <div class="selected-sheet-details">
              <h2>${this._selectedSheet.name}</h2>
            </div>
          ${await this._generateTagsContent(selectedData)}
          </div>
          <div class="selected-sheet-actions">
          ${dropButtonHtml}
          ${sceneButtonHtml}
          ${actorButtonHtml}
            <button type="button" class="btn-open-sheet" data-sheet-uuid="${this._selectedSheet.uuid}" title="${localize("title.open.sheet")}">
              <i class="fas fa-external-link-alt"></i>
            </button>
          </div>
        </div>

        <nav class="selected-sheet-tabs">
          ${subTabs
            .map(
              (tab) => `
            <div class="selected-sheet-tab ${tab.key === this._selectedSheetTab ? "active" : ""}" data-tab="${tab.key}">
              <i class="${tab.icon}"></i>
              <span>${tab.label}</span>
            </div>
          `,
            )
            .join("")}
        </nav>

        <div class="selected-sheet-content scrollable">
          ${await this._generateSelectedSheetContent(selectedDoc, selectedData, this._selectedSheetTab)}
        </div>
      </div>
    `;
  }
  _getSelectedSheetSubTabs(type, data, calculatedCounts = {}) {
    const baseTabs = [
      { key: "info", label: localize("names.information"), icon: "fas fa-info-circle" },
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
            label: data.tagMode ? localize("names.members") : localize("names.associates"),
            icon: "fas fa-users",
            count: (data.associates || []).length,
          },
          {
            key: "tags",
            label: localize("names.tags"),
            icon: "fas fa-user-tag",
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
            icon: "fas fa-user-tag",
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
            icon: "fas fa-user-tag",
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
            label: localize("names.npc"),
            icon: TemplateComponents.getAsset("icon", "npc"),
            count: calculatedCounts.totalNPCs ?? (data.linkedNPCs || []).length,
          },
          {
            key: "tags",
            label: localize("names.tags"),
            icon: "fas fa-user-tag",
          },
          {
            key: "shops",
            label: localize("names.shops"),
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
    if (this._selectedSheet.type === "location") {
      const [directNPCs, shopNPCs] = await Promise.all([
        CampaignCodexLinkers.getDirectNPCs(selectedDoc, selectedData.linkedNPCs || []),
        CampaignCodexLinkers.getShopNPCs(selectedDoc, selectedData.linkedShops || []),
      ]);

      const allNPCs = [...directNPCs, ...shopNPCs];

      const taggedNpcMap = allNPCs.reduce((acc, npc) => {
        if (npc.tag === true) {
          acc.set(npc.uuid, npc);
        }
        return acc;
      }, new Map());

      const taggedNPCs = [...taggedNpcMap.values()];
      if (taggedNPCs.length === 0) {
        return '<div class="selected-content-section"><p><em>No NPCs linked.</em></p></div>';
      }

      let content = `
        <div class="selected-content-section">
      `;

      if (taggedNPCs.length > 0) {
        content += `
          <div class="npc-section">
            <div class="npc-list">
               ${TemplateComponents.entityGrid(taggedNPCs, "associate", true, true)}
            </div>
          </div>
        `;
      }

      content += "</div>";
      return content;
    }

    const npcs = await CampaignCodexLinkers.getLinkedNPCs(selectedDoc, selectedData.linkedNPCs || []);
    const associates = await CampaignCodexLinkers.getAssociates(selectedDoc, selectedData.associates || []);
    const preparedNPCs = npcs;
    const preparedAssociates = associates;

    const preparedAllNPCs = [...preparedAssociates, ...preparedNPCs];
    const taggedNpcMap = preparedAllNPCs.reduce((acc, npc) => {
      if (npc.tag === true) {
        acc.set(npc.uuid, npc);
      }
      return acc;
    }, new Map());

    const taggedNPCs = [...taggedNpcMap.values()];

    if (taggedNPCs.length === 0) {
      return "";
    }

    return `
      <div class="selected-content-section">
        <div class="npc-list">
         ${TemplateComponents.entityGrid(taggedNPCs, "associate", true, true)}
        </div>
      </div>
    `;
  }

  async _generateSelectedNPCsContent(selectedDoc, selectedData) {
    const dropToMapBtn =
      canvas.scene && game.user.isGM
        ? `
        <button type="button" class="refresh-btn npcs-to-map-button" title="${format("button.droptoscene", { type: localize("names.npc") })}" data-sheet-uuid="${this._selectedSheet.uuid}">
          <i class="fas fa-street-view"></i></button>
      `
        : "";

    if (this._selectedSheet.type === "location" || "region") {
      const [directNPCs, shopNPCs] = await Promise.all([
        CampaignCodexLinkers.getDirectNPCs(selectedDoc, selectedData.linkedNPCs || []),
        CampaignCodexLinkers.getShopNPCs(selectedDoc, selectedData.linkedShops || []),
      ]);
      const allNPCs = [...directNPCs, ...shopNPCs];

      const categorized = allNPCs.reduce(
        (acc, npc) => {
          if (npc.tag === true) {
            acc.tagged.set(npc.uuid, npc);
          } else if (npc.source === "shop") {
            acc.untaggedShop.push(npc);
          } else {
            acc.untaggedDirect.push(npc);
          }
          return acc;
        },
        { tagged: new Map(), untaggedShop: [], untaggedDirect: [] },
      );

      const taggedNPCs = [...categorized.tagged.values()];
      const untaggedNPCsShop = categorized.untaggedShop;
      const untaggedNPCsDirect = categorized.untaggedDirect;
      const untaggedNPCs = [...untaggedNPCsDirect, ...untaggedNPCsShop];

      if (allNPCs.length === 0) {
        return '<div class="selected-content-section"><p><em>No NPCs linked.</em></p></div>';
      }

      let content = `
        <div class="selected-content-section">
          <div class="selected-actions">
            ${dropToMapBtn}
          </div>
      `;

      if (untaggedNPCsDirect.length > 0) {
        content += `
          <div class="npc-section">
            <div class="npc-list">
                ${TemplateComponents.entityGrid(untaggedNPCsDirect, "associate", true, true)}
            </div>
          </div>
        `;
      }

      if (untaggedNPCsShop.length > 0) {
        content += `
          <div class="npc-section">
            <h3 class="section-heading">
              <i class="${TemplateComponents.getAsset("icon", "shop")}"></i>
              ${localize("names.shops")} 
            </h3>
            <div class="npc-list">
               ${TemplateComponents.entityGrid(untaggedNPCsShop, "associate", true, true)}
            </div>
          </div>
        `;
      }

      content += "</div>";
      return content;
    }

    const npcs = await CampaignCodexLinkers.getLinkedNPCs(selectedDoc, selectedData.linkedNPCs || []);
    const preparedNPCs = npcs;

    const taggedNpcMap = preparedNPCs.reduce((acc, npc) => {
      if (!npc.tag) {
        acc.set(npc.uuid, npc);
      }
      return acc;
    }, new Map());

    const untaggedNPCs = [...taggedNpcMap.values()];

    if (untaggedNPCs.length === 0) {
      return "";
    }

    return `
      <div class="selected-content-section">
        <div class="selected-actions">
          ${dropToMapBtn}
        </div>
        <div class="npc-list">
               ${TemplateComponents.entityGrid(untaggedNPCs, "associate", true, true)}
        </div>
      </div>
    `;
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
    const associates = await CampaignCodexLinkers.getAssociates(selectedDoc, selectedData.associates || []);
    const preparedassociates = associates;
    const dropToMapBtn =
      canvas.scene && game.user.isGM
        ? `
          <div class="selected-actions">
          <button type="button" class="refresh-btn npcs-to-map-button" title="${format("button.droptoscene", { type: localize("names.npc") })}" data-sheet-uuid="${this._selectedSheet.uuid}">
          <i class="fas fa-street-view"></i></button></div>
      `
        : "";

    const taggedNpcMap = preparedassociates.reduce((acc, npc) => {
      if (!npc.tag) {
        acc.set(npc.uuid, npc);
      }
      return acc;
    }, new Map());

    const untaggedNPCs = [...taggedNpcMap.values()];

    if (untaggedNPCs.length === 0) {
      return "";
    }

    return `
      <div class="selected-content-section">
        ${dropToMapBtn}
        <div class="associates-list">
                ${TemplateComponents.entityGrid(untaggedNPCs, "associate", true, true)}
        </div>
      </div>
    `;
  }

  async _generateSelectedInventoryContent(selectedDoc, selectedData) {
    const inventory = await CampaignCodexLinkers.getInventory(selectedDoc, selectedData.inventory || []);

    if (inventory.length === 0) {
      return '<div class="selected-content-section"><p><em>No inventory items.</em></p></div>';
    }

    return `
      <div class="selected-content-section">
        <div class="inventory-list">
          ${inventory
            .map(
              (item) => `
            <div class="selected-inventory-item btn-open-sheet" data-sheet-uuid="${item.itemUuid}">
              <img src="${TemplateComponents.getAsset("image", "item", item.img)}" alt="${item.name}" class="item-icon">
              <div class="item-info">
                <h5>${item.name}</h5>
                <span class="item-price">${item.quantity}x ${item.finalPrice}${item.currency}</span>
              </div>
              <div class="item-actions">
                ${
                  game.user.isGM
                    ? `<button type="button" class="btn-send-to-player refresh-btn" data-sheet-uuid="${this._selectedSheet.uuid}" data-item-uuid="${item.itemUuid}" title="Send to Player">
                  <i class="fas fa-paper-plane"></i> </button>`
                    : ""
                }
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  // =========================================================================
  // Main Sheet Tree Generation
  // =========================================================================

  async _generateLeftPanel(groupMembers, nestedData, tagNodes) {
    const toggleClass = this._showTreeItems ? "active" : "";
    const toggleClassNPCTags = this._showTreeNPCTags ? "active" : "";
    const toggleClassNPC = this._showTreeNPCs ? "active" : "";
    const toggleClassTag = this._showTreeTags ? "active" : "";
    return `
      <div class="group-tree">
        <div class="tree-header">
          <button type="button" class="btn-expand-all" title="Expand All" style="width:32px">
            <i class="fas fa-expand-arrows-alt"></i>
          </button>
          <button type="button" class="btn-collapse-all" title="Collapse All" style="width:32px">
            <i class="fas fa-compress-arrows-alt"></i>
          </button>
          ${
            !this._showTreeTags
              ? `
          <button type="button" class="toggle-tree-items ${toggleClass}" title="Hide/Show Inventory Items" style="width:32px">
            <i class="fas fa-boxes"></i>
          </button>
          <button type="button" class="toggle-tree-npcs ${toggleClassNPC}" title="Hide/Show NPCs" style="width:32px">
            <i class="fas fa-user"></i>
          </button>
          <button type="button" class="toggle-tree-npctags ${toggleClassNPCTags}" title="Hide/Show Tags" style="width:32px">
            <i class="fas fa-user-tag"></i>
          </button>
                `
              : "<div></div><div></div><div></div>"
          }
          <button type="button" class="toggle-tree-tags ${toggleClassTag}" title="Tag Only Mode" style="width:32px">
            <i class="fas fa-tag"></i>
          </button>
        </div>
        <div class="tree-content scrollable">
          ${this._showTreeTags ? this._generateTreeTagNodes(tagNodes) : this._generateTreeNodes(groupMembers, nestedData)}
        </div>
      </div>
    `;
  }

  _generateTreeTagNodes(nodes) {
    if (!nodes || nodes.length === 0) return "";
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");

    const typeOrder = {
      tag: 1,
      group: 2,
      region: 3,
      location: 4,
      shop: 5,
      npc: 6,
      associate: 6, 
    };

    const filteredNodes = nodes.filter((child) => !hideByPermission || child.canView);

    const sortedNodes = [...filteredNodes].sort((a, b) => {
      const typeA = typeOrder[a.type] || 99; 
      const typeB = typeOrder[b.type] || 99; 

      if (typeA !== typeB) {
        return typeA - typeB;
      }

      return a.name.localeCompare(b.name);
    });

    return sortedNodes


      .map((node) => {
        const children = node.associates ? [...node.associates, ...node.locations, ...node.shops, ...node.regions] : [];
        const hasChildren = children.length > 0;
        const isSelected = this._selectedSheet && this._selectedSheet.uuid === node.uuid;
        const isExpanded = this._expandedNodes.has(node.uuid);
        const isClickable = true;
        const clickableClass = isClickable ? "clickable" : "";

        return `
      <div class="tree-node ${isSelected ? "selected" : ""}" data-type="${node.type}" data-sheet-uuid="${node.uuid}">
        <div class="tree-node-header ${hasChildren ? "expandable" : ""}">
          ${hasChildren ? `<i class="fas ${isExpanded ? "fa-chevron-down" : "fa-chevron-right"} expand-icon expand-toggle"></i>` : '<i class="tree-spacer"></i>'}
          <i class="${TemplateComponents.getAsset("icon", node.tag ? "tag" : node.type)} node-icon"" alt="${node.name}">&nbsp;</i>
          <span class="tree-label ${clickableClass}"> ${node.name}</span>
          <div class="tree-actions">
            <button type="button" class="btn-open-sheet" data-sheet-type="${node.type}" data-sheet-uuid="${node.uuid}" title="Open Sheet">
              <i class="fas fa-external-link-alt"></i>
            </button>
          </div>
        </div>
        ${
          hasChildren
            ? `
          <div class="tree-children" style="display: ${isExpanded ? "block" : "none"};">
            ${this._generateTreeTagNodes(children)}
          </div>`
            : ""
        }
      </div>
    `;
      })
      .join("");
  }

  _generateTreeNodes(nodes, nestedData) {


    if (!nodes) return "";

    const typeOrder = {
      group: 1,
      region: 2,
      location: 3,
      shop: 4,
      npc: 5,
    };

    const sortedNodes = [...nodes].sort((a, b) => {
      const typeA = typeOrder[a.type] || 99; 
      const typeB = typeOrder[b.type] || 99; 

      if (typeA !== typeB) {
        return typeA - typeB;
      }

      return a.name.localeCompare(b.name);
    });

    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");

    return sortedNodes
     .map((node) => {
      const passesDisplayFilter =
        (node.type !== "npc") ||
        (node.tag && this._showTreeNPCTags) ||
        (!node.tag && this._showTreeNPCs);

      // A node is only rendered if it passes BOTH the display filter AND the permission check.
      const shouldRender = passesDisplayFilter && (!hideByPermission || node.canView);

      // if (
      //   (node.type === "npc" && !this._showTreeNPCs) &&
      //   (node.tag && !this._showTreeNPCTags) 
      // ) {
      //   return ""; // If any condition is met, skip rendering this node.
      // }
        const children = this._getChildrenForMember(node, nestedData);
        const hasChildren = children && children.length > 0;
        const isSelected = this._selectedSheet && this._selectedSheet.uuid === node.uuid;
        const isExpanded = this._expandedNodes.has(node.uuid);
        const isClickable = node.type !== "item";
        const clickableClass = isClickable ? "clickable" : "";

        return shouldRender ?    
        // return (!hideByPermission || node.canView) ?
          ` 
        <div class="tree-node ${isSelected ? "selected" : ""}" data-type="${node.type}" data-sheet-uuid="${node.uuid}">
          <div class="tree-node-header ${hasChildren ? "expandable" : ""}">
            ${hasChildren ? `<i class="fas ${isExpanded ? "fa-chevron-down" : "fa-chevron-right"} expand-icon expand-toggle"></i>` : '<i class="tree-spacer"></i>'}
            <i class="${TemplateComponents.getAsset("icon", node.tag ? "tag" : node.type)} node-icon" alt="${node.name}">&nbsp;</i>
            <span class="tree-label ${clickableClass}"> ${node.name}</span>
            <div class="tree-actions">
              ${
                game.user.isGM
                  ? `<button type="button" class="btn-remove-member" data-sheet-uuid="${node.uuid}" title="Remove from Group">
                <i class="fas fa-times"></i>
              </button>`
                  : ""
              }
            </div>
            <div class="tree-actions">
              <button type="button" class="btn-open-sheet" data-sheet-uuid="${node.uuid}" title="Open Sheet">
                <i class="fas fa-external-link-alt"></i>
              </button>
            </div>
          </div>
          ${
            hasChildren
              ? `
            <div class="tree-children" style="display: ${isExpanded ? "block" : "none"};">
              ${this._generateTreeNodes(children, nestedData)}
            </div>
          `
              : ""
          }
        </div>
      `:"";
       
      })
      .join("");
  }

  _getChildrenForMember(member, nestedData) {
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    let children = [];
    switch (member.type) {
      case "group":
        children.push(...(nestedData.membersByGroup[member.uuid] || []));
        break;
      case "region":
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


    // return children.filter((child) => {
    //   if (this._showTreeNPCTags){
    //     const isTaggedNpc = (child.type === "npc" && child.tag === true);
    //     const isViewable = !hideByPermission || child.canView;
    //     return isTaggedNpc && isViewable;
    //   }
    //   const isNotTaggedNpc = !(child.type === "npc" && child.tag === true);
    //   const isViewable = !hideByPermission || child.canView;
    //   return isNotTaggedNpc && isViewable;
    // });
  }

  // =========================================================================
  // Main Sheet Tab Generation
  // =========================================================================

  _generateInfoTab(data) {
        const standardJournalGrid = TemplateComponents.standardJournalGrid(data.linkedStandardJournals);

    return `


      <div class="form-section" style="margin-bottom: 48px; display:none;">
        ${game.user.isGM ? `${TemplateComponents.dropZone("member", "fas fa-plus-circle", "", "")}` : ""}
      </div>
     ${TemplateComponents.richTextSection(this.document, data.sheetData.enrichedDescription, "description", data.isOwnerOrHigher)}
    `;
  }

  _generateInventoryTab(data) {
    return `
      <div class="inventory-by-shop">
        ${this._generateInventoryByShop(data.nestedData)}
      </div>
    `;
  }

  _generateLocationsTab(data) {
    const locReg = [...data.nestedData.allLocations, ...data.nestedData.allRegions];

    return `
      <div class="locations-grid">
       ${this._generateLocationCards(locReg)}
      </div>
    `;
  }

  // =========================================================================
  // Filtered NPC Tab Generation
  // =========================================================================

  async _generateNPCsTab(data) {
    const preparedNPCs = data.nestedData.allNPCs;

    return `
    
      <div class="npc-filters">
        <button type="button" class="filter-btn refresh-btn npcs-all active" data-filter="all" title="${localize("title.all")}"><i class="fas fa-users"></i></button>
        <button type="button" class="filter-btn refresh-btn npcs-location" data-filter="location" title="${localize("names.location")}"><i class="${TemplateComponents.getAsset("icon", "location")}"></i></button>
        <button type="button" class="filter-btn refresh-btn npcs-shop" data-filter="shop" title="${localize("names.shop")}"><i class="${TemplateComponents.getAsset("icon", "shop")}"></i></button>
        <button type="button" class="filter-btn refresh-btn npcs-tag" data-filter="tag" title="${localize("names.tag")}"><i class="fas fa-user-tag"></i></button>
        <button type="button" class="filter-btn refresh-btn npcs-player" data-filter="character" title="${localize("names.player")}"><i class="fas fa-user-secret"></i></button>
      </div>
      
      <div class="npc-grid-container">
        ${await this._generateNPCCards(preparedNPCs)}
      </div>
    `;
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

  _generateLocationCards(locations) {
    const locationCards = game.settings.get("campaign-codex", "sortCardsAlpha");
    const locationstoRender = locationCards ? [...locations].sort((a, b) => a.name.localeCompare(b.name)) : locations;
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    return locationstoRender
      .map((location) =>
        hideByPermission && !location.canView
          ? ""
          : `
        <div class="group-location-card" data-sheet-uuid="${location.uuid}">
        <div class="location-image">
          <img class="card-image-clickable" data-sheet-uuid="${location.uuid}" src="${TemplateComponents.getAsset("image", location.type, location.img)}" alt="${location.name}">
        </div>
        <div class="location-info">
          <h4 class="location-name"><i class="${TemplateComponents.getAsset("icon", location.type === "region" ? "region" : "location")}"></i> ${location.name}</h4>
          ${
            location.region
              ? `
            <div class="entity-locations">
              <i class="${TemplateComponents.getAsset("icon", "region")}"></i>
              <span class="location-tag">${location.region}</span>
            </div>
            `
              : ""
          }
          ${
            location.shops && location.shops.length > 0
              ? `
            <div class="entity-locations shop-tags">
              <i class="${TemplateComponents.getAsset("icon", "shop")}"></i>
              ${location.shops.map((shop) => `<span class="location-tag shop-tag">${shop}</span>`).join("")}
            </div>
          `
              : ""
          }
          ${
            location.tags && location.tags.length > 0
              ? `
            <div class="entity-locations tag-mode-tags">
              <i class="fas fa-tag"></i>
              ${location.tags.map((tag) => `<span class="location-tag tag-mode">${tag}</span>`).join("")}
            </div>
          `
              : ""
          }  
          ${
            location.npcs && location.npcs.length > 0
              ? `
            <div class="entity-locations tag-mode-tags">
              <i class="${TemplateComponents.getAsset("icon", "npc")}"></i>
              ${location.npcs.map((npc) => `<span class="location-tag">${npc}</span>`).join("")}
            </div>
          `
              : ""
          }              
        </div>
      </div>`,
      )
      .join("");
  }

  _generateInventoryByShop(nestedData) {
    let html = "";
    const hideInventoryByPermission = game.settings.get("campaign-codex", "hideInventoryByPermission");
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");

    for (const [shopUuid, items] of Object.entries(nestedData.itemsByShop)) {
      const shop = nestedData.allShops.find((s) => s.uuid === shopUuid);
      if (!shop || items.length === 0) continue;

      const itemCards = game.settings.get("campaign-codex", "sortCardsAlpha");
      const itemCardstoRender = itemCards ? [...items].sort((a, b) => a.name.localeCompare(b.name)) : items;

      html +=
        hideByPermission && !shop.canView
          ? ""
          : `
        <div class="shop-inventory-section">
          <div class="shop-header btn-open-sheet" data-sheet-uuid="${shopUuid}">
            <img src="${TemplateComponents.getAsset("image", shop.type, shop.img)}" alt="${shop.name}" class="shop-icon">
            <div class="shop-info">
              <h4 class="shop-name">${shop.name}</h4>
              ${shop?.tags.length > 0 ? `<i class="fas fa-tag"></i> ` : ""}${shop?.tags.map((tag) => `<span class="location-tag tag-mode">${tag}</span>`).join("")}
            </div>
          </div>
          
          <div class="shop-items">
            ${itemCardstoRender
              .map((item) =>
                hideInventoryByPermission && !item.canView
                  ? ""
                  : `
              <div class="group-item-card btn-open-sheet" data-sheet-uuid="${item.uuid}">
                <img src="${TemplateComponents.getAsset("image", "item", item.img)}" alt="${item.name}" class="item-icon">
                <div class="item-info">
                  <span class="item-name">${item.name}</span>
                  <span class="item-price">${item.quantity}x ${item.finalPrice}${item.currency}</span>
                </div>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      `;
    }

    return html;
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
      ui.notifications.warn();
      return;
    }

    const newMemberDoc = await fromUuid(newMemberUuid);
    if (!newMemberDoc) {
      ui.notifications.error(localize("group.self"));
      return;
    }

    if (newMemberDoc.getFlag("campaign-codex", "type") === "group.notfound") {
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

  async _transferItemToActor(item, targetActor, shopDoc) {
    try {
      const itemData = item.toObject();
      delete itemData._id;

      const currentData = shopDoc.getFlag("campaign-codex", "data") || {};
      const inventory = currentData.inventory || [];
      const shopItem = inventory.find((i) => i.itemUuid === item.uuid);
      const quantity = shopItem ? shopItem.quantity : 1;

      itemData.system.quantity = Math.min(quantity, 1);

      await targetActor.createEmbeddedDocuments("Item", [itemData]);

      if (shopItem && shopItem.quantity > 1) {
        shopItem.quantity -= 1;
        await shopDoc.setFlag("campaign-codex", "data", currentData);
      } else {
        currentData.inventory = inventory.filter((i) => i.itemUuid !== item.uuid);
        await shopDoc.setFlag("campaign-codex", "data", currentData);
      }

      ui.notifications.info(`Sent "${item.name}" to ${targetActor.name}`);

      const targetUser = game.users.find((u) => u.character?.id === targetActor.id);
      if (targetUser && targetUser.active) {
        ChatMessage.create({
          content: `<p><strong>${game.user.name}</strong> sent you <strong>${item.name}</strong> from ${shopDoc.name}!</p>`,
          whisper: [targetUser.id],
        });
      }

      this.render(false);
    } catch (error) {
      console.error("Error transferring item:", error);
      ui.notifications.error("Failed to transfer item");
    }
  }

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
