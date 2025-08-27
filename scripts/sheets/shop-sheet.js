import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { TemplateComponents } from "./template-components.js";
import { DescriptionEditor } from "./editors/description-editor.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { promptForName } from "../helper.js";

export class ShopSheet extends CampaignCodexBaseSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: [...super.defaultOptions.classes, "shop-sheet"],
    });
  }

  get template() {
    return "modules/campaign-codex/templates/base-sheet.html";
  }

  async getData() {
    const data = await super.getData();
    const shopData = this.document.getFlag("campaign-codex", "data") || {};
    data.isLoot = shopData.isLoot || false;
    data.hideInventory = shopData.hideInventory || false;

    data.linkedScene = null;
    if (shopData.linkedScene) {
      try {
        const scene = await fromUuid(shopData.linkedScene);
        if (scene) {
          data.linkedScene = {
            uuid: scene.uuid,
            name: scene.name,
            img: scene.thumb || "icons/svg/map.svg",
          };
        }
      } catch (error) {
        console.warn(
          `Campaign Codex | Linked scene not found: ${shopData.linkedScene}`,
        );
      }
    }

    data.linkedNPCs = await CampaignCodexLinkers.getLinkedNPCs(
      this.document,
      shopData.linkedNPCs || [],
    );
    data.linkedLocation = shopData.linkedLocation
      ? await CampaignCodexLinkers.getLinkedLocation(shopData.linkedLocation)
      : null;
    data.inventory = await CampaignCodexLinkers.getInventory(
      this.document,
      shopData.inventory || [],
    );
    data.canViewLocation = await this.constructor.canUserView(
      shopData.linkedLocation?.uuid,
    );
    data.canViewScene = await this.constructor.canUserView(
      shopData.linkedScene?.uuid,
    );

    data.sheetType = "shop";
    data.sheetTypeLabel = "Entry";
    data.customImage =
      this.document.getFlag("campaign-codex", "image") ||
      TemplateComponents.getAsset("image", "shop");
    data.markup = shopData.markup || 1.0;

    data.tabs = [
      {
        key: "info",
        label: "Info",
        icon: "fas fa-info-circle",
        active: this._currentTab === "info",
      },
      ...(data.hideInventory
        ? []
        : [
            {
              key: "inventory",
              label: "Inventory",
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
        label: "NPCs",
        icon: "fas fa-users",
        active: this._currentTab === "npcs",
        statistic: {
          value: data.linkedNPCs.length,
          color: "#fd7e14",
        },
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

    data.statistics = [
      {
        icon: "fas fa-boxes",
        value: data.inventory.length,
        label: "ITEMS",
        color: "#28a745",
      },
      {
        icon: "fas fa-users",
        value: data.linkedNPCs.length,
        label: "NPCS",
        color: "#fd7e14",
      },
      {
        icon: "fas fa-percentage",
        value: `${data.markup}x`,
        label: "MARKUP",
        color: "#d4af37",
      },
    ];

    const sources = [
      { data: data.linkedLocation, type: "location" },
      { data: data.linkedNPCs, type: "npc" },
    ];

    data.quickLinks = CampaignCodexLinkers.createQuickLinks(sources);

    let headerContent = "";

    if (data.linkedLocation) {
      headerContent += `
        <div class="region-info">
          <span class="region-label">Located:</span>
          <span class="region-name${data.canViewLocation ? ` location-link" data-location-uuid="${data.linkedLocation.uuid}"` : '"'} style="cursor: pointer; color: var(--cc-accent);">${data.linkedLocation.name}</span>
        </div>
      `;
    }

    if (data.linkedScene) {
      headerContent += `
      <div class="scene-info">
        
        <span class="scene-name${data.canViewScene ? ` open-scene" data-scene-uuid="${data.linkedScene.uuid}"` : '"'} title="Open Scene"> <i class="fas fa-map"></i> ${data.linkedScene.name}</span>

        ${
          game.user.isGM
            ? `<button type="button" class="scene-btn remove-scene" title="Unlink Scene">
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
        
        <span class="scene-name open-scene" style="text-align:center;"><i class="fas fa-link"></i> Drop scene to link</span>

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
        content: this._generateInfoTab(data),
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
      {
        key: "notes",
        active: this._currentTab === "notes",
        content: CampaignCodexBaseSheet.generateNotesTab(data),
      },
    ];

    return data;
  }

  _generateInfoTab(data) {
    let locationSection = "";

    // Journal
    let standardJournalSection = `${
      data.isGM
        ? `<div class="scene-info" style="margin-top: -24px;margin-bottom: 24px; height:40px">
        <span class="scene-name" title="Open Journal">
          <i class="fas fa-book"></i> Journal: Drag Standard Journal to link</span>
        </div>`
        : ""
    }
      `;
    if (data.linkedStandardJournal && data.canViewJournal) {
      standardJournalSection = `
        <div class="scene-info" style="margin-top: -24px;margin-bottom: 24px; height:40px">
        <span class="scene-name open-journal" data-journal-uuid="${data.linkedStandardJournal.uuid}" title="Open Journal">
          <i class="fas fa-book"></i> Journal: ${data.linkedStandardJournal.name}</span>
            ${
              game.user.isGM
                ? `<button class="scene-btn remove-standard-journal" title="Unlink Journal">
              <i class="fas fa-unlink"></i>
            </button>`
                : ""
            }
        </div>
      `;
    }

    if (data.linkedLocation) {
      locationSection = `
        <div class="form-section">
          <h3><i class="fas fa-map-marker-alt"></i> Location</h3>
          <div class="linked-actor-card">
            <div class="actor-image">
              <img src="${data.linkedLocation.img}" alt="${data.linkedLocation.name}">
            </div>
            <div class="actor-content">
              <h4 class="actor-name">${data.linkedLocation.name}</h4>
              <div class="actor-details">
                <span class="actor-race-class">Location</span>
              </div>
            </div>
            <div class="actor-actions">
              ${
                data.canViewLocation
                  ? `<button type="button" class="action-btn open-location" data-location-uuid="${data.linkedLocation.uuid}" title="Open Location">
                <i class="fas fa-external-link-alt"></i>
              </button>`
                  : ""
              }
              ${
                game.user.isGM
                  ? `<button type="button" class="action-btn remove-location" title="Remove Location">
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
          ${game.user.isGM ? `${TemplateComponents.dropZone("location", "fas fa-map-marker-alt", "Set Location", "Drag a location journal here to set where this entry is located")}` : ""}
        </div>
      `;
    }

    return `
      ${TemplateComponents.contentHeader("fas fas fa-info-circle", "Information")}
      ${locationSection}
            ${standardJournalSection}

      ${TemplateComponents.richTextSection("Description", "fas fa-align-left", data.sheetData.enrichedDescription, "description", data.isOwnerOrHigher)}
    `;
  }

  _generateInventoryTab(data) {
    const markupSection = data.isLoot
      ? ""
      : TemplateComponents.markupControl(data.markup);
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
    ${game.user.isGM ? `${TemplateComponents.dropZone("item", "fas fa-plus-circle", "Add Items", "Drag items from the items directory to add them to inventory")}` : ""}
    ${markupSection}
    ${TemplateComponents.inventoryTable(data.inventory, data.isLoot)}
  `;
  }

  async _onSortInventory(event) {
    event.preventDefault();

    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const inventory = await CampaignCodexLinkers.getInventory(
      this.document,
      currentData.inventory || [],
    );

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

  async _generateNPCsTab(data) {
    const preparedNPCs =
      await TemplateComponents.prepareEntitiesWithPermissions(data.linkedNPCs);

    const dropToMapBtn =
      canvas.scene && game.user.isGM
        ? `
    <button type="button" class="refresh-btn npcs-to-map-button" title="Drop NPCs to current scene">
      <i class="fas fa-map"></i>
      Drop to Map
    </button>
  `
        : "";

    const createNPCBtn = data.isGM
      ? `
      <button type="button" class="refresh-btn create-npc-button" style="margin-left:12px; height:46px" title="Create New NPC">
        <i class="fas fa-user-plus"></i>
      </button>`
      : "";
    const npcBtn = dropToMapBtn +  createNPCBtn;
    return `
    ${TemplateComponents.contentHeader("fas fa-users", "NPCs", npcBtn)}
    ${game.user.isGM ? `${TemplateComponents.dropZone("npc", "fas fa-user-plus", "Add NPCs", "Drag NPCs or actors here to associate them with this location")}` : ""}
    ${await TemplateComponents.entityGrid(preparedNPCs, "npc", true)}
  `;
  }

  async _onCreateNPCJournal(event) {
    event.preventDefault();
    const name = await promptForName("NPC");
    if (name) {
      const npcJournal = await game.campaignCodex.createNPCJournal(null, name);
      if (npcJournal) {
        await game.campaignCodex.linkShopToNPC(this.document, npcJournal);
        this.render(false);
        npcJournal.sheet.render(true);
      }
    }
  }
  _activateSheetSpecificListeners(html) {
    html
      .querySelector(".create-npc-button")
      ?.addEventListener("click", this._onCreateNPCJournal.bind(this));


    html
      .querySelector(".markup-input")
      ?.addEventListener("change", this._onMarkupChange.bind(this));
    html
      .querySelector(".shop-loot-toggle")
      ?.addEventListener("change", this._onLootToggle.bind(this));
    html
      .querySelector(".hide-inventory-toggle")
      ?.addEventListener("change", this._onHideInventoryToggle.bind(this));

    html
      .querySelectorAll(".remove-npc")
      ?.forEach((element) =>
        element.addEventListener(
          "click",
          async (e) => await this._onRemoveFromList(e, "linkedNPCs"),
        ),
      );
    html
      .querySelectorAll(".remove-item")
      ?.forEach((element) =>
        element.addEventListener("click", this._onRemoveItem.bind(this)),
      );
    html
      .querySelector(".remove-location")
      ?.addEventListener("click", this._onRemoveLocation.bind(this));

    html
      .querySelectorAll(".quantity-decrease")
      ?.forEach((element) =>
        element.addEventListener("click", this._onQuantityDecrease.bind(this)),
      );
    html
      .querySelectorAll(".quantity-increase")
      ?.forEach((element) =>
        element.addEventListener("click", this._onQuantityIncrease.bind(this)),
      );
    html
      .querySelectorAll(".quantity-input")
      ?.forEach((element) =>
        element.addEventListener("change", this._onQuantityChange.bind(this)),
      );

    html
      .querySelectorAll(".price-input")
      ?.forEach((element) =>
        element.addEventListener("change", this._onPriceChange.bind(this)),
      );

    html
      .querySelectorAll(".open-npc")
      ?.forEach((element) =>
        element.addEventListener(
          "click",
          async (e) => await this._onOpenDocument(e, "npc"),
        ),
      );
    html
      .querySelectorAll(".open-location")
      ?.forEach((element) =>
        element.addEventListener(
          "click",
          async (e) => await this._onOpenDocument(e, "location"),
        ),
      );
    html
      .querySelectorAll(".open-item")
      ?.forEach((element) =>
        element.addEventListener("click", this._onOpenItem.bind(this)),
      );
    html
      .querySelectorAll(".open-actor")
      ?.forEach((element) =>
        element.addEventListener(
          "click",
          async (e) => await this._onOpenDocument(e, "actor"),
        ),
      );

    html
      .querySelectorAll(".send-to-player")
      ?.forEach((element) =>
        element.addEventListener("click", this._onSendToPlayer.bind(this)),
      );

    html
      .querySelectorAll(".location-link")
      ?.forEach((element) =>
        element.addEventListener(
          "click",
          async (e) => await this._onOpenDocument(e, "location"),
        ),
      );
    html
      .querySelectorAll(".npc-link")
      ?.forEach((element) =>
        element.addEventListener(
          "click",
          async (e) => await this._onOpenDocument(e, "npc"),
        ),
      );

    html
      .querySelector(".sort-inventory-alpha")
      ?.addEventListener("click", this._onSortInventory.bind(this));

    html.querySelectorAll(".inventory-item")?.forEach((element) => {
      element.addEventListener("dragstart", this._onItemDragStart.bind(this));
      element.addEventListener("dragend", this._onItemDragEnd.bind(this));
    });

    html
      .querySelector(".open-scene")
      ?.addEventListener("click", this._onOpenScene.bind(this));
    html
      .querySelector(".remove-scene")
      ?.addEventListener("click", this._onRemoveScene.bind(this));
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
    this.render(false);
    ui.notifications.info("Unlinked scene");
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

  async _handleSceneDrop(data, event) {
    const scene = await fromUuid(data.uuid);
    if (!scene) {
      ui.notifications.warn("Could not find the dropped scene.");
      return;
    }

    await this._saveFormData();
    await game.campaignCodex.linkSceneToDocument(scene, this.document);
    ui.notifications.info(
      `Linked scene "${scene.name}" to ${this.document.name}`,
    );
    this.render(false);
  }

  async _onLootToggle(event) {
    const isLoot = event.target.checked;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    currentData.isLoot = isLoot;
    await this.document.setFlag("campaign-codex", "data", currentData);
    this.render(false);
    ui.notifications.info(`${isLoot ? "Enabled" : "Disabled"} loot mode`);
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
    ui.notifications.info(
      `${hideInventory ? "Hidden" : "Shown"} inventory in sidebar`,
    );
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
    this.render(false);
    ui.notifications.info(`Added "${item.name}" to entry inventory`);
  }

  async _handleJournalDrop(data, event) {
    const journal = await fromUuid(data.uuid);
    if (!journal || journal.id === this.document.id) return;
    const journalType = journal.getFlag("campaign-codex", "type");

    // Journal
    const dropOnInfoTab = event.target.closest('.tab-panel[data-tab="info"]');
    if (((data.type === "JournalEntry" && !journalType) || data.type === "JournalEntryPage") && dropOnInfoTab) {
      await this._saveFormData();
      const locationData =
        this.document.getFlag("campaign-codex", "data") || {};
      locationData.linkedStandardJournal = journal.uuid;
      await this.document.setFlag("campaign-codex", "data", locationData);
      ui.notifications.info(`Linked journal "${journal.name}".`);
      this.render(false);
      return;
    }
    // END

    if (journalType === "npc") {
      await this._saveFormData();
      await game.campaignCodex.linkShopToNPC(this.document, journal);
      this.render(false);
    } else if (journalType === "location") {
      await this._saveFormData();
      await game.campaignCodex.linkLocationToShop(journal, this.document);
      this.render(false);
    }
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

  async _updateInventoryItem(itemUuid, updates) {
    const currentData = this.document.getFlag("campaign-codex", "data") || {};
    const inventory = currentData.inventory || [];
    const itemIndex = inventory.findIndex((i) => i.itemUuid === itemUuid);

    if (itemIndex !== -1) {
      inventory[itemIndex] = { ...inventory[itemIndex], ...updates };
      currentData.inventory = inventory;
      await this.document.setFlag("campaign-codex", "data", currentData);
      this.render(false);
    }
  }

  async _onRemoveItem(event) {
    const itemUuid = event.currentTarget.dataset.itemUuid;
    const currentData = this.document.getFlag("campaign-codex", "data") || {};

    currentData.inventory = (currentData.inventory || []).filter(
      (i) => i.itemUuid !== itemUuid,
    );
    await this.document.setFlag("campaign-codex", "data", currentData);

    this.render(false);
  }

  async _onRemoveLocation(event) {
    const shopDoc = this.document;
    const shopData = shopDoc.getFlag("campaign-codex", "data") || {};
    const locationUuid = shopData.linkedLocation;

    if (!locationUuid) return;

    try {
      const locationDoc = await fromUuid(locationUuid);
      if (locationDoc) {
        const locationData =
          locationDoc.getFlag("campaign-codex", "data") || {};
        if (locationData.linkedShops) {
          locationData.linkedShops = locationData.linkedShops.filter(
            (uuid) => uuid !== shopDoc.uuid,
          );

          locationDoc._skipRelationshipUpdates = true;
          await locationDoc.setFlag("campaign-codex", "data", locationData);
          delete locationDoc._skipRelationshipUpdates;

          for (const app of Object.values(ui.windows)) {
            if (app.document?.uuid === locationDoc.uuid) {
              app.render(false);
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
      this.render(false);
    }
  }

  getSheetType() {
    return "shop";
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

    TemplateComponents.createPlayerSelectionDialog(
      item.name,
      async (targetActor) => {
        await this._transferItemToActor(item, targetActor);
      },
    );
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

      ui.notifications.info(`Sent "${item.name}" to ${targetActor.name}`);

      const targetUser = game.users.find(
        (u) => u.character?.id === targetActor.id,
      );
      if (targetUser && targetUser.active) {
        ChatMessage.create({
          content: `<p><strong>${game.user.name}</strong> sent you <strong>${item.name}</strong> from ${this.document.name}!</p>`,
          whisper: [targetUser.id],
        });
      }
    } catch (error) {
      console.error("Error transferring item:", error);
      ui.notifications.error("Failed to transfer item");
    }
  }

  _onItemDragStart(event) {
    const itemUuid = event.currentTarget.dataset.itemUuid;

    const dragData = {
      type: "Item",
      uuid: itemUuid,
      source: "shop",
      shopId: this.document.id,
    };

    event.originalEvent.dataTransfer.setData(
      "text/plain",
      JSON.stringify(dragData),
    );

    event.currentTarget.style.opacity = "0.5";
  }

  _onItemDragEnd(event) {
    event.currentTarget.style.opacity = "1";
  }

  async _onDropNPCsToMapClick(event) {
    event.preventDefault();

    const shopData = this.document.getFlag("campaign-codex", "data") || {};
    const linkedNPCs = await CampaignCodexLinkers.getLinkedNPCs(
      this.document,
      shopData.linkedNPCs || [],
    );

    if (linkedNPCs && linkedNPCs.length > 0) {
      await this._onDropNPCsToMap(linkedNPCs, {
        title: `Drop ${this.document.name} NPCs to Map`,
      });
    } else {
      ui.notifications.warn("No NPCs with linked actors found to drop!");
    }
  }
}
