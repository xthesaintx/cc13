import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { localize, format, renderTemplate } from "../helper.js";

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
      region: {icon: "fas fa-globe", image: myModulePath + "ui/region.webp" },
      location: {icon: "fas fa-map-marker-alt", image: myModulePath + "ui/location.webp"},
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
    const systemClass =
      game.system.id === "dnd5e" ? " dnd5e2-journal themed theme-light" : "";

    if (!isOwner) {
      return `
        <article class="journal-entry-page cc-enriched${systemClass}">
          <section class="journal-page-content">
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
      <article class="journal-entry-page cc-enriched${systemClass}">
        <section class="journal-page-content">
          <prose-mirror name="flags.campaign-codex.data.${editlocation}" value="${escapedRawValue}" document-uuid="${docIn.uuid}" toggled class="journal-page-content cc-prosemirror">
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
      region: "fas fa-globe",
      location: "fas fa-map-marker-alt",
      shop: "fas fa-book-open",
      npc: "fas fa-users",
      associate: "fas fa-users",
      item: "fas fa-boxes",
    };

    const messages = {
      region: format("dropzone.empty", { type: localize("names.regions") }),
      location: format("dropzone.empty", { type: localize("names.locations") }),
      shop: format("dropzone.empty", { type: localize("names.shops") }),
      npc: format("dropzone.empty", { type: localize("names.npcs") }),
      associate: format("dropzone.empty", {type: localize("names.associates")}),
      item: format("dropzone.empty", { type: localize("names.items") }),
    };

    const descriptions = {
      region: format("dropzone.region", {type: localize("names.regions"),}),
      location: format("dropzone.location", {type: localize("names.locations"),}),
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
   * Generates an informational banner.
   * @param {string} message - The message to display in the banner.
   * @returns {string} The HTML for the banner.
   */
  static infoBanner(message) {
    return `
      <div class="info-banner">
        <i class="fas fa-info-circle"></i>
        <p>${message}</p>
      </div>
    `;
  }

  /**
   * Generates a set of filter buttons.
   * @param {Array<object>} filters - An array of filter objects with 'key' and 'label' properties.
   * @returns {string} The HTML for the filter buttons.
   */
  static filterButtons(filters) {
    return `
      <div class="filter-buttons">
        ${filters
          .map(
            (filter, index) => `
          <button type="button" class="filter-btn ${index === 0 ? "active" : ""}" data-filter="${filter.key}">
            ${filter.label}
          </button>
        `,
          )
          .join("")}
      </div>
    `;
  }

  /**
   * Generates a control for setting a global price markup.
   * @param {number} markup - The current markup value.
   * @returns {string} The HTML for the markup control.
   */
  static markupControl(markup) {
    if (!game.user.isGM) {
      return "";
    }
    return `
      <div class="markup-control">
        <h3><i class="fas fa-percentage"></i> ${localize("inventory.global.markup")}</h3>
        <div class="markup-input-group">
          <input type="number" class="markup-input" value="${markup}" min="0.1" max="10" step="0.1">
          <span class="markup-label">x ${localize("inventory.price.base")}</span>
        </div>
        <p class="markup-help">${localize("inventory.help.markup")}</p>
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
  if (!quests){return};
    const addButton = isGM ? '<button type="button" class="add-quest refresh-btn"><i class="fas fa-circle-plus"></i></button>' : '';
    const visibleQuests = isGM ? quests : quests.filter(q => q.visible);
    const processedQuests = visibleQuests.map(quest => {
        return {
            ...quest,
            canEdit: isGM && !isGroupSheet 
        };
    });

    const templateData = {
      doc: docIn,
      quests: processedQuests,
      isGM: isGM,
      isGroupSheet: isGroupSheet,
      header: this.contentHeader("fas fa-scroll", "Quests", addButton),
      systemClass: game.system.id === "dnd5e" ? " dnd5e2-journal themed theme-light" : ""
    };

    return renderTemplate("modules/campaign-codex/templates/quests/quest-list.hbs", templateData);
  }


  // =========================================================================
  // Entity & Card Components
  // =========================================================================

  /**
   * Generates a grid of entity cards.
   * @param {Array<object>} entities - The entities to display.
   * @param {string} type - The entity type.
   * @param {boolean} [showActorButton=false] - Whether to show a button to open the linked actor.
   * @param {boolean} [disableRemove=false] - Whether to disable the remove button.
   * @returns {string} The HTML for the entity grid.
   */
  static entityGrid(entities, type, showActorButton = false, disableRemove = false) {
    // console.log(entities);
    if (!entities || entities.length === 0) {
      return this.emptyState(type);
    }

    const alphaCards = game.settings.get("campaign-codex", "sortCardsAlpha");
    const entitiesToRender = alphaCards
      ? [...entities].sort((a, b) => a.name.localeCompare(b.name))
      : entities;

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
    const hideByPermission = game.settings.get(
      "campaign-codex",
      "hideByPermission",
    );
    if (hideByPermission && !entity.canView) {
      return "";
    }

    const actorButton =
      showActorButton && entity.actor && entity.canViewActor
        ? `<button type="button" class="action-btn open-actor" data-actor-uuid="${entity.actor.uuid}" title="${localize("title.open.actor")}">
            <i class="fas fa-user"></i>
           </button>`
        : "";

    const isShopSource = entity.source === "shop";
    const sourceAttr = entity.source ? `data-source="${entity.source}"` : "";
    
    let removeButton = "";
    if (disableRemove) {
      const entityTypeName =
        type === "location" ? "shop-based locations" : "entry NPCs";
      removeButton = `
        <button type="button" class="action-btn disabled-rmv" title="${format('warn.directly', { type: localize('names.'+type) })}" style="opacity: 0.3; cursor: not-allowed; background: #dc3545; color: white; border-color: #dc3545;" disabled>
          <i class="fas fa-link-slash"></i>
        </button>
      `;
    } else {
      removeButton = `
        <button type="button" class="action-btn remove-${type}" data-${type}-uuid="${entity.uuid}" title="${format('warn.remove', { type: localize('names.'+type) })}">
          <i class="fas fa-link-slash"></i>
        </button>
      `;
    }
    return `
        ${
            entity.canView
              ? `<div class="entity-card ${type}-card open-${type}" data-${type}-uuid="${entity.uuid}" ${customDataAttr} style="cursor: pointer; position:relative;" ${sourceAttr}>`
              : `<div class="entity-card ${type}-card" ${customDataAttr} ${sourceAttr}>`
          } 
        <div class="entity-image">
          <img src="${entity.img}" alt="${entity.name}">
        </div>
        <div class="entity-content">
          <h4 class="entity-name">${entity.name}</h4>
          <div class="entity-meta">
            ${entity.meta || `<span class="entity-type">${type}</span>`}
          </div>
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
        <div class="entity-actions">
          ${game.user.isGM ? `${removeButton}` : ""}
          ${entity.canView ? actorButton : ""}
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
    const actions = showActions
      ? `
      <div class="actor-actions">
        ${
          actor.canView
            ? `
          <button type="button" class="action-btn open-actor" data-actor-uuid="${actor.uuid}" title="${localize("title.open.actor")}">
            <i class="fas fa-user"></i>
          </button>
        `
            : ""
        }
        ${
          game.user.isGM
            ? `<button type="button" class="action-btn remove-actor" title="${localize("title.unlink.actor")}">
                <i class="fas fa-unlink"></i>
               </button>`
            : ""
        }
      </div>
    `
      : "";

    return `
      <div class="linked-actor-card">
        <div class="actor-image">
          <img src="${actor.img}" alt="${actor.name}">
        </div>
        <div class="actor-content">
          <h4 class="actor-name">${actor.name}</h4>
        </div>
        ${actions}
      </div>
    `;
  }

  // =========================================================================
  // Inventory Components
  // =========================================================================

  /**
   * Generates an inventory table for items.
   * @param {Array<object>} inventory - The array of item data.
   * @param {boolean} [isLootMode=false] - If true, hides pricing columns.
   * @returns {string} The HTML for the inventory table.
   */
  static inventoryTable(inventory, isLootMode = false) {
    const hideBase = game.settings.get("campaign-codex", "hideBaseCost");
      const hideByPermission = game.settings.get(
          "campaign-codex",
          "hideInventoryByPermission",
        );

    if (!inventory || inventory.length === 0) {
      return this.emptyState("item");
    }

    const sortButton = `<button type="button" class="sort-btn sort-inventory-alpha" title="${localize("title.sort.alphabetically")}"><i class="fas fa-sort-alpha-down"></i></button>`;

    const priceHeader = isLootMode
      ? ""
      : hideBase
        ? `<div class="cc-inv-price-table">${localize("inventory.price.name")}</div>`
        : `
          <div class="cc-inv-price-table">${localize("inventory.price.base")}</div>
          <div class="cc-inv-price-table">${localize("inventory.price.final")}</div>
        `;

    const gridColumns = isLootMode
      ? "cc-loot-mode"
      : hideBase
        ? "cc-hide-base"
        : "cc-shop-mode";

    const inventoryRows = inventory
      .map((item) => {
        if (hideByPermission && !item.canView) {
          return "";
        }
        const priceColumns = isLootMode
          ? ""
          : `
            ${
              !hideBase
                ? `
              <div class="item-base-price cc-inv-price-table">
                ${item.basePrice} ${item.currency}
              </div>`
                : ""
            }
            <div class="item-final-price cc-inv-price-table">
              <input type="number" class="price-input" data-item-uuid="${item.itemUuid}" value="${item.finalPrice}" step="0.01" min="0">
              <span class="price-currency">${item.currency}</span>
            </div>
          `;
        return `
          <div class="inventory-item ${gridColumns}" data-item-uuid="${item.itemUuid}" data-item-name="${item.name}">
            <div class="item-image">
              <img src="${item.img}" alt="${item.name}">
            </div>
            <div class="item-details">
              <div class="item-name">${item.name}</div>
            </div>
            ${priceColumns}
            <div class="quantity-control" style="text-align:center">
              <button type="button" class="quantity-btn quantity-decrease" data-item-uuid="${item.itemUuid}">
                <i class="fas fa-minus"></i>
              </button>
              <input type="number" class="quantity-input" data-item-uuid="${item.itemUuid}" value="${item.quantity}" min="0">
              <button type="button" class="quantity-btn quantity-increase" data-item-uuid="${item.itemUuid}">
                <i class="fas fa-plus"></i>
              </button>
            </div>
            <div class="item-actions" style="text-align:center">
              <button type="button" class="action-btn open-item" data-item-uuid="${item.itemUuid}" title="${localize("title.open.sheet")}">
                <i class="fas fa-external-link-alt"></i>
              </button>
              ${
                game.user.isGM
                  ? `<button type="button" class="action-btn send-to-player" data-item-uuid="${item.itemUuid}" title="${localize("title.send.player")}">
                      <i class="fas fa-paper-plane"></i>
                    </button>
                    <button type="button" class="action-btn remove-item" data-item-uuid="${item.itemUuid}" title="${localize("title.remove.item")}">
                      <i class="fas fa-trash"></i>
                    </button>`
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="inventory-table">
        <div class="table-header ${gridColumns}">
          <div>${sortButton}</div>
          <div style="align-content: center;">${localize("inventory.item.name")}</div>
          ${priceHeader}
          <div class="cc-inv-price-table">${localize("inventory.quantity")}</div>
          <div class="cc-inv-price-table">${localize("inventory.actions")}</div>
        </div>
        ${inventoryRows}
      </div>
    `;
  }

  // =========================================================================
  // Group Components
  // =========================================================================

  /**
   * Generates a card for a group member, which can be expanded to show children.
   * @param {object} member - The primary group member data.
   * @param {Array<object>} [children=[]] - An array of child members.
   * @returns {string} The HTML for the group member card.
   */
  static groupMemberCard(member, children = []) {
    const childrenCount = children.length;
    const hasChildren = childrenCount > 0;

    return `
      <div class="group-member-card" data-uuid="${member.uuid}" data-type="${member.type}">
        <div class="member-header ${hasChildren ? "expandable" : ""}" data-uuid="${member.uuid}">
          ${hasChildren ? '<i class="fas fa-chevron-right expand-icon"></i>' : '<i class="member-spacer"></i>'}
          <img src="${member.img}" class="member-icon" alt="${member.name}">
          <div class="member-info">
            <span class="member-name">${member.name}</span>
            <span class="member-type">${member.type}</span>
            ${hasChildren ? `<span class="member-count">(${childrenCount})</span>` : ""}
          </div>
          <div class="member-actions">
            <button type="button" class="btn-open-sheet" data-uuid="${member.uuid}" title="${localize("title.open.sheet")}">
              <i class="fas fa-external-link-alt"></i>
            </button>
            ${
              game.user.isGM
                ? `<button type="button" class="btn-remove-member" data-uuid="${member.uuid}" title="${localize("title.remove.from.group")}">
                    <i class="fas fa-times"></i>
                  </button>`
                : ""
            }
          </div>
        </div>
        
        ${
          hasChildren
            ? `
          <div class="member-children" style="display: none;">
            ${children
              .map(
                (child) => `
              <div class="child-member" data-uuid="${child.uuid}">
                <img src="${child.img}" class="child-icon" alt="${child.name}">
                <span class="child-name">${child.name}</span>
                <span class="child-type">${child.type}</span>
                <div class="child-actions">
                  <button type="button" class="btn-open-sheet" data-uuid="${child.uuid}" title="${localize("title.open.sheet")}">
                    <i class="fas fa-external-link-alt"></i>
                  </button>
                  <button type="button" class="btn-focus-item" data-uuid="${child.uuid}" title="${localize("title.focus.in.tab")}">
                    <i class="fas fa-search"></i>
                  </button>
                </div>
              </div>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
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
static standardJournalGrid(journals, disableRemove = false) {
    // If there are no journals to display
    if (!journals || journals.length === 0) {
        // Show a drop zone for GMs to add one
        if (game.user.isGM) {
            return this.dropZone("journal", "fas fa-book", format("dropzone.link", { type: localize("names.journals") }));
        }
        // Otherwise, show nothing
        return "";
    }

    // Create a card for each journal
    const journalCards = journals.map(journal => this.standardJournalCard(journal, disableRemove)).join("");

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
    // Only show the remove button to GMs
    const removeButton = game.user.isGM ? `
        <button type="button" class="action-btn remove-standard-journal" data-journal-uuid="${journal.uuid}" title="${format('message.unlink', { type: localize('names.journal') })}">
            <i class="fas fa-unlink"></i>
        </button>
    ` : "";

    // Determine the correct icon based on whether the UUID is for a page or a whole entry
    const iconClass = journal.uuid.includes("JournalEntryPage") ? "fas fa-book-bookmark" : "fas fa-book";

    return `
        <div class="entity-card journal-card open-journal" data-journal-uuid="${journal.uuid}" style="cursor: pointer;">
            <div class="entity-content" style="display: flex; align-items: center; gap: 8px; flex-grow: 1;">
                 <i class="${iconClass}" style="font-size: 1.5em; flex-shrink: 0;"></i>
                 <h4 class="entity-name">${journal.name}</h4>
            </div>
            ${!disableRemove ? `<div class="entity-actions">
                ${removeButton}
            </div>`:""}
        </div>
    `;
}


  // =========================================================================
  // Dialogs
  // =========================================================================

  /**
   * Creates and renders a dialog for selecting a player character.
   * @param {string} itemName - The name of the item being sent.
   * @param {function} onPlayerSelected - The callback function to execute with the selected actor.
   */
  static async createPlayerSelectionDialog(itemName, onPlayerSelected) {
    const playerCharacters = game.actors.filter(
      (actor) => actor.type === "character",
    );

    if (playerCharacters.length === 0) {
      ui.notifications.warn("No player characters found");
      return;
    }

    const content = `
      <div class="player-selection campaign-codex">
        <p>Send <strong>${itemName}</strong> to which player character?</p>
        <div class="player-list">
          ${playerCharacters
            .map((char) => {
              const assignedUser = game.users.find(
                (u) => u.character?.uuid === char.uuid,
              );
              const userInfo = assignedUser
                ? ` (${assignedUser.name})`
                : " (Unassigned)";

              return `
              <div class="player-option" data-actor-uuid="${char.uuid}">
                <img src="${char.img}" alt="${char.name}" style="width: 32px; height: 32px; border-radius: 4px; margin-right: 8px;">
                <div class="player-info">
                  <span class="character-name">${char.name}</span>
                  <span class="user-info">${userInfo}</span>
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      </div>
    `;

    new Dialog({
      title: "Send Item to Player Character",
      content: content,
      buttons: {
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
        },
      },
      render: (html) => {
        const nativeHtml = html instanceof jQuery ? html[0] : html;
        nativeHtml.querySelectorAll(".player-option").forEach((element) => {
          element.addEventListener("click", async (event) => {
            const actorUuid = event.currentTarget.dataset.actorUuid;
            const actor = await fromUuid(actorUuid);
            if (actor) {
              onPlayerSelected(actor);
            }
            nativeHtml
              .closest(".dialog")
              .querySelector(".dialog-button.cancel")
              .click();
          });
        });
      },
    }).render(true);
  }
}
