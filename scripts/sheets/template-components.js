import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { localize, format, renderTemplate, isThemed, journalSystemClass } from "../helper.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { widgetManager } from "../widgets/WidgetManager.js";
import { gameSystemClass } from "../helper.js";

/**
 * A collection of static methods for generating HTML template components.
 */
export class TemplateComponents {

  // =========================================================================
  // Core Utilities
  // =========================================================================

  /**
   * Retrieves a default asset (icon or image) for a given entity type.
   * @param {string} assetType - The type of asset to get ("icon" or "image").
   * @param {string} entityType - The type of the entity (e.g., "region", "npc").
   * @param {string|null} [currentImg=null] - An existing image to use instead of the default.
   * @returns {string} The path or class for the requested asset.
   */
  static getAsset(assetType, entityType, currentImg = null) {
    const myModulePath = "/modules/campaign-codex/";
    const ASSET_MAP = {
      region: { icon: "fas fa-globe", image: myModulePath + "ui/region.webp" },
      location: { icon: "fas fa-map-marker-alt", image: myModulePath + "ui/location.webp" },
      shop: { icon: "fas fa-house", image: myModulePath + "ui/shop.webp" },
      npc: { icon: "fas fa-user", image: myModulePath + "ui/npc.webp" },
      item: { icon: "fas fa-box", image: myModulePath + "ui/item.webp" },
      group: { icon: "fas fa-sitemap", image: myModulePath + "ui/group.webp" },
      tag: { icon: "fas fa-tag", image: myModulePath + "ui/npc.webp" },
      quest: { icon: "fas fa-scroll", image: myModulePath + "ui/npc.webp" },
      default: {
        icon: "fas fa-question",
        image: myModulePath + "ui/default.webp",
      },
    };

    const assets = ASSET_MAP[entityType] || ASSET_MAP.default;

    if (assetType === "image") {
      return currentImg || assets.image;
    }

    if (assetType === "icon") {
      return assets.icon;
    }

    return ASSET_MAP.default.image;
  }

  // =========================================================================
  // General UI Components
  // =========================================================================

  /**
   * Generates a section header with an icon, title, and optional button.
   * @param {string} icon - The Font Awesome icon class.
   * @param {string} title - The header title text.
   * @param {string|null} [button=null] - An optional HTML string for a button.
   * @returns {string} The HTML for the content header.
   */
  static contentHeader(icon, title, button = null) {
    return `
      <div class="content-header">
        <h2><i class="${icon}"></i> ${title}</h2>
        ${button || ""}
      </div>
    `;
  }

  /**
   * Creates a rich text editor section, which is either read-only or editable based on ownership.
   * @param {object} docIn - The document context.
   * @param {string} enrichedValue - The pre-enriched HTML content.
   * @param {string} editlocation - The property path for the data source.
   * @param {boolean} [isOwner=false] - Whether the current user is an owner.
   * @returns {string} The HTML for the rich text section.
   */
  static richTextSection(docIn, enrichedValue, editlocation, isOwner = false) {
    const systemClass = gameSystemClass(game.system.id);
    const journalClass = journalSystemClass(game.system.id);

    if (!isOwner) {
      return `
        <article class="cc-enriched ${isThemed() ? 'themed':''} ${isThemed()} ${systemClass}">
          <section class="journal-entry-content cc-non-owner-view">
            ${enrichedValue}
          </section>
        </article>
      `;
    }

    const sheetData = docIn.getFlag("campaign-codex", "data") || {};
    let rawValue = sheetData[editlocation] || "";
    if (Array.isArray(rawValue)) {
      rawValue = rawValue[0] || "";
    }

    const escapedRawValue = foundry.utils.escapeHTML(rawValue);

    return `
      <article class="cc-enriched ${isThemed() ? 'themed':''} ${isThemed()} ${systemClass}">
        <section class="journal-entry-content">
          <prose-mirror name="flags.campaign-codex.data.${editlocation}" value="${escapedRawValue}" document-uuid="${docIn.uuid}" toggled class="journal-page-content cc-prosemirror ${journalClass} ${isThemed() ? 'themed':''} ${isThemed()}">
            ${enrichedValue}
          </prose-mirror>
        </section>
      </article>
    `;
  }

