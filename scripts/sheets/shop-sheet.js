import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { TemplateComponents } from "./template-components.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { promptForName, localize, format } from "../helper.js";

export class ShopSheet extends CampaignCodexBaseSheet {
  // =========================================================================
  // Foundry VTT Overrides
  // =========================================================================

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: [...super.defaultOptions.classes, "shop-sheet"],
    });
  }

  get template() {
    return "modules/campaign-codex/templates/base-sheet.html";
  }

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

    const [linkedNPCs, linkedLocation, inventory, canViewLocation, canViewScene] = await Promise.all([
        CampaignCodexLinkers.getLinkedNPCs(this.document, shopData.linkedNPCs || []),
        shopData.linkedLocation ? CampaignCodexLinkers.getLinkedLocation(shopData.linkedLocation) : null,
        CampaignCodexLinkers.getInventory(this.document, shopData.inventory || []),
        this.constructor.canUserView(shopData.linkedLocation),
        this.constructor.canUserView(shopData.linkedScene)
    ]);
    
    return { shopData, linkedScene, linkedNPCs, linkedLocation, inventory, canViewLocation, canViewScene };
  }

  async getData() {
    const data = await super.getData();
  // PERFORMANCE: Use cached data if available, otherwise process and cache it.
  if (!this._processedData) {
    this._processedData = await this._processShopData();
  }
  const { shopData, linkedScene, linkedNPCs, linkedLocation, inventory, canViewLocation, canViewScene } = this._processedData;
  
  data.isLoot = shopData.isLoot || false;
  data.hideInventory = shopData.hideInventory || false;
  data.linkedScene = linkedScene;
  data.linkedNPCs = linkedNPCs;
  data.linkedLocation = linkedLocation;
  data.inventory = inventory;
  data.canViewLocation = canViewLocation;
  data.canViewScene = canViewScene;

    // const shopData = this.document.getFlag("campaign-codex", "data") || {};
    // data.isLoot = shopData.isLoot || false;
    // data.hideInventory = shopData.hideInventory || false;

    // data.linkedScene = null;
    // if (shopData.linkedScene) {
    //   try {
    //     const scene = await fromUuid(shopData.linkedScene);
    //     if (scene) {
    //       data.linkedScene = {
    //         uuid: scene.uuid,
    //         name: scene.name,
    //         img: scene.thumb || "icons/svg/map.svg",
    //       };
    //     }
    //   } catch (error) {
    //     console.warn(`Campaign Codex | Linked scene not found: ${shopData.linkedScene}`);
    //   }
    // }

    // data.linkedNPCs = await CampaignCodexLinkers.getLinkedNPCs(this.document, shopData.linkedNPCs || []);
    // data.linkedLocation = shopData.linkedLocation ? await CampaignCodexLinkers.getLinkedLocation(shopData.linkedLocation) : null;
    // data.inventory = await CampaignCodexLinkers.getInventory(this.document, shopData.inventory || []);
    data.taggedNPCs = data.linkedNPCs.filter((npc) => npc.tag === true);
    data.linkedNPCsWithoutTaggedNPCs = data.linkedNPCs.filter((npc) => npc.tag !== true);

    // // Prepare Permissions
    // data.preparedInventory = data.inventory;
    // data.canViewLocation = await this.constructor.canUserView(shopData.linkedLocation?.uuid);
    // data.canViewScene = await this.constructor.canUserView(shopData.linkedScene?.uuid);

    data.sheetType = "shop";
    data.sheetTypeLabel = localize("names.shop");
    data.customImage = this.document.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "shop");
    data.markup = shopData.markup || 1.0;

    data.tabs = [
      {
        key: "info",
        label: localize("names.info"),
        icon: "fas fa-info-circle",
        active: this._currentTab === "info",
      },
      ...(data.hideInventory
        ? []
        : [
            {
              key: "inventory",
              label: localize("names.inventory"),
              icon: "fas fa-boxes",
              active: this._currentTab === "inventory",
              statistic: {
                value: data.inventory.length,
                color: "#28a745",
              },
            },
          ]),
      {
        key: "npcs",
        label: localize("names.npcs"),
        icon: "fas fa-users",
        active: this._currentTab === "npcs",
        statistic: {
          value: data.linkedNPCs.length,
          color: "#fd7e14",
        },
      },
      { key: "journals", label: localize("names.journals"), icon: "fas fa-book"},

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

    const sources = [
      { data: data.linkedLocation, type: "location" },
      { data: data.linkedNPCsWithoutTaggedNPCs, type: "npc" },
    ];

    data.quickLinks = CampaignCodexLinkers.createQuickLinks(sources);
    data.quickTags = CampaignCodexLinkers.createQuickTags(data.taggedNPCs);

    let headerContent = "";

    if (data.linkedLocation) {
      let icon = TemplateComponents.getAsset("icon", "location"); // Start with a default icon
      if (data.linkedLocation.uuid) {
        const linkLocType = await fromUuid(data.linkedLocation.uuid);
        if (linkLocType) {
          const iconType = linkLocType.getFlag("campaign-codex", "type");
          const finalIconType = iconType === "location" || iconType === "region" ? iconType : "location";
          icon = TemplateComponents.getAsset("icon", finalIconType);
        }
      }
      headerContent += `
        <div class="region-info">
          <i class="${icon}"></i>
          <span class="region-name${data.canViewLocation ? ` location-link" data-location-uuid="${data.linkedLocation.uuid}"` : '"'} style="cursor: pointer; color: var(--cc-accent);">${data.linkedLocation.name}</span>
        ${
          game.user.isGM
            ? `<button type="button" class="scene-btn remove-location" title="${format("message.unlink", { type: localize("names.location") })}">
          <i class="fas fa-unlink"></i>
        </button>`
            : ""
        }
        </div>
      `;
    }

    if (data.linkedScene) {
      headerContent += `
      <div class="scene-info">
        <span class="scene-name${data.canViewScene ? ` open-scene" data-scene-uuid="${data.linkedScene.uuid}"` : '"'} title="${format("message.open", { type: localize("names.scene") })}"> <i class="fas fa-map"></i> ${data.linkedScene.name}</span>
        ${
          game.user.isGM
            ? `<button type="button" class="scene-btn remove-scene" title="${format("message.unlink", { type: localize("names.scene") })}">
          <i class="fas fa-unlink"></i>
        </button>`
            : ""
        }
      </div>
    `;
    } else {
      headerContent += `${
        game.user.isGM
          ? `<div class="scene-info">
        <span class="scene-name open-scene" style="text-align:center;"><i class="fas fa-link"></i>${format("dropzone.link", { type: localize("names.scene") })}</span>
      </div>`
          : ""
      }
    `;
    }
    if (game.user.isGM) {
      headerContent += `
      <div class="shop-toggles" style="margin-top: 8px; display: flex; gap: 12px; align-items: center; justify-content: center;">
      <span class="stat-label">Hide Inventory</span>
        <label class="toggle-control">
          <input type="checkbox" class="hide-inventory-toggle" ${data.hideInventory ? "checked" : ""} style="margin: 0;"><span class="slider"></span>
        </label>
      </div>
    `;
    }

    data.customHeaderContent = headerContent;

    data.tabPanels = [
      {
        key: "info",
        active: this._currentTab === "info",
        content: await this._generateInfoTab(data),
      },
      ...(data.hideInventory
        ? []
        : [
            {
              key: "inventory",
              active: this._currentTab === "inventory",
              content: this._generateInventoryTab(data),
            },
          ]),
      {
        key: "npcs",
        active: this._currentTab === "npcs",
        content: await this._generateNPCsTab(data),
      },
      { key: "journals", active: this._currentTab === "journals", content:  `${TemplateComponents.contentHeader("fas fa-book", "Journals")}${TemplateComponents.standardJournalGrid(data.linkedStandardJournals)}` },

      {
        key: "notes",
        active: this._currentTab === "notes",
        content: CampaignCodexBaseSheet.generateNotesTab(this.document, data),
      },
    ];

    return data;
  }

  _activateSheetSpecificListeners(html) {
    const nativeHtml = html instanceof jQuery ? html[0] : html;
    // --- Listeners for single, non-repeating click events ---
    const singleActionMap = {
      ".create-npc-button": this._onCreateNPCJournal,
      ".sort-inventory-alpha": this._onSortInventory,
      ".open-scene": this._onOpenScene,
      ".remove-scene": this._onRemoveScene,
    };

    for (const [selector, handler] of Object.entries(singleActionMap)) {
      nativeHtml.querySelector(selector)?.addEventListener("click", handler.bind(this));
    }

    // --- Listeners for multiple elements with simple click handlers ---
    const multiActionMap = {
      ".remove-item": this._onRemoveItem,
      ".remove-location": this._onRemoveLocation,
      ".quantity-decrease": this._onQuantityDecrease,
      ".quantity-increase": this._onQuantityIncrease,
      ".open-item": this._onOpenItem,
      ".send-to-player": this._onSendToPlayer,
    };

    for (const [selector, handler] of Object.entries(multiActionMap)) {
      nativeHtml.querySelectorAll(selector).forEach((el) => el.addEventListener("click", handler.bind(this)));
    }

    // --- Listeners for opening different document types ---
    const documentOpenMap = {
      ".open-npc, .npc-link": { flag: "npc", handler: this._onOpenDocument },
      ".open-location, .location-link": { flag: "location", handler: this._onOpenDocument },
      ".open-actor": { flag: "actor", handler: this._onOpenDocument },
    };

    for (const [selector, { flag, handler }] of Object.entries(documentOpenMap)) {
      nativeHtml.querySelectorAll(selector).forEach((el) => {
        el.addEventListener("click", (e) => handler.call(this, e, flag));
      });
    }

    // --- Listeners for actions on lists that require a flag ---
    const listActionMap = {
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

    // --- Listeners for non-click events ---
    // These are handled individually because they use events other than "click"
    nativeHtml.querySelector("form")?.addEventListener("submit", (event) => event.preventDefault());
    nativeHtml.querySelector(".markup-input")?.addEventListener("change", this._onMarkupChange.bind(this));
    nativeHtml.querySelector(".shop-loot-toggle")?.addEventListener("change", this._onLootToggle.bind(this));
    nativeHtml.querySelector(".hide-inventory-toggle")?.addEventListener("change", this._onHideInventoryToggle.bind(this));

    nativeHtml.querySelectorAll(".quantity-input")?.forEach((el) => el.addEventListener("change", this._onQuantityChange.bind(this)));
    nativeHtml.querySelectorAll(".price-input")?.forEach((el) => el.addEventListener("change", this._onPriceChange.bind(this)));

    nativeHtml.querySelectorAll(".inventory-item")?.forEach((el) => {
      el.addEventListener("dragstart", this._onItemDragStart.bind(this));
      el.addEventListener("dragend", this._onItemDragEnd.bind(this));
    });
  }

  async _handleDrop(data, event) {
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

  async _generateInfoTab(data) {
    let locationSection = "";

    // const standardJournalSection = TemplateComponents.standardJournalSection(data);
    if (data.linkedLocation) {
      let icon = TemplateComponents.getAsset("icon", "location");
      if (data.linkedLocation.uuid) {
        const linkLocType = await fromUuid(data.linkedLocation.uuid);
        if (linkLocType) {
          const iconType = linkLocType.getFlag("campaign-codex", "type");
          const finalIconType = iconType === "location" || iconType === "region" ? iconType : "location";
          icon = TemplateComponents.getAsset("icon", finalIconType);
        }
      }
      locationSection = `
        <div class="form-section">
          <div class="linked-actor-card">
            <div class="actor-image">
              <i class="${icon}"></i>
            </div>
            <div class="actor-content">
              <h4 class="actor-name">${data.linkedLocation.name}</h4>
              <div class="actor-details">
                <span class="actor-race-class">${localize("names.location")}</span>
              </div>
            </div>
            <div class="actor-actions">
              ${
                data.canViewLocation
                  ? `<button type="button" class="action-btn open-location" data-location-uuid="${data.linkedLocation.uuid}" title="${format("message.open", { type: localize("names.location") })}">
                <i class="fas fa-external-link-alt"></i>
              </button>`
                  : ""
              }
              ${
                game.user.isGM
                  ? `<button type="button" class="action-btn remove-location" title="${format("warn.remove", { type: localize("names.location") })}">
                <i class="fas fa-unlink"></i>
              </button>`
                  : ""
              }
            </div>
          </div>
        </div>
      `;
    } else {
      locationSection = `
        <div class="form-section">
          ${game.user.isGM ? `${TemplateComponents.dropZone("location", "fas fa-map-marker-alt", format("dropzone.link", { type: localize("names.regionlocation") }), "")}` : ""}
        </div>
      `;
    }

    return `
      ${TemplateComponents.contentHeader("fas fas fa-info-circle", "Information")}
      ${locationSection}
     ${TemplateComponents.richTextSection(this.document, data.sheetData.enrichedDescription, "description", data.isOwnerOrHigher)}
    `;
  }

  _generateInventoryTab(data) {
    const markupSection = data.isLoot ? "" : TemplateComponents.markupControl(data.markup);
    return `
    ${TemplateComponents.contentHeader("fas fa-boxes", data.isLoot ? "Loot" : "Inventory")}
    ${
      game.user.isGM
        ? `<div class="shop-toggles">
      <span class="stat-label">Loot Mode</span>
      <label class="toggle-control">
        <input type="checkbox" class="shop-loot-toggle" ${data.isLoot ? "checked" : ""} style="margin: 0;"><span class="slider"></span>
      </label></div>`
        : ""
    }
    ${game.user.isGM ? `${TemplateComponents.dropZone("item", "fas fa-clone", "Drop items to add", "")}` : ""}
    ${markupSection}
    ${TemplateComponents.inventoryTable(data.inventory, data.isLoot)}
  `;
  }

  async _generateNPCsTab(data) {
    const preparedNPCs = data.linkedNPCs;
    const preparedTags = data.taggedNPCs;
    const preparedAssociatesNoTags = data.linkedNPCsWithoutTaggedNPCs;
    const dropToMapBtn =
      canvas.scene && game.user.isGM && data.linkedNPCs.length > 0
        ? `
    <button type="button" class="refresh-btn npcs-to-map-button" title="Drop NPCs to current scene">
      <i class="fas fa-street-view"></i></button> `
        : "";
    const createNPCBtn = data.isGM
      ? `
      <button type="button" class="refresh-btn create-npc-button"  title="Create New NPC">
        <i class="fas fa-user-plus"></i>
      </button>`
      : "";
    const npcBtn = dropToMapBtn + createNPCBtn;

    let content = `
    ${TemplateComponents.contentHeader("fas fa-users", "NPCs", npcBtn)}
    ${game.user.isGM ? `${TemplateComponents.dropZone("npc", "fas fa-user-plus", "", "")}` : ""}
    ${await TemplateComponents.entityGrid(preparedAssociatesNoTags, "npc", true)}
    `;
    return content;
  }

  // =========================================================================
  // Event Handlers
  // =========================================================================

  async _onCreateNPCJournal(event) {
    event.preventDefault();
    const name = await promptForName("NPC");
    if (name) {
      const npcJournal = await game.campaignCodex.createNPCJournal(null, name);
      if (npcJournal) {
        await game.campaignCodex.linkShopToNPC(this.document, npcJournal);
        this.render(true);
        npcJournal.sheet.render(true);
      }
    }
  }

  async _onOpenScene(event) {
    event.preventDefault();
    await game.campaignCodex.openLinkedScene(this.document);
  }

  async _onRemoveScene(event) {
    event.preventDefault();
    await this._saveFormData();
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.linkedScene = null;
    await this.document.setFlag("campaign-codex", "data", currentData);
    this.render(true);
    ui.notifications.info("Unlinked scene");
  }

  async _onLootToggle(event) {
    const isLoot = event.target.checked;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.isLoot = isLoot;
    await this.document.setFlag("campaign-codex", "data", currentData);
    this.render(false);
  }

  async _onHideInventoryToggle(event) {
    const hideInventory = event.target.checked;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.hideInventory = hideInventory;
    await this.document.setFlag("campaign-codex", "data", currentData);

    if (hideInventory && this._currentTab === "inventory") {
      this._currentTab = "info";
    }

    this.render(false);
  }

  async _onMarkupChange(event) {
    const markup = parseFloat(event.target.value) || 1.0;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.markup = markup;
    await this.document.setFlag("campaign-codex", "data", currentData);
    this.render(false);
  }

  async _onQuantityChange(event) {
    let quantity = parseInt(event.target.value);
    if (isNaN(quantity) || quantity < 0) {
      quantity = 0;
    }
    const itemUuid = event.currentTarget.dataset.itemUuid;
    await this._updateInventoryItem(itemUuid, { quantity });
  }

  async _onQuantityDecrease(event) {
    const itemUuid = event.currentTarget.dataset.itemUuid;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const inventory = currentData.inventory || [];
    const item = inventory.find((i) => i.itemUuid === itemUuid);
    if (item && item.quantity > 0) {
      await this._updateInventoryItem(itemUuid, {
        quantity: item.quantity - 1,
      });
    }
  }

  async _onQuantityIncrease(event) {
    const itemUuid = event.currentTarget.dataset.itemUuid;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const inventory = currentData.inventory || [];
    const item = inventory.find((i) => i.itemUuid === itemUuid);

    if (item) {
      await this._updateInventoryItem(itemUuid, {
        quantity: item.quantity + 1,
      });
    }
  }

  async _onPriceChange(event) {
    const price = parseFloat(event.target.value) || null;
    const itemUuid = event.currentTarget.dataset.itemUuid;
    await this._updateInventoryItem(itemUuid, { customPrice: price });
  }

  async _onRemoveItem(event) {
    const itemUuid = event.currentTarget.dataset.itemUuid;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};

    currentData.inventory = (currentData.inventory || []).filter((i) => i.itemUuid !== itemUuid);
    await this.document.setFlag("campaign-codex", "data", currentData);

    this.render(true);
  }

  async _onRemoveLocation(event) {
    const shopDoc = this.document;
    const shopData = shopDoc.getFlag("campaign-codex", "data") || {};
    const locationUuid = shopData.linkedLocation;

    if (!locationUuid) return;

    try {
      const locationDoc = await fromUuid(locationUuid);
      if (locationDoc) {
        const locationData = locationDoc.getFlag("campaign-codex", "data") || {};
        if (locationData.linkedShops) {
          locationData.linkedShops = locationData.linkedShops.filter((uuid) => uuid !== shopDoc.uuid);

          locationDoc._skipRelationshipUpdates = true;
          await locationDoc.setFlag("campaign-codex", "data", locationData);
          delete locationDoc._skipRelationshipUpdates;

          for (const app of Object.values(ui.windows)) {
            if (app.document?.uuid === locationDoc.uuid) {
              app.render(true);
            }
          }
        }
      }

      shopDoc._skipRelationshipUpdates = true;
      await shopDoc.update({
        "flags.campaign-codex.data.linkedLocation": null,
      });
      delete shopDoc._skipRelationshipUpdates;
    } catch (error) {
      console.error("Campaign Codex | Error removing location link:", error);
      ui.notifications.error("Failed to remove location link.");
    } finally {
      this.render(true);
    }
  }

  async _onOpenItem(event) {
    event.stopPropagation();
    const itemUuid = event.currentTarget.dataset.itemUuid;
    const item = (await fromUuid(itemUuid)) || game.items.get(itemUuid);

    if (item) {
      item.sheet.render(true);
    } else {
      ui.notifications.warn("Item not found in world items");
    }
  }

  async _onSendToPlayer(event) {
    event.stopPropagation();
    const itemUuid = event.currentTarget.dataset.itemUuid;
    const item = (await fromUuid(itemUuid)) || game.items.get(itemUuid);

    if (!item) {
      ui.notifications.warn("Item not found");
      return;
    }

    TemplateComponents.createPlayerSelectionDialog(item.name, async (targetActor) => {
      await this._transferItemToActor(item, targetActor);
    });
  }

  _onItemDragStart(event) {
    const itemUuid = event.currentTarget.dataset.itemUuid;

    const dragData = {
      type: "Item",
      uuid: itemUuid,
      source: "shop",
      shopId: this.document.id,
    };

    event.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));

    event.currentTarget.style.opacity = "0.5";
  }

  _onItemDragEnd(event) {
    event.currentTarget.style.opacity = "1";
  }

  async _onSortInventory(event) {
    event.preventDefault();

    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const inventory = await CampaignCodexLinkers.getInventory(this.document, currentData.inventory || []);

    inventory.sort((a, b) => a.name.localeCompare(b.name));

    const sortedMinimalInventory = inventory.map((item) => ({
      customPrice: item.customPrice,
      itemUuid: item.itemUuid,
      quantity: item.quantity,
    }));

    await this.document.setFlag("campaign-codex", "data", {
      ...currentData,
      inventory: sortedMinimalInventory,
    });

    this.render(false);
  }

  async _onDropNPCsToMapClick(event) {
    event.preventDefault();

    const shopData = this.document.getFlag("campaign-codex", "data") || {};
    const rawLinkedNPCs = await CampaignCodexLinkers.getLinkedNPCs(this.document, shopData.linkedNPCs || []);
    const linkedNPCs = rawLinkedNPCs.filter((npc) => npc.tag !== true);

    if (linkedNPCs && linkedNPCs.length > 0) {
      await this._onDropNPCsToMap(linkedNPCs, {
        title: `Drop ${this.document.name} NPCs to Map`,
      });
    } else {
      ui.notifications.warn("No NPCs with linked actors found to drop!");
    }
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

    await this._saveFormData();
    await game.campaignCodex.linkSceneToDocument(scene, this.document);
    ui.notifications.info(`Linked scene "${scene.name}" to ${this.document.name}`);
    this.render(false);
  }

  async _handleItemDrop(data, event) {
    if (!data.uuid) {
      ui.notifications.warn("Could not find item to add to entry");
      return;
    }

    const item = await fromUuid(data.uuid);
    if (!item) {
      ui.notifications.warn("Could not find item to add to entry");
      return;
    }

    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const inventory = currentData.inventory || [];

    if (inventory.find((i) => i.itemUuid === item.uuid)) {
      ui.notifications.warn("Item already exists in inventory!");
      return;
    }

    await game.campaignCodex.addItemToShop(this.document, item, 1);
    this.render(true);
    ui.notifications.info(format("inventory.added", { type: item.name }));
  }

  async _handleJournalDrop(data, event) {
    const journal = await fromUuid(data.uuid);
    if (!journal || journal.id === this.document.id) return;
    const journalType = journal.getFlag("campaign-codex", "type");
    await this._saveFormData();

    // Journal
    const dropOnInfoTab = event.target.closest('.tab-panel[data-tab="info"]');
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

    if (journalType === "npc") {
      // await this._saveFormData();
      await this._saveFormData();
      await game.campaignCodex.linkShopToNPC(this.document, journal);
      this.render(true);
    } else if (journalType === "location") {
      await this._saveFormData();
      await game.campaignCodex.linkLocationToShop(journal, this.document);
      this.render(true);
    } else if (journalType === "region") {
      await this._saveFormData();
      await game.campaignCodex.linkRegionToShop(journal, this.document);
      this.render(true);
    }
  }

  // =========================================================================
  // Internal Helpers
  // =========================================================================

  async _updateInventoryItem(itemUuid, updates) {
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const inventory = currentData.inventory || [];
    const itemIndex = inventory.findIndex((i) => i.itemUuid === itemUuid);

    if (itemIndex !== -1) {
      inventory[itemIndex] = { ...inventory[itemIndex], ...updates };
      currentData.inventory = inventory;
      await this.document.setFlag("campaign-codex", "data", currentData);
      this.render(true);
    }
  }

  async _transferItemToActor(item, targetActor) {
    try {
      const itemData = item.toObject();
      delete itemData._id;

      const currentData = this.document.getFlag("campaign-codex", "data") || {};
      const inventory = currentData.inventory || [];
      const shopItem = inventory.find((i) => i.itemUuid === item.uuid);
      const quantity = shopItem ? shopItem.quantity : 1;

      itemData.system.quantity = Math.min(quantity, 1);

      await targetActor.createEmbeddedDocuments("Item", [itemData]);

      if (shopItem && shopItem.quantity > 0) {
        await this._updateInventoryItem(item.uuid, {
          quantity: shopItem.quantity - 1,
        });
      }

      ui.notifications.info(format("send.item.typetoplayer", { type: item.name, player: targetActor.name }));

      const targetUser = game.users.find((u) => u.character?.id === targetActor.id);
      if (targetUser && targetUser.active) {
        ChatMessage.create({
          content: `<p><strong>${game.user.name}</strong> sent you <strong>${item.name}</strong> from ${this.document.name}!</p>`,
          whisper: [targetUser.id],
        });
      }
    } catch (error) {
      console.error("Error transferring item:", error);
      ui.notifications.error(localize("error.faileditem"));
    }
  }
}
