import { CampaignCodexBaseSheet } from "./base-sheet.js";

export class TemplateComponents {
  static getAsset(assetType, entityType, currentImg = null) {
    const myModulePath = "/modules/campaign-codex/";
    const ASSET_MAP = {
      region: { icon: "fas fa-globe", image: myModulePath + "ui/region.webp" },
      location: {
        icon: "fas fa-map-marker-alt",
        image: myModulePath + "ui/location.webp",
      },
      shop: { icon: "fas fa-house", image: myModulePath + "ui/shop.webp" },
      npc: { icon: "fas fa-user", image: myModulePath + "ui/npc.webp" },
      item: { icon: "fas fa-tag", image: myModulePath + "ui/item.webp" },
      group: { icon: "fas fa-sitemap", image: myModulePath + "ui/group.webp" },
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

  static async prepareEntitiesWithPermissions(entities) {
    if (!entities || !entities.length === 0) return [];
    const permissionPromises = entities.map((entity) => {
      const entityPromise = CampaignCodexBaseSheet.canUserView(entity.uuid);
      const actorPromise = entity.actor?.uuid
        ? CampaignCodexBaseSheet.canUserView(entity.actor.uuid)
        : Promise.resolve(false);
      return Promise.all([entityPromise, actorPromise]);
    });

    const allPermissions = await Promise.all(permissionPromises);

    return entities.map((entity, index) => {
      const [canViewEntity, canViewActor] = allPermissions[index];
      return {
        ...entity,
        canView: canViewEntity,
        canViewActor: canViewActor,
      };
    });
  }

  static richTextSection(
    label,
    icon,
    enrichedValue,
    editlocation,
    isOwner = false,
  ) {
    const systemClass = game.system.id === "dnd5e" ? " dnd5e2" : "";
    const journalClass =
      game.system.id === "dnd5e" ? "journal-entry-content dnd5e2 themed theme-light" : "";

    if (!isOwner)
      return `
      <div class="form-section${systemClass}" name="proseedited">
        <label class="form-label">
          <i class="${icon}"></i>
          ${label}
        </label>
      <div class="${journalClass}">
      ${enrichedValue}
      </div>
      </div>
    `;

    return `
      <div class="form-section${systemClass}" name="proseedited">
        <label class="form-label">
          <i class="${icon}"></i>
          ${label}
          <a class="cc-edit-${editlocation}" title="Edit"><i class="fas fa-edit" style="margin-left: 8px; cursor: pointer;"></i></a>
        </label>
      <div class="${journalClass}">
      ${enrichedValue}
      </div>
      </div>
    `;
  }

  static formSection(label, icon, name, placeholder, value = "", rows = 4) {
    return `
      <div class="form-section">
        <label class="form-label">
          <i class="${icon}"></i>
          ${label}
        </label>
        <textarea name="${name}" class="form-textarea" rows="${rows}" placeholder="${placeholder}">${value}</textarea>
      </div>
    `;
  }

  static dropZone(type, icon, title, description) {
    return `
      <div class="drop-zone" data-drop-type="${type}">
        <div class="drop-content">
          <h3><i class="${icon}"></i> ${title}</h3>
          <p>${description}</p>
        </div>
      </div>
    `;
  }

  static entityGrid(entities, type, showActorButton = false) {
    if (!entities || entities.length === 0) {
      return this.emptyState(type);
    }

    const alphaCards = game.settings.get("campaign-codex", "sortCardsAlpha");
    const entitiesToRender = alphaCards
      ? [...entities].sort((a, b) => a.name.localeCompare(b.name))
      : entities;

    return `
      <div class="entity-grid">
        ${entitiesToRender.map((entity) => this.entityCard(entity, type, showActorButton)).join("")}
      </div>
    `;
  }

  static entityCard(entity, type, showActorButton = false) {
    const hideByPermission = game.settings.get(
      "campaign-codex",
      "hideByPermission",
    );
    if (hideByPermission && !entity.canView) {
      // If both are true, return an empty string so no card is created.
      return "";
    }
    const actorButton =
      showActorButton && entity.actor && entity.canViewActor
        ? `
    <button type="button" class="action-btn open-actor" data-actor-uuid="${entity.actor.uuid}" title="Open Actor Sheet">
      <i class="fas fa-user"></i>
    </button>
  `
        : "";

    const isShopSource = entity.source === "shop";
    const isDirectSource = entity.source === "direct";
    const sourceAttr = entity.source ? `data-source="${entity.source}"` : "";

    let removeButton = "";
    if (isShopSource && (type === "location" || type === "npc")) {
      const entityTypeName =
        type === "location" ? "shop-based locations" : "entry NPCs";
      removeButton = `
        <button type="button" class="action-btn remove-${type}" data-${type}-uuid="${entity.uuid}" title="Cannot remove ${entityTypeName} directly" style="opacity: 0.3; cursor: not-allowed; background: #dc3545; color: white; border-color: #dc3545;">
          <i class="fas fa-ban"></i>
        </button>
      `;
    } else {
      removeButton = `
        <button type="button" class="action-btn remove-${type}" data-${type}-uuid="${entity.uuid}" title="Remove ${type}">
          <i class="fas fa-times"></i>
        </button>
      `;
    }

    return `
      <div class="entity-card ${type}-card" ${sourceAttr}>
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
        </div>
        <div class="entity-actions">
          ${
            entity.canView
              ? `<button type="button" class="action-btn open-${type}" data-${type}-uuid="${entity.uuid}" title="Open ${type}">
            <i class="fas fa-external-link-alt"></i>
          </button>`
              : ""
          }
          ${game.user.isGM ? `${removeButton}` : ""}
          ${entity.canView ? actorButton : ""}
        </div>
      </div>
    `;
  }

  static emptyState(type) {
    const icons = {
      location: "fas fa-map-marker-alt",
      shop: "fas fa-book-open",
      npc: "fas fa-users",
      associate: "fas fa-users",
      item: "fas fa-boxes",
    };

    const messages = {
      location: "No Locations",
      shop: "No Entries",
      npc: "No NPCs",
      associate: "No Associates",
      item: "No Items",
    };

    const descriptions = {
      location: "Drag location journals here to add them",
      shop: "Drag entry journals here to add them",
      npc: "Drag NPCs here to add them",
      associate: "Drag NPCs here to create relationships",
      item: "Drag items here to add to inventory",
    };

    return `
      <div class="empty-state">
        <i class="${icons[type] || "fas fa-question"}"></i>
        <h3>${messages[type] || "No Items"}</h3>
        <p>${descriptions[type] || "Drag items here"}</p>
      </div>
    `;
  }

  static contentHeader(icon, title, button = null) {
    return `
      <div class="content-header">
        <h2><i class="${icon}"></i> ${title}</h2>
        ${button || ""}
      </div>
    `;
  }

  static actorLinkCard(actor, showActions = true) {
    const actions = showActions
      ? `
      <div class="actor-actions">
      ${
        actor.canView
          ? `
        <button type="button" class="action-btn open-actor" data-actor-uuid="${actor.uuid}" title="Open Actor Sheet">
          <i class="fas fa-user"></i>
        </button>
      `
          : ""
      }
        ${
          game.user.isGM
            ? `<button type="button" class="action-btn remove-actor" title="Unlink Actor">
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

  static inventoryTable(inventory, isLootMode = false) {
    const hideBase = game.settings.get("campaign-codex", "hideBaseCost");

    if (!inventory || inventory.length === 0) {
      return this.emptyState("item");
    }

    const sortButton = `<button type="button" class="sort-btn sort-inventory-alpha" title="Sort Inventory Alphabetically"><i class="fas fa-sort-alpha-down"></i></button>`;

    const priceHeader =
      isLootMode || hideBase
        ? ""
        : `
    <div style="text-align:center;align-content: center;">Base Price</div>
    <div style="text-align:center;align-content: center;">Final Price</div>
  `;

    const headerGridColumns = isLootMode
      ? "grid-template-columns: 60px minmax(100px, 2fr) minmax(100px, 120px) 68px"
      : hideBase
        ? "grid-template-columns: 60px minmax(100px, 2fr) minmax(80px, 100px) minmax(100px, 120px) 68px"
        : "grid-template-columns: 60px minmax(100px, 2fr) minmax(80px, 100px) minmax(80px, 100px) minmax(100px, 120px) 68px";

    const inventoryRows = inventory
      .map((item) => {
        const priceColumns = isLootMode
          ? ""
          : `
      ${
        !hideBase
          ? `
        <div class="item-base-price" style="text-align:center;align-content: center;">
          ${item.basePrice} ${item.currency}
        </div>`
          : ""
      }
      <div class="item-final-price" style="text-align:center;align-content: center;">
        <input type="number" class="price-input" data-item-uuid="${item.itemUuid}" value="${item.finalPrice}" step="0.01" min="0">
        <span class="price-currency">${item.currency}</span>
      </div>
    `;

        const gridColumns = isLootMode
          ? "grid-template-columns: 60px minmax(100px, 2fr) minmax(100px, 120px) 68px"
          : hideBase
            ? "grid-template-columns: 60px minmax(100px, 2fr) minmax(80px, 100px) minmax(100px, 120px) 68px"
            : "grid-template-columns: 60px minmax(100px, 2fr) minmax(80px, 100px) minmax(80px, 100px) minmax(100px, 120px) 68px";

        return `
      <div class="inventory-item" data-item-uuid="${item.itemUuid}" data-item-name="${item.name}" style="${gridColumns}">
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
          <button type="button" class="action-btn open-item" data-item-uuid="${item.itemUuid}" title="Open Item Sheet">
            <i class="fas fa-external-link-alt"></i>
          </button>
          ${
            game.user.isGM
              ? `<button type="button" class="action-btn send-to-player" data-item-uuid="${item.itemUuid}" title="Send to Player">
            <i class="fas fa-paper-plane"></i>
          </button>
          <button type="button" class="action-btn remove-item" data-item-uuid="${item.itemUuid}" title="Remove Item">
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
      <div class="table-header" style="${headerGridColumns}">
        <div>${sortButton}</div>
        <div style="align-content: center;">Item Name</div>
        ${priceHeader}
        <div style="text-align:center;align-content: center;">Quantity</div>
        <div style="text-align:center;align-content: center;">Actions</div>
      </div>
      ${inventoryRows}
    </div>
  `;
  }

  static async createPlayerSelectionDialog(itemName, onPlayerSelected) {
    const playerCharacters = game.actors.filter(
      (actor) => actor.type === "character",
    );

    if (playerCharacters.length === 0) {
      ui.notifications.warn("No player characters found");
      return;
    }

    const content = `
      <div class="player-selection">
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

  static markupControl(markup) {
    if (!game.user.isGM) {
      return "";
    }
    return `
      <div class="markup-control">
        <h3><i class="fas fa-percentage"></i> Global Price Markup</h3>
        <div class="markup-input-group">
          <input type="number" class="markup-input" value="${markup}" min="0.1" max="10" step="0.1">
          <span class="markup-label">x base price</span>
        </div>
        <p class="markup-help">Items without custom prices will use base price × markup</p>
      </div>
    `;
  }

  static infoBanner(message) {
    return `
      <div class="info-banner">
        <i class="fas fa-info-circle"></i>
        <p>${message}</p>
      </div>
    `;
  }

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
          <button type="button" class="btn-open-sheet" data-uuid="${member.uuid}" title="Open Sheet">
            <i class="fas fa-external-link-alt"></i>
          </button>
          ${
            game.user.isGM
              ? `<button type="button" class="btn-remove-member" data-uuid="${member.uuid}" title="Remove from Group">
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
                <button type="button" class="btn-open-sheet" data-uuid="${child.uuid}" title="Open Sheet">
                  <i class="fas fa-external-link-alt"></i>
                </button>
                <button type="button" class="btn-focus-item" data-uuid="${child.uuid}" title="Focus in Tab">
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
static standardJournalSection(data) {
  if (data.linkedStandardJournal && data.canViewJournal) {
    return `
      <div class="scene-info" style="margin-top: -24px;margin-bottom: 24px; height:40px">
      <span class="scene-name open-journal" data-journal-uuid="${data.linkedStandardJournal.uuid}" title="Open Journal">
        <i class="fas fa-book"></i> Journal: ${data.linkedStandardJournal.name}</span>
          ${
            data.isGM
              ? `<button class="scene-btn remove-standard-journal" title="Unlink Journal">
            <i class="fas fa-unlink"></i>
          </button>`
              : ""
          }
      </div>
    `;
  } else if (data.isGM) {
    return `
      <div class="scene-info" style="margin-top: -24px;margin-bottom: 24px; height:40px">
        <span class="scene-name" title="Open Journal">
          <i class="fas fa-book"></i> Journal: Drag Standard Journal to link</span>
      </div>
    `;
  }
  return "";
}
  
}