  /**
   * Generates a drop zone element for drag-and-drop functionality.
   * @param {string} type - The data type this zone accepts.
   * @param {string} icon - The Font Awesome icon class.
   * @param {string} title - The title text for the drop zone.
   * @param {string} description - The descriptive text.
   * @returns {string} The HTML for the drop zone.
   */
  static dropZone(type, icon, title, description) {
    return `
      <div class="drop-zone" data-drop-type="${type}">
        <div class="drop-content">
          <h3><i class="${icon}"></i> ${title}</h3>
          ${description ? `<p>${description}</p>` : ""}
        </div>
      </div>
    `;
  }

  /**
   * Generates a placeholder for when a list or grid is empty.
   * @param {string} type - The type of content that is missing.
   * @returns {string} The HTML for the empty state placeholder.
   */
  static emptyState(type) {
    const icons = {
      parentregion: "fas fa-book-atlas",
      region: "fas fa-globe",
      location: "fas fa-map-marker-alt",
      shop: "fas fa-book-open",
      npc: "fas fa-users",
      associate: "fas fa-users",
      item: "fas fa-boxes",
    };

    const messages = {
      parentregion: format("dropzone.empty", { type: localize("names.parentregions") }),
      region: format("dropzone.empty", { type: localize("names.regions") }),
      location: format("dropzone.empty", { type: localize("names.locations") }),
      shop: format("dropzone.empty", { type: localize("names.shops") }),
      npc: format("dropzone.empty", { type: localize("names.npcs") }),
      associate: format("dropzone.empty", { type: localize("names.associates") }),
      item: format("dropzone.empty", { type: localize("names.items") }),
    };

    const descriptions = {
      parentregion: format("dropzone.region", { type: localize("names.parentregions") }),
      region: format("dropzone.region", { type: localize("names.regions") }),
      location: format("dropzone.location", { type: localize("names.locations") }),
      shop: format("dropzone.shop", { type: localize("names.shop") }),
      npc: format("dropzone.npc", { type: localize("names.npcs") }),
      associate: format("dropzone.associate", { type: localize("names.npcs") }),
      item: format("dropzone.item", { type: localize("names.items") }),
    };

    return `
      <div class="empty-state">
        <i class="${icons[type] || "fas fa-question"}"></i>
        <h3>${messages[type] || localize("dropzone.empty")}</h3>
        <p>${descriptions[type] || localize("dropzone.generic")}</p>
      </div>
    `;
  }



