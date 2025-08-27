import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { TemplateComponents } from "./template-components.js";
import { GroupLinkers } from "./group-linkers.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { promptForName } from "../helper.js";

export class GroupSheet extends CampaignCodexBaseSheet {
  constructor(document, options = {}) {
    super(document, options);
    this._selectedSheet = null;
    this._selectedSheetTab = "info";
    this._expandedNodes = new Set();
    this._showTreeItems = false;
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

  async getData() {
    const data = await super.getData();
    const groupData = this.document.getFlag("campaign-codex", "data") || {};
    data.isGM = game.user.isGM;

    data.groupMembers = await GroupLinkers.getGroupMembers(
      groupData.members || [],
    );
    data.nestedData = await GroupLinkers.getNestedData(data.groupMembers);
    data.sheetType = "group";
    data.sheetTypeLabel = "Group Overview";
    data.customImage =
      this.document.getFlag("campaign-codex", "image") ||
      TemplateComponents.getAsset("image", "group");
    data.leftPanel = this._generateLeftPanel(
      data.groupMembers,
      data.nestedData,
    );

    data.tabs = [
      {
        key: "info",
        label: "Overview",
        icon: "fas fa-info-circle",
        active: !this._selectedSheet && this._currentTab === "info",
      },
      {
        key: "npcs",
        label: "NPCs",
        icon: TemplateComponents.getAsset("icon", "npc"),
        active: !this._selectedSheet && this._currentTab === "npcs",
        statistic: { value: data.nestedData.allNPCs.length },
      },
      {
        key: "inventory",
        label: "Inventory",
        icon: "fas fa-boxes",
        active: !this._selectedSheet && this._currentTab === "inventory",
        statistic: { value: data.nestedData.allItems.length },
      },
      {
        key: "locations",
        label: "Locations",
        icon: TemplateComponents.getAsset("icon", "location"),
        active: !this._selectedSheet && this._currentTab === "locations",
        statistic: { value: data.nestedData.allLocations.length },
      },
      ...(game.user.isGM
        ? [
            {
              key: "notes",
              label: "Notes",
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
        {
          key: "notes",
          active: this._currentTab === "notes",
          content: CampaignCodexBaseSheet.generateNotesTab(data),
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

    nativeHtml
      .querySelectorAll(".expand-toggle")
      .forEach((element) =>
        element.addEventListener("click", this._onToggleTreeNode.bind(this)),
      );
    nativeHtml
      .querySelector(".btn-expand-all")
      ?.addEventListener("click", this._onExpandAll.bind(this));
    nativeHtml
      .querySelector(".btn-collapse-all")
      ?.addEventListener("click", this._onCollapseAll.bind(this));
    nativeHtml
      .querySelectorAll(".tree-label.clickable")
      .forEach((element) =>
        element.addEventListener("click", this._onSelectSheet.bind(this)),
      );
    nativeHtml
      .querySelector(".toggle-tree-items")
      ?.addEventListener("click", this._onToggleTreeItems.bind(this));

    nativeHtml
      .querySelectorAll(".selected-sheet-tab")
      .forEach((element) =>
        element.addEventListener(
          "click",
          this._onSelectedSheetTabChange.bind(this),
        ),
      );
    nativeHtml
      .querySelector(".btn-close-selected")
      ?.addEventListener("click", this._onCloseSelectedSheet.bind(this));

    nativeHtml
      .querySelector(".btn-open-scene")
      ?.addEventListener("click", this._onOpenScene.bind(this));

    nativeHtml
      .querySelectorAll(".btn-open-sheet")
      .forEach((element) =>
        element.addEventListener("click", (e) =>
          this._onOpenDocument(e, "sheet"),
        ),
      );
    nativeHtml
      .querySelectorAll(".btn-open-actor")
      .forEach((element) =>
        element.addEventListener("click", (e) =>
          this._onOpenDocument(e, "actor"),
        ),
      );
    nativeHtml
      .querySelectorAll(".group-location-card")
      .forEach((element) =>
        element.addEventListener("click", (e) =>
          this._onOpenDocument(e, "sheet"),
        ),
      );
    nativeHtml.querySelectorAll(".card-image-clickable").forEach((element) =>
      element.addEventListener("click", (e) => {
        e.stopPropagation();
        this._onOpenDocument(e, "sheet");
      }),
    );

    nativeHtml
      .querySelectorAll(".btn-remove-member")
      .forEach((element) =>
        element.addEventListener("click", this._onRemoveMember.bind(this)),
      );
    nativeHtml
      .querySelectorAll(".btn-focus-item")
      .forEach((element) =>
        element.addEventListener("click", this._onFocusItem.bind(this)),
      );

    nativeHtml
      .querySelectorAll(".filter-btn")
      .forEach((element) =>
        element.addEventListener("click", this._onFilterChange.bind(this)),
      );

    nativeHtml
      .querySelectorAll(".group-tab")
      .forEach((element) =>
        element.addEventListener("click", this._onTabChange.bind(this)),
      );

    nativeHtml
      .querySelectorAll(".btn-send-to-player")
      .forEach((element) =>
        element.addEventListener("click", this._onSendToPlayer.bind(this)),
      );
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

  // ADD to v13
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
  //

  async _generateSelectedSheetTab() {
    if (!this._selectedSheet) return "";

    const selectedDoc = await fromUuid(this._selectedSheet.uuid);
    if (!selectedDoc) {
      this._selectedSheet = null;
      return "<p>Selected sheet not found. Please re-select from the tree.</p>";
    }

    const selectedData = selectedDoc.getFlag("campaign-codex", "data") || {};

    let actorButtonHtml = "";
    if (this._selectedSheet.type === "npc" && selectedData.linkedActor) {
      actorButtonHtml = `
      <button type="button" class="btn-open-actor" data-actor-uuid="${selectedData.linkedActor}" title="Open Actor Sheet">
        <i class="fas fa-user"></i>
      </button>
    `;
    }
    // ADD to v13
    let sceneButtonHtml = "";
    if (
      (this._selectedSheet.type === "location" ||
        this._selectedSheet.type === "region" ||
        this._selectedSheet.type === "shop") &&
      selectedData.linkedScene
    ) {
      sceneButtonHtml = `
      <button type="button" class="btn-open-scene" data-doc-uuid="${selectedDoc.uuid}" title="Open Scene">
        <i class="fas fa-map"></i>
      </button>
        `;
    }
    //

    let calculatedCounts = {};
    if (this._selectedSheet.type === "location") {
      const directNPCs = await CampaignCodexLinkers.getDirectNPCs(
        selectedDoc,
        selectedData.linkedNPCs || [],
      );
      const shopNPCs = await CampaignCodexLinkers.getShopNPCs(
        selectedDoc,
        selectedData.linkedShops || [],
      );
      calculatedCounts.totalNPCs = directNPCs.length + shopNPCs.length;
    }

    const subTabs = this._getSelectedSheetSubTabs(
      this._selectedSheet.type,
      selectedData,
      calculatedCounts,
    );

    return `
      <div class="selected-sheet-container">
        <div class="selected-sheet-header">
          <div class="selected-sheet-info">
            <i class="${TemplateComponents.getAsset("icon", this._selectedSheet.type)}"></i> 
            <div class="selected-sheet-details">
              <h2>${this._selectedSheet.name}</h2>
            </div>
          </div>
          <div class="selected-sheet-actions">
          ${sceneButtonHtml}
          ${actorButtonHtml}
            <button type="button" class="btn-open-sheet" data-sheet-uuid="${this._selectedSheet.uuid}" title="Open Full Sheet">
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
              ${tab.count !== undefined ? `<span class="tab-count">(${tab.count})</span>` : ""}
            </div>
          `,
            )
            .join("")}
        </nav>

        <div class="selected-sheet-content">
          ${await this._generateSelectedSheetContent(selectedDoc, selectedData, this._selectedSheetTab)}
        </div>
      </div>
    `;
  }

  _getSelectedSheetSubTabs(type, data, calculatedCounts = {}) {
    const baseTabs = [
      { key: "info", label: "Information", icon: "fas fa-info-circle" },
      ...(game.user.isGM
        ? [{ key: "notes", label: "GM Notes", icon: "fas fa-sticky-note" }]
        : []),
    ];

    switch (type) {
      case "npc":
        baseTabs.splice(1, 0, {
          key: "associates",
          label: "Associates",
          icon: "fas fa-users",
          count: (data.associates || []).length,
        });
        break;

      case "shop":
        baseTabs.splice(
          1,
          0,
          {
            key: "npcs",
            label: "NPCs",
            icon: TemplateComponents.getAsset("icon", "npc"),
            count: (data.linkedNPCs || []).length,
          },
          {
            key: "inventory",
            label: "Inventory",
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
            label: "NPCs",
            icon: TemplateComponents.getAsset("icon", "npc"),
            count: calculatedCounts.totalNPCs ?? (data.linkedNPCs || []).length,
          },
          {
            key: "shops",
            label: "Entries",
            icon: TemplateComponents.getAsset("icon", "shop"),
            count: (data.linkedShops || []).length,
          },
        );
        break;

      case "region":
        baseTabs.splice(1, 0, {
          key: "locations",
          label: "Locations",
          icon: TemplateComponents.getAsset("icon", "location"),
          count: (data.linkedLocations || []).length,
        });
        break;
    }

    return baseTabs;
  }

  async _generateSelectedSheetContent(selectedDoc, selectedData, activeTab) {
    const enrichedDescription =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        selectedData.description || "",
        {
          async: true,
          secrets: selectedDoc.isOwner,
        },
      );
    const systemClass = game.system.id === "dnd5e" ? " dnd5e" : "";
    const journalClass =
      game.system.id === "dnd5e" ? " journal-entry-content" : "";
    const enrichedNotes =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        selectedData.notes || "",
        {
          async: true,
          secrets: selectedDoc.isOwner,
        },
      );

    switch (activeTab) {
      case "info":
        return this._generateSelectedInfoContent(
          selectedDoc,
          selectedData,
          enrichedDescription,
        );

      case "npcs":
        return await this._generateSelectedNPCsContent(
          selectedDoc,
          selectedData,
        );

      case "associates":
        return await this._generateSelectedAssociatesContent(
          selectedDoc,
          selectedData,
        );

      case "inventory":
        return await this._generateSelectedInventoryContent(
          selectedDoc,
          selectedData,
        );

      case "shops":
        return await this._generateSelectedShopsContent(
          selectedDoc,
          selectedData,
        );

      case "locations":
        return await this._generateSelectedLocationsContent(
          selectedDoc,
          selectedData,
        );

      case "notes":
        return `
          <article class="selected-content-section cc-enriched cc-hidden-secrets${systemClass}">
           <section class="rich-text-content journal-entry-content" name="cc.secret.content.notes">
              ${enrichedNotes || "<p><em>No GM notes available.</em></p>"}
            </section>
            </article>
        `;

      default:
        return "<p>Content not available.</p>";
    }
  }

  async _generateSelectedNPCsContent(selectedDoc, selectedData) {
    if (this._selectedSheet.type === "location") {
      const directNPCs = await CampaignCodexLinkers.getDirectNPCs(
        selectedDoc,
        selectedData.linkedNPCs || [],
      );
      const shopNPCs = await CampaignCodexLinkers.getShopNPCs(
        selectedDoc,
        selectedData.linkedShops || [],
      );
      const allNPCs = [...directNPCs, ...shopNPCs];

      if (allNPCs.length === 0) {
        return '<div class="selected-content-section"><p><em>No NPCs linked.</em></p></div>';
      }

      const dropToMapBtn =
        canvas.scene && game.user.isGM
          ? `
        <button type="button" class="refresh-btn npcs-to-map-button" data-sheet-uuid="${this._selectedSheet.uuid}">
          <i class="fas fa-map"></i> Drop Direct NPCs to Map
        </button>
      `
          : "";

      let content = `
        <div class="selected-content-section">
          <div class="selected-actions">
            ${dropToMapBtn}
          </div>
      `;

      if (directNPCs.length > 0) {
        content += `
          <div class="npc-section">
            <h4 style="color: var(--cc-main-text); font-size: 16px; font-weight: 600; margin: 16px 0 12px 0; border-bottom: 1px solid #dee2e6; padding-bottom: 4px;">
              <i class="fas fa-user" style="color: var(--cc-accent); margin-right: 8px;"></i>
              Direct NPCs (${directNPCs.length})
            </h4>
            <div class="npc-list">
              ${directNPCs
                .map(
                  (npc) => `
                <div class="selected-npc-card">
                  <img src="${TemplateComponents.getAsset("image", "npc", npc.img)}" alt="${npc.name}" class="npc-avatar">
                  <div class="npc-info">
                    <h5>${npc.name}</h5>
                    ${npc.actor ? `<span class="npc-type">${npc.actor.type}</span>` : ""}
                  </div>
                  <div class="npc-actions">
                    <button type="button" class="btn-open-sheet" data-sheet-uuid="${npc.uuid}" title="Open NPC Sheet">
                      <i class="fas fa-external-link-alt"></i>
                    </button>
                    ${
                      npc.actor
                        ? `
                      <button type="button" class="btn-open-actor" data-actor-uuid="${npc.actor.uuid}" title="Open Actor Sheet">
                        <i class="fas fa-user"></i>
                      </button>
                    `
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

      if (shopNPCs.length > 0) {
        content += `
          <div class="npc-section">
            <h4 style="color: var(--cc-main-text); font-size: 16px; font-weight: 600; margin: 16px 0 12px 0; border-bottom: 1px solid #dee2e6; padding-bottom: 4px;">
              <i class="fas fa-book-open" style="color: var(--cc-accent); margin-right: 8px;"></i>
              Entry NPCs (${shopNPCs.length})
            </h4>
            <div class="npc-list">
              ${shopNPCs
                .map(
                  (npc) => `
                <div class="selected-npc-card">
                  <img src="${TemplateComponents.getAsset("image", "npc", npc.img)}" alt="${npc.name}" class="npc-avatar">
                  <div class="npc-info">
                    <h5>${npc.name}</h5>
                    ${npc.actor ? `<span class="npc-type">${npc.actor.type}</span>` : ""}
                    <div class="npc-source-info" style="font-size: 11px; color: #6c757d; font-style: italic;">
                      ${npc.shops && npc.shops.length > 0 ? `From: ${npc.shops.join(", ")}` : ""}
                    </div>
                  </div>
                  <div class="npc-actions">
                    <button type="button" class="btn-open-sheet" data-sheet-uuid="${npc.uuid}" title="Open NPC Sheet">
                      <i class="fas fa-external-link-alt"></i>
                    </button>
                    ${
                      npc.actor
                        ? `
                      <button type="button" class="btn-open-actor" data-actor-uuid="${npc.actor.uuid}" title="Open Actor Sheet">
                        <i class="fas fa-user"></i>
                      </button>
                    `
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

      content += "</div>";
      return content;
    }

    const npcs = await CampaignCodexLinkers.getLinkedNPCs(
      selectedDoc,
      selectedData.linkedNPCs || [],
    );

    if (npcs.length === 0) {
      return '<div class="selected-content-section"><p><em>No NPCs linked.</em></p></div>';
    }

    const dropToMapBtn =
      canvas.scene && game.user.isGM
        ? `
      <button type="button" class="npcs-to-map-button" data-sheet-uuid="${this._selectedSheet.uuid}">
        <i class="fas fa-map"></i> Drop NPCs to Map
      </button>
    `
        : "";

    return `
      <div class="selected-content-section">
        <div class="selected-actions">
          ${dropToMapBtn}
        </div>
        
        <div class="npc-list">
          ${npcs
            .map(
              (npc) => `
            <div class="selected-npc-card">
              <img src="${TemplateComponents.getAsset("image", "npc", npc.img)}" alt="${npc.name}" class="npc-avatar">
              <div class="npc-info">
                <h5>${npc.name}</h5>
                ${npc.actor ? `<span class="npc-type">${npc.actor.type}</span>` : ""}
              </div>
              <div class="npc-actions">
                <button type="button" class="btn-open-sheet" data-sheet-uuid="${npc.uuid}" title="Open NPC Sheet">
                  <i class="fas fa-external-link-alt"></i>
                </button>
                ${
                  npc.actor
                    ? `
                  <button type="button" class="btn-open-actor" data-actor-uuid="${npc.actor.uuid}" title="Open Actor Sheet">
                    <i class="fas fa-user"></i>
                  </button>
                `
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

  async _generateSelectedShopsContent(selectedDoc, selectedData) {
    const shops = await CampaignCodexLinkers.getLinkedShops(
      selectedDoc,
      selectedData.linkedShops || [],
    );

    if (shops.length === 0) {
      return '<div class="selected-content-section"><p><em>No entries linked.</em></p></div>';
    }

    return `
      <div class="selected-content-section">
        <div class="shops-list">
          ${shops
            .map(
              (shop) => `
            <div class="selected-shop-card">
              <img src="${TemplateComponents.getAsset("image", "shop", shop.img)}" alt="${shop.name}" class="shop-icon">
              <div class="shop-info">
                <h5>${shop.name}</h5>
              </div>
              <div class="shop-actions">
                <button type="button" class="btn-open-sheet" data-sheet-uuid="${shop.uuid}" title="Open Entry Sheet">
                  <i class="fas fa-external-link-alt"></i>
                </button>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  async _generateSelectedLocationsContent(selectedDoc, selectedData) {
    const locations = await CampaignCodexLinkers.getLinkedLocations(
      selectedDoc,
      selectedData.linkedLocations || [],
    );

    if (locations.length === 0) {
      return '<div class="selected-content-section"><p><em>No locations linked.</em></p></div>';
    }

    return `
      <div class="selected-content-section">
        <div class="locations-list">
          ${locations
            .map(
              (location) => `
            <div class="selected-location-card">
              <img src="${TemplateComponents.getAsset("image", "location", location.img)}" alt="${location.name}" class="location-icon">
              <div class="location-info">
                <h5>${location.name}</h5>
              </div>
              <div class="location-actions">
                <button type="button" class="btn-open-sheet" data-sheet-uuid="${location.uuid}" title="Open Location Sheet">
                  <i class="fas fa-external-link-alt"></i>
                </button>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  async _generateSelectedInfoContent(
    selectedDoc,
    selectedData,
    enrichedDescription,
  ) {
    const systemClass = game.system.id === "dnd5e" ? " dnd5e2" : "";
    const journalClass =
      game.system.id === "dnd5e" ? " journal-entry-content dnd5e2 themed theme-light" : "";
    // Journal
    const tabJournal = await fromUuid(selectedData.linkedStandardJournal);
    // console.log(tabJournal);
    let standardJournalSection = ``;
    if (tabJournal) {
      standardJournalSection = `
        <div class="scene-info" style="margin-top:-24px;margin-bottom: 24px; height:40px">
        <span class="scene-name open-journal" data-journal-uuid="${tabJournal.uuid}" title="Open Journal">
          <i class="fas fa-book"></i> Journal: ${tabJournal.name}</span>
        </div>
      `;
    }

    return `
      <article class="selected-content-section cc-enriched">${standardJournalSection}
        <section class="description-section journal-entry-page cc-secret-content cc-hidden-secrets${systemClass}"  name="cc.secret.content.description" document-uuid="${selectedDoc.uuid}">

          <h4><i class="fas fa-align-left"></i> Description</h4>
          <div class="rich-text-content journal-page-content">
            ${enrichedDescription || "<p><em>No description available.</em></p>"}
          </div>
        </section>
      </article>
    `;
  }

  async _generateSelectedAssociatesContent(selectedDoc, selectedData) {
    const associates = await CampaignCodexLinkers.getAssociates(
      selectedDoc,
      selectedData.associates || [],
    );

    if (associates.length === 0) {
      return '<div class="selected-content-section"><p><em>No associates linked.</em></p></div>';
    }

    return `
      <div class="selected-content-section">
        <div class="associates-list">
          ${associates
            .map(
              (associate) => `
            <div class="selected-associate-card">
              <img src="${TemplateComponents.getAsset("image", "npc", associate.img)}" alt="${associate.name}" class="associate-avatar">
              <div class="associate-info">
                <h5>${associate.name}</h5>
                <span class="associate-relationship">${associate.relationship || "Associate"}</span>
              </div>
              <div class="associate-actions">
                <button type="button" class="btn-open-sheet" data-sheet-uuid="${associate.uuid}" title="Open Associate Sheet">
                  <i class="fas fa-external-link-alt"></i>
                </button>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  async _generateSelectedInventoryContent(selectedDoc, selectedData) {
    const inventory = await CampaignCodexLinkers.getInventory(
      selectedDoc,
      selectedData.inventory || [],
    );

    if (inventory.length === 0) {
      return '<div class="selected-content-section"><p><em>No inventory items.</em></p></div>';
    }

    return `
      <div class="selected-content-section">
        <div class="inventory-list">
          ${inventory
            .map(
              (item) => `
            <div class="selected-inventory-item">
              <img src="${TemplateComponents.getAsset("image", "item", item.img)}" alt="${item.name}" class="item-icon">
              <div class="item-info">
                <h5>${item.name}</h5>
                <span class="item-price">${item.quantity}x ${item.finalPrice}${item.currency}</span>
              </div>
              <div class="item-actions">
                ${
                  game.user.isGM
                    ? `<button type="button" class="btn-send-to-player" data-sheet-uuid="${this._selectedSheet.uuid}" data-item-uuid="${item.itemUuid}" title="Send to Player">
                  <i class="fas fa-paper-plane"></i> </button>`
                    : ""
                }
                <button type="button" class="btn-open-sheet" data-sheet-uuid="${item.itemUuid}" title="Open Item">
                  <i class="${TemplateComponents.getAsset("icon", "item")}"></i> </button>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
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

    TemplateComponents.createPlayerSelectionDialog(
      itemDoc.name,
      async (targetActor) => {
        await this._transferItemToActor(itemDoc, targetActor, shopDoc);
      },
    );
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
        currentData.inventory = inventory.filter(
          (i) => i.itemUuid !== item.uuid,
        );
        await shopDoc.setFlag("campaign-codex", "data", currentData);
      }

      ui.notifications.info(`Sent "${item.name}" to ${targetActor.name}`);

      const targetUser = game.users.find(
        (u) => u.character?.id === targetActor.id,
      );
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

  async _onDropNPCsToMapClick(event) {
    event.preventDefault();

    const sheetUuid = event.currentTarget.dataset.sheetUuid;
    if (!sheetUuid) {
      const data = await this.getData();
      if (data.nestedData.allNPCs && data.nestedData.allNPCs.length > 0) {
        await this._onDropNPCsToMap(data.nestedData.allNPCs, {
          title: `Drop ${this.document.name} NPCs to Map`,
        });
      } else {
        ui.notifications.warn("No NPCs with linked actors found to drop!");
      }
      return;
    }

    try {
      const selectedDoc = await fromUuid(sheetUuid);
      if (!selectedDoc) {
        ui.notifications.warn("Selected sheet not found");
        return;
      }

      const selectedData = selectedDoc.getFlag("campaign-codex", "data") || {};
      const selectedType = this._selectedSheet.type;

      let npcsToMap = [];

      if (selectedType === "npc") {
        if (selectedData.linkedActor) {
          npcsToMap = [selectedDoc];
        }
      } else if (selectedType === "shop" || selectedType === "location") {
        const npcs = await CampaignCodexLinkers.getLinkedNPCs(
          selectedDoc,
          selectedData.linkedNPCs || [],
        );
        npcsToMap = npcs.filter((npc) => npc.actor);
      }

      if (npcsToMap.length > 0) {
        await this._onDropNPCsToMap(npcsToMap, {
          title: `Drop ${this._selectedSheet.name} NPCs to Map`,
        });
      } else {
        ui.notifications.warn("No NPCs with linked actors found to drop!");
      }
    } catch (error) {
      console.error("Campaign Codex | Error dropping NPCs to map:", error);
      ui.notifications.error("Failed to drop NPCs to map");
    }
  }


async _handleDrop(data, event) {
  if (data.type === "JournalEntry" || data.type === "JournalEntryPage") {
    const doc = await fromUuid(data.uuid);
    if (!doc) return;

    const journal = (doc instanceof JournalEntryPage) ? doc.parent : doc;
    const journalType = journal ? journal.getFlag("campaign-codex", "type") : undefined;

    const dropOnInfoTab = event.target.closest(
      '.group-tab-panel[data-tab="info"]',
    );

    if ((doc instanceof JournalEntryPage || (doc instanceof JournalEntry && !journalType)) && dropOnInfoTab) {
      await this._saveFormData();
      const currentData = this.document.getFlag("campaign-codex", "data") || {};
      currentData.linkedStandardJournal = doc.uuid;
      await this.document.setFlag("campaign-codex", "data", currentData);
      ui.notifications.info(`Linked journal "${doc.name}".`);
      this.render(false);
      return;
    }

    if (journal && journalType) {
      await this._addMemberToGroup(journal.uuid);
    }

  } else if (data.type === "Actor") {
    const actor = await fromUuid(data.uuid);
    const npcJournal =
      await game.campaignCodex.findOrCreateNPCJournalForActor(actor);
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
      await this._handleDrop(data, event);
      this.render(false);
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

  _generateLeftPanel(groupMembers, nestedData) {
    const toggleClass = this._showTreeItems ? "active" : "";

    return `
      <div class="group-tree">
        <div class="tree-header">
          <h3><i class="fas fa-sitemap"></i> Group Structure</h3>
          <button type="button" class="btn-expand-all" title="Expand All" style="width:32px">
            <i class="fas fa-expand-arrows-alt"></i>
          </button>
          <button type="button" class="btn-collapse-all" title="Collapse All" style="width:32px">
            <i class="fas fa-compress-arrows-alt"></i>
          </button>
          <button type="button" class="toggle-tree-items ${toggleClass}" title="Hide/Show Inventory Items" style="width:32px">
            <i class="fas fa-tag"></i>
          </button>
        </div>
        <div class="tree-content">
          ${this._generateTreeNodes(groupMembers, nestedData)}
        </div>
      </div>
    `;
  }

  _generateTreeNodes(nodes, nestedData) {
    let html = "";
    if (!nodes) return html;
    const alphaCards = game.settings.get("campaign-codex", "sortCardsAlpha");
    const nodestoRender = alphaCards
      ? [...nodes].sort((a, b) => a.name.localeCompare(b.name))
      : nodes;

    for (const node of nodestoRender) {
      const children = this._getChildrenForMember(node, nestedData);
      const hasChildren = children && children.length > 0;
      const isSelected =
        this._selectedSheet && this._selectedSheet.uuid === node.uuid;
      const isExpanded = this._expandedNodes.has(node.uuid);

      const isClickable = node.type !== "item";
      const clickableClass = isClickable ? "clickable" : "";

      html += `
        <div class="tree-node ${isSelected ? "selected" : ""}" data-type="${node.type}" data-sheet-uuid="${node.uuid}">
          <div class="tree-node-header ${hasChildren ? "expandable" : ""}">
            ${hasChildren ? `<i class="fas ${isExpanded ? "fa-chevron-down" : "fa-chevron-right"} expand-icon expand-toggle"></i>` : '<i class="tree-spacer"></i>'}
            <i class="${TemplateComponents.getAsset("icon", node.type)} node-icon" alt="${node.name}">&nbsp;</i>
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
            <span class="tree-type">${node.type}</span>         
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
      `;
    }

    return html;
  }

  _getChildrenForMember(member, nestedData) {
    const children = [];

    switch (member.type) {
      case "group":
        children.push(...(nestedData.membersByGroup[member.uuid] || []));
        break;
      case "region":
        children.push(...(nestedData.locationsByRegion[member.uuid] || []));
        break;
      case "location":
        children.push(...(nestedData.shopsByLocation[member.uuid] || []));
        children.push(...(nestedData.npcsByLocation[member.uuid] || []));
        break;
      case "shop":
        children.push(...(nestedData.npcsByShop[member.uuid] || []));
        if (this._showTreeItems) {
          children.push(...(nestedData.itemsByShop[member.uuid] || []));
        }
        break;
      case "npc":
        break;
    }

    return children;
  }

  _generateInfoTab(data) {
    const stats = this._calculateGroupStats(data.nestedData);
    return `
      <div class="group-stats-grid">
        <div class="stat-card">
          <div class="stat-icon"><i class="${TemplateComponents.getAsset("icon", "region")}"></i></div>
          <div class="stat-content">
            <div class="stat-number">${stats.regions}</div>
            </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon"><i class="${TemplateComponents.getAsset("icon", "location")}"></i></div>
          <div class="stat-content">
            <div class="stat-number">${stats.locations}</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon"><i class="${TemplateComponents.getAsset("icon", "shop")}"></i></div>
          <div class="stat-content">
            <div class="stat-number">${stats.shops}</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon"><i class="${TemplateComponents.getAsset("icon", "npc")}"></i></div>
          <div class="stat-content">
            <div class="stat-number">${stats.npcs}</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon"><i class="${TemplateComponents.getAsset("icon", "item")}"></i></div>
          <div class="stat-content">
            <div class="stat-number">${stats.items}</div>
          </div>
        </div>
      </div>
      <div class="form-section" style="margin-bottom: 48px;">
        ${game.user.isGM ? `${TemplateComponents.dropZone("member", "fas fa-plus-circle", "Add Members", "Drag regions, locations, entries, or NPCs here to add them to this group")}` : ""}
      </div>
      ${TemplateComponents.standardJournalSection(data)}
      ${TemplateComponents.richTextSection("Description", "fas fa-align-left", data.sheetData.enrichedDescription, "description", data.isOwnerOrHigher)}
    `;
  }

  async _generateNPCsTab(data) {
    return `
      ${TemplateComponents.contentHeader("fas fa-users", "All NPCs in Group")}
      
      <div class="npc-filters">
        <button type="button" class="filter-btn active" data-filter="all">All NPCs</button>
        <button type="button" class="filter-btn" data-filter="location">Location NPCs</button>
        <button type="button" class="filter-btn" data-filter="shop">Entry NPCs</button>
        <button type="button" class="filter-btn" data-filter="character">Player Characters</button>
      </div>
      
      <div class="npc-grid-container">
        ${await this._generateNPCCards(data.nestedData.allNPCs)}
      </div>
    `;
  }

  _generateInventoryTab(data) {
    return `
      ${TemplateComponents.contentHeader("fas fa-boxes", "All Inventory in Group")}
      
      <div class="inventory-summary">
        <div class="summary-stat">
          <span class="stat-value">${data.nestedData.allShops.length}</span>
          <span class="stat-label">Total Entries</span>
        </div>
        <div class="summary-stat">
          <span class="stat-value">${data.nestedData.allItems.length}</span>
          <span class="stat-label">Total Items</span>
        </div>
        <div class="summary-stat">
          <span class="stat-value">${data.nestedData.totalValue}</span>
          <span class="stat-label">Total Value</span>
        </div>
      </div>
      
      <div class="inventory-by-shop">
        ${this._generateInventoryByShop(data.nestedData)}
      </div>
    `;
  }

  _generateLocationsTab(data) {
    return `
      ${TemplateComponents.contentHeader("fas fa-map-marker-alt", "All Locations in Group")}
      
      <div class="locations-grid">
       ${this._generateLocationCards(data.nestedData.allLocations)}
      </div>
    `;
  }

  async _generateNPCCards(npcs) {
    const npcCards = game.settings.get("campaign-codex", "sortCardsAlpha");
    const npcstoRender = npcCards
      ? [...npcs].sort((a, b) => a.name.localeCompare(b.name))
      : npcs;

    const cardPromises = npcstoRender.map(async (npc) => {
      const actor = await fromUuid(npc.actor?.uuid);
      const actorType = actor ? actor.type : "";

      return `
        <div class="group-npc-card" data-filter="${npc.source} ${actorType}" data-sheet-uuid="${npc.uuid}">
          <div class="npc-avatar">
            <img src="${TemplateComponents.getAsset("image", "npc", npc.img)}" alt="${npc.name}">
          </div>
          <div class="npc-info">
            <h4 class="npc-name">${npc.name}</h4>
            <div class="npc-source">${npc.sourceLocation || npc.sourceShop || "Direct"}</div>
          </div>
          <div class="npc-actions">
            <button type="button" class="btn-open-sheet" data-sheet-uuid="${npc.uuid}">
              <i class="fas fa-external-link-alt"></i>
            </button>
            ${
              npc.actor
                ? `
              <button type="button" class="btn-open-actor" data-actor-uuid="${npc.actor.uuid}">
                <i class="fas fa-user"></i>
              </button>
            `
                : ""
            }
          </div>
        </div>
      `;
    });

    const htmlCards = await Promise.all(cardPromises);
    return htmlCards.join("");
  }

  _generateLocationCards(locations) {
    const locationCards = game.settings.get("campaign-codex", "sortCardsAlpha");
    const locationstoRender = locationCards
      ? [...locations].sort((a, b) => a.name.localeCompare(b.name))
      : locations;

    return locationstoRender
      .map(
        (location) => `
      <div class="group-location-card" data-sheet-uuid="${location.uuid}">
        <div class="location-image">
          <img class="card-image-clickable" data-sheet-uuid="${location.uuid}" src="${TemplateComponents.getAsset("image", location.type, location.img)}" alt="${location.name}">
        </div>
        <div class="location-info">
          <h4 class="location-name">${location.name}</h4>
          <div class="location-stats">
            ${location.npcCount || 0} NPCs | ${location.shopCount || 0} Entries
          </div>
          ${location.region ? `<div class="location-region">Region: ${location.region}</div>` : ""}
        </div>
      </div>
    `,
      )
      .join("");
  }

  _generateInventoryByShop(nestedData) {
    let html = "";

    for (const [shopUuid, items] of Object.entries(nestedData.itemsByShop)) {
      const shop = nestedData.allShops.find((s) => s.uuid === shopUuid);
      if (!shop || items.length === 0) continue;

      const itemCards = game.settings.get("campaign-codex", "sortCardsAlpha");
      const itemCardstoRender = itemCards
        ? [...items].sort((a, b) => a.name.localeCompare(b.name))
        : items;

      const totalValue = itemCardstoRender.reduce(
        (sum, item) => sum + item.finalPrice * item.quantity,
        0,
      );

      html += `
        <div class="shop-inventory-section">
          <div class="shop-header">
            <img src="${TemplateComponents.getAsset("image", shop.type, shop.img)}" alt="${shop.name}" class="shop-icon">
            <div class="shop-info">
              <h4 class="shop-name">${shop.name}</h4>
              <div class="shop-stats">${itemCardstoRender.length} items | ${totalValue}gp total</div>
            </div>
            <button type="button" class="btn-open-sheet" data-sheet-uuid="${shopUuid}">
              <i class="fas fa-external-link-alt"></i>
            </button>
          </div>
          
          <div class="shop-items">
            ${itemCardstoRender
              .map(
                (item) => `
              <div class="group-item-card">
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
    // Prevent a group from being added to itself
    if (newMemberUuid === this.document.uuid) {
      ui.notifications.warn("A group cannot be added to itself.");
      return;
    }

    const newMemberDoc = await fromUuid(newMemberUuid);
    if (!newMemberDoc) {
      ui.notifications.error(
        "The item you are trying to add could not be found.",
      );
      return;
    }

    // Check for and prevent circular dependencies
    if (newMemberDoc.getFlag("campaign-codex", "type") === "group") {
      const membersOfNewGroup = await GroupLinkers.getGroupMembers(
        newMemberDoc.getFlag("campaign-codex", "data")?.members || [],
      );
      const nestedDataOfNewGroup =
        await GroupLinkers.getNestedData(membersOfNewGroup);

      if (
        nestedDataOfNewGroup.allGroups.some(
          (g) => g.uuid === this.document.uuid,
        )
      ) {
        ui.notifications.warn(
          `Cannot add "${newMemberDoc.name}" as it would create a circular dependency.`,
        );
        return;
      }
    }

    const groupData = this.document.getFlag("campaign-codex", "data") || {};
    let currentMembers = groupData.members || [];

    // Prevent adding a member that is already included as a child of another member
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
      ui.notifications.warn(
        `"${newMemberDoc.name}" is already included in this group as a child of another member.`,
      );
      return;
    }

    // Get all nested children of the NEW member
    const newMemberAsGroupMember = [
      {
        uuid: newMemberUuid,
        type: newMemberDoc.getFlag("campaign-codex", "type"),
      },
    ];
    const nestedDataOfNewMember = await GroupLinkers.getNestedData(
      newMemberAsGroupMember,
    );
    const allNestedUuidsOfNewMember = new Set([
      ...nestedDataOfNewMember.allGroups.map((i) => i.uuid),
      ...nestedDataOfNewMember.allRegions.map((i) => i.uuid),
      ...nestedDataOfNewMember.allLocations.map((i) => i.uuid),
      ...nestedDataOfNewMember.allShops.map((i) => i.uuid),
      ...nestedDataOfNewMember.allNPCs.map((i) => i.uuid),
    ]);

    // Filter the current members list, removing any that are children of the new member
    const membersToRemove = currentMembers.filter((memberUuid) =>
      allNestedUuidsOfNewMember.has(memberUuid),
    );
    let updatedMembers = currentMembers.filter(
      (memberUuid) => !allNestedUuidsOfNewMember.has(memberUuid),
    );

    // Add the new member to the cleaned list
    updatedMembers.push(newMemberUuid);
    groupData.members = updatedMembers;
    await this.document.setFlag("campaign-codex", "data", groupData);

    this.render(false);

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
    groupData.members = (groupData.members || []).filter(
      (uuid) => uuid !== memberUuid,
    );
    await this.document.setFlag("campaign-codex", "data", groupData);

    this.render(false);
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
      const isExpanding =
        children.style.display === "none" || children.style.display === "";
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
    const nativeElement =
      this.element instanceof jQuery ? this.element[0] : this.element;
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

  _onFilterChange(event) {
    const nativeElement =
      this.element instanceof jQuery ? this.element[0] : this.element;
    const filter = event.currentTarget.dataset.filter;
    const cards = nativeElement.querySelectorAll(".group-npc-card");

    nativeElement
      .querySelectorAll(".filter-btn")
      .forEach((btn) => btn.classList.remove("active"));
    event.currentTarget.classList.add("active");

    cards.forEach((card) => {
      const cardFilter = card.dataset.filter;
      if (filter === "all" || cardFilter.includes(filter)) {
        card.style.display = "flex";
      } else {
        card.style.display = "none";
      }
    });
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

    const groupData = this.document.getFlag("campaign-codex", "data") || {};
    const groupMembers = await GroupLinkers.getGroupMembers(
      groupData.members || [],
    );
    const nestedData = await GroupLinkers.getNestedData(groupMembers);

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
}