  /**
   * Generates a small card for displaying a statistic.
   * @param {string} icon - The Font Awesome icon class.
   * @param {string|number} value - The value of the statistic.
   * @param {string} label - The label for the statistic.
   * @param {string|null} [color=null] - An optional background color for the icon.
   * @returns {string} The HTML for the stat card.
   */
  static statCard(icon, value, label, color = null) {
    return `
      <div class="stat-card">
        <div class="stat-icon" ${color ? `style="background: ${color};"` : ""}>
          <i class="${icon}"></i>
        </div>
        <div class="stat-content">
          <div class="stat-number">${value}</div>
          <div class="stat-label">${label}</div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // Quest Card Components
  // =========================================================================

  static async questList(docIn, quests, isGM, isGroupSheet = false) {
    if (!quests) {
      return;
    }
    let label = localize("names.quests");
      if (docIn)
      {
        const tabOverrides = docIn.getFlag("campaign-codex", "tab-overrides");
        if (Array.isArray(tabOverrides)) {
        const override = tabOverrides.find(tab => tab.key === "quests");
        if (override && override.label) label = override.label ;
      }
    }
  
    const addButton = isGM
      ? '<i class="fas fa-circle-plus add-quest refresh-btn"></i>'
      : "";
    const visibleQuests = isGM ? quests : quests.filter((q) => q.visible);

    const hideInventoryByPermission = game.settings.get("campaign-codex", "hideInventoryByPermission");

    const processedQuests = await Promise.all(
      visibleQuests.map(async (quest) => {
        const inventoryWithoutPerms = await CampaignCodexLinkers.getInventory(docIn, quest.inventory || []);
        const processedInventory = await Promise.all(
          inventoryWithoutPerms.map(async (item) => {
            const canView = await CampaignCodexBaseSheet.canUserView(item.uuid || item.itemUuid);
            return { ...item, canView, type: "item" };
          }),
        );
        const finalItems = hideInventoryByPermission
          ? processedInventory.filter((item) => item.canView)
          : processedInventory;
        return {
          ...quest,
          inventory: finalItems,
          canEdit: isGM && !isGroupSheet,
        };
      }),
    );

    const hideSection = !processedQuests || processedQuests.length === 0;
    const journalClass = journalSystemClass(game.system.id);
    const themed = isThemed() ? `themed ${isThemed()}` :``;
    const templateData = {
      hide: hideSection,
      doc: docIn,
      quests: processedQuests,
      isGM: isGM,
      isGroupSheet: isGroupSheet,
      header: this.contentHeader("fas fa-scroll", label, addButton),
      systemClass: gameSystemClass(game.system.id),
      themed:themed,
      journalClass:journalClass,
    };

    return renderTemplate("modules/campaign-codex/templates/quests/quest-list.hbs", templateData);
  }

  // =========================================================================
  // Entity & Card Components
  // =========================================================================
  static getHandlerName(type) {
    if (!type) return "remove"; // Handle empty input
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  /**
   * Generates a grid of entity cards.
   * @param {Array<object>} entities - The entities to display.
   * @param {string} type - The entity type.
   * @param {boolean} [showActorButton=false] - Whether to show a button to open the linked actor.
   * @param {boolean} [disableRemove=false] - Whether to disable the remove button.
   * @returns {string} The HTML for the entity grid.
   */
  static entityGrid(entities, type, showActorButton = false, disableRemove = false) {
    if (!entities || entities.length === 0) {
      return this.emptyState(type);
    }

    const alphaCards = game.settings.get("campaign-codex", "sortCardsAlpha");
    const entitiesToRender = alphaCards ? [...entities].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) : entities;

    return `
      <div class="entity-grid">
        ${entitiesToRender.map((entity) => this.entityCard(entity, type, showActorButton, disableRemove)).join("")}
      </div>
    `;
  }

  /**
   * Generates a single card for an entity.
   * @param {object} entity - The entity data.
   * @param {string} type - The entity type.
   * @param {boolean} [showActorButton=false] - Whether to show the open actor button.
   * @param {boolean} [disableRemove=false] - Whether to disable the remove button.
   * @returns {string} The HTML for the entity card.
   */
  static entityCard(entity, type, showActorButton = false, disableRemove = false, customData = {}) {
    const customDataAttr = Object.entries(customData)
      .map(([key, value]) => `${key}="${value}"`)
      .join(" ");
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    if (hideByPermission && !entity.canView) {
      return "";
    }

    const isShopSource = entity.source === "shop";
    const sourceAttr = entity.source ? `data-source="${entity.source}"` : "";

    let removeButton = "";
    if (disableRemove) {
      removeButton = `data-remove-disabled="true"`;
    } 

    return `
        ${
          entity.canView
            ? `<div class="entity-card ${type}-card open-${type} ${entity.showImage ? ``:`hide-entity-image`}" data-action="open${this.getHandlerName(type)}" data-type="${type}" ${removeButton} data-uuid="${entity.uuid}" ${customDataAttr} draggable="true" data-drag="true" data-entry-id="${entity.id}" style="cursor: pointer; position:relative;" ${sourceAttr}>`
            : `<div class="entity-card ${type}-card ${entity.showImage ? ``:`hide-entity-image`}" style="position:relative;" ${customDataAttr} ${sourceAttr}>`
        } 
        <div class="entity-image ${entity.showImage ? ``:`hide-entity-image`}">
          <img src="${entity.img}" alt="${entity.name}">
        </div>
        <div class="entity-content">
          <h4 class="entity-name">${entity.name}</h4>
          ${entity.meta ? `<div class="entity-meta">
            ${entity.meta || `<span class="entity-type">${type}</span>`}
          </div>` :``}
          ${
            entity.locations && entity.locations.length > 0
              ? `
            <div class="entity-locations">
              <i class="fas fa-map-marker-alt"></i>
              ${entity.locations.map((loc) => `<span class="location-tag">${loc}</span>`).join("")}
            </div>
          `
              : ""
          }
          ${
            entity.regions && entity.regions.length > 0
              ? `
            <div class="entity-locations">
              <i class="fas fa-globe"></i>
              ${entity.regions.map((reg) => `<span class="location-tag">${reg}</span>`).join("")}
            </div>
          `
              : ""
          }
          ${
            entity.shops && entity.shops.length > 0
              ? `
            <div class="entity-locations shop-tags">
              <i class="fas fa-book-open"></i>
              ${entity.shops.map((shop) => `<span class="location-tag shop-tag">${shop}</span>`).join("")}
            </div>
          `
              : ""
          }
          ${
            entity.tags && entity.tags.length > 0
              ? `
            <div class="entity-locations tag-mode-tags">
              <i class="fas fa-tag"></i>
              ${entity.tags.map((tag) => `<span class="location-tag tag-mode">${tag}</span>`).join("")}
            </div>
          `
              : ""
          }              
        </div>
      </div>
    `;
  }

  /**
   * Generates a small card for a linked actor.
   * @param {object} actor - The actor data.
   * @param {boolean} [showActions=true] - Whether to show action buttons.
   * @returns {string} The HTML for the linked actor card.
   */
  static actorLinkCard(actor, showActions = true) {
    return `
      <div class="linked-actor-card linked-actor" data-uuid="${actor.uuid}">
        <div class="actor-image">
          <img src="${actor.img}" alt="${actor.name}">
        </div>
        <div class="actor-content" data-action="openActor" data-uuid="${actor.uuid}" title="${localize("title.open.actor")}">
          <h4 class="actor-name">${actor.name}</h4>
        </div>
      </div>
    `;
  }


  // =========================================================================
  // Journal Components
  // =========================================================================

  /**
   * Creates a grid of cards for linked standard journals.
   * @param {Array<object>} journals - The array of linked journal data.
   * @param {boolean} isGM - Whether the current user is a GM.
   * @returns {string} The HTML for the journal grid.
   */
  static standardJournalGrid(journals, disableRemove = false, disableDrop = false) {
    if (!journals || journals.length === 0) {
      if (game.user.isGM && !disableDrop) {
        return this.dropZone("journal", "fas fa-book", format("dropzone.link", { type: localize("names.journals") }));
      }
      return "";
    }
    const journalCards = journals.map((journal) => this.standardJournalCard(journal, disableRemove)).join("");
    return `
        <div class="entity-grid journal-grid">
            ${journalCards}
        </div>
    `;
  }

  /**
   * Creates a single card for a linked standard journal.
   * @param {object} journal - The journal data object.
   * @param {boolean} isGM - Whether the user is a GM.
   * @returns {string} The HTML for the journal card.
   */
  static standardJournalCard(journal, disableRemove = false) {
    const iconClass = journal.uuid.includes("JournalEntryPage") ? "fas fa-book-bookmark" : "fas fa-book";
    const contextOverride = disableRemove ? ``:`data-removable="true"`;
    return `
        <div class="entity-card journal-card open-journal" data-action="openJournal" ${contextOverride} data-uuid="${journal.uuid}" style="cursor: pointer;" data-type="journal">
            <div class="entity-content" style="display: flex; align-items: center; gap: 8px; flex-grow: 1;">
                 <i class="${iconClass}" style="font-size: 1.5em; flex-shrink: 0;"></i>
                 <h4 class="entity-name">${journal.name}</h4>
            </div>
        </div>
    `;
  }

  // =========================================================================
  // Dialogs
  // =========================================================================

static async createPlayerSelectionDialog(itemName, onPlayerSelected) {
    const allowedTypes = ["character", "player", "group"];
    
    const playerCharacters = game.actors
      .filter((actor) => actor.type && allowedTypes.includes(actor.type.toLowerCase()))
      .sort((a, b) => {
        const aAssigned = game.users.some(u => u.character?.uuid === a.uuid);
        const bAssigned = game.users.some(u => u.character?.uuid === b.uuid);

        if (aAssigned && !bAssigned) return -1;
        if (!aAssigned && bAssigned) return 1;
        return a.name.localeCompare(b.name);
      });

    if (playerCharacters.length === 0) {
      ui.notifications.warn("No player characters found");
      return;
    }

    const content = `
      <div class="player-selection header campaign-codex">
        <p>Send <strong>${itemName}</strong> to which player character?</p>
        
        <div class="form-group" style="margin-bottom: 10px;">
            <input type="text" name="filter" placeholder="Filter Characters..." autocomplete="off">
        </div>
        <div class="form-group" style="display: flex; align-items: center; margin-bottom: 5px;">
           <input type="checkbox" name="deductFunds" id="deductFunds" style="margin-right: 8px;"> 
           <label for="deductFunds" style="cursor: pointer;">Deduct funds from actor</label>
        </div>
      </div>
      <div class="player-selection campaign-codex">

        <div class="player-list">
          ${playerCharacters
            .map((char) => {
              const assignedUser = game.users.find((u) => u.character?.uuid === char.uuid);
              const userInfo = assignedUser ? ` (${assignedUser.name})` : " (Unassigned)";

              return `
              <div class="player-option" data-actor-uuid="${char.uuid}" >
                <img src="${char.img}" alt="${char.name}" style="width: 32px; height: 32px; border-radius: 4px; margin-right: 8px;">
                <div class="player-info">
                  <span class="character-name" >${char.name}</span>
                  <span class="user-info" >${userInfo}</span>
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      </div>
    `;

    const dialog = new foundry.applications.api.DialogV2({
      window: {
        title: "Send Item to Player Character",
      },
      classes: ["campaign-codex", "send-to-player"],
      content: content,
      buttons: [
        {
          action: "cancel",
          icon: "fas fa-times",
          label: "Cancel",
        },
      ],
    });

    await dialog.render(true);

    const filterInput = dialog.element.querySelector("input[name='filter']");
    const deductCheckbox = dialog.element.querySelector("input[name='deductFunds']");
    const playerOptions = dialog.element.querySelectorAll(".player-option");

    filterInput.focus();

    filterInput.addEventListener("input", (event) => {
      const query = event.target.value.toLowerCase().trim();
      
      playerOptions.forEach((option) => {
        const name = option.querySelector(".character-name").innerText.toLowerCase();
        const user = option.querySelector(".user-info").innerText.toLowerCase();
        const match = name.includes(query) || user.includes(query);
        option.style.display = match ? "flex" : "none";
      });
    });

    playerOptions.forEach((element) => {
      element.addEventListener("click", async (event) => {
        const actorUuid = event.currentTarget.dataset.actorUuid;
        const actor = await fromUuid(actorUuid);
        const shouldDeduct = deductCheckbox.checked;
        if (actor) {
          onPlayerSelected(actor, shouldDeduct);
        }
        dialog.close();
      });
    
    });
  }


}