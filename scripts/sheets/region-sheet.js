import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { TemplateComponents } from "./template-components.js";
import { DescriptionEditor } from "./editors/description-editor.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { promptForName } from "../helper.js";

export class RegionSheet extends CampaignCodexBaseSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: [...super.defaultOptions.classes, "region-sheet"],
    });
  }

  get template() {
    return "modules/campaign-codex/templates/base-sheet.html";
  }

  async getData() {
    const data = await super.getData();
    const regionData = this.document.getFlag("campaign-codex", "data") || {};

    data.linkedScene = null;
    if (regionData.linkedScene) {
      try {
        const scene = await fromUuid(regionData.linkedScene);
        if (scene) {
          data.linkedScene = {
            uuid: scene.uuid,
            name: scene.name,
            img: scene.thumb || "icons/svg/map.svg",
          };
        }
      } catch (error) {
        console.warn(
          `Campaign Codex | Linked scene not found: ${regionData.linkedScene}`,
        );
      }
    }
    const rawNPCs = await CampaignCodexLinkers.getAllNPCs(
      regionData.linkedLocations || [],
    );
    data.allNPCs =
      await TemplateComponents.prepareEntitiesWithPermissions(rawNPCs);

    const rawShops = await CampaignCodexLinkers.getAllShops(
      regionData.linkedLocations || [],
    );
    data.allShops =
      await TemplateComponents.prepareEntitiesWithPermissions(rawShops);

    const rawLocations = await CampaignCodexLinkers.getLinkedLocations(
      this.document,
      regionData.linkedLocations || [],
    );
    data.linkedLocations =
      await TemplateComponents.prepareEntitiesWithPermissions(rawLocations);

    data.canViewScene = await this.constructor.canUserView(
      data.linkedScene?.uuid,
    );


    data.sheetType = "region";
    data.sheetTypeLabel = "Region";
    data.customImage =
      this.document.getFlag("campaign-codex", "image") ||
      TemplateComponents.getAsset("image", "region");

    data.tabs = [
      {
        key: "info",
        label: "Info",
        icon: "fas fa-info-circle",
        active: this._currentTab === "info",
      },
      {
        key: "locations",
        label: "Locations",
        icon: "fas fa-map-marker-alt",
        active: this._currentTab === "locations",
        statistic: {
          value: Array.isArray(data.linkedLocations)
            ? data.linkedLocations.length
            : 0,
          color: "#28a745",
        },
      },
      {
        key: "npcs",
        label: "NPCs",
        icon: "fas fa-users",
        active: this._currentTab === "npcs",
        statistic: {
          value: Array.isArray(data.allNPCs) ? data.allNPCs.length : 0,
          color: "#fd7e14",
        },
      },
      {
        key: "shops",
        label: "Entries",
        icon: "fas fa-book-open",
        active: this._currentTab === "shops",
        statistic: {
          value: Array.isArray(data.allShops) ? data.allShops.length : 0,
          color: "#6f42c1",
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
        icon: "fas fa-map-marker-alt",
        value: data.linkedLocations.length,
        label: "LOCATIONS",
        color: "#28a745",
      },
      {
        icon: "fas fa-users",
        value: data.allNPCs.length,
        label: "NPCS",
        color: "#fd7e14",
      },
      {
        icon: "fas fa-book-open",
        value: data.allShops.length,
        label: "ENTRIES",
        color: "#6f42c1",
      },
    ];

    const sources = [{ data: data.linkedLocations, type: "location" }];

    data.quickLinks = CampaignCodexLinkers.createQuickLinks(sources);

    let headerContent = "";

    if (data.linkedScene) {
      headerContent += `
      <div class="scene-info">
        
        <span class="scene-name${data.canViewScene ? ` open-scene" data-scene-uuid="${data.linkedScene.uuid}"` : '"'} title="Open Scene"> <i class="fas fa-map"></i> ${data.linkedScene.name}</span>

              ${
                data.isGM
                  ? `<button type="button" class="scene-btn remove-scene" title="Unlink Scene">
          <i class="fas fa-unlink"></i>
        </button>`
                  : ""
              }
      </div>
    `;
    } else {
      headerContent += `${
        data.isGM
          ? `<div class="scene-info">
        
        <span class="scene-name open-scene" style="text-align:center;"><i class="fas fa-link"></i> Drop scene to link</span>

      </div>`
          : ""
      }
    `;
    }

    if (headerContent) {
      data.customHeaderContent = headerContent;
    }

    data.tabPanels = [
      {
        key: "info",
        active: this._currentTab === "info",
        content: this._generateInfoTab(data),
      },
      {
        key: "locations",
        active: this._currentTab === "locations",
        content: await this._generateLocationsTab(data),
      },
      {
        key: "npcs",
        active: this._currentTab === "npcs",
        content: await this._generateNPCsTab(data),
      },
      {
        key: "shops",
        active: this._currentTab === "shops",
        content: await this._generateShopsTab(data),
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

    return `
      ${TemplateComponents.contentHeader("fas fas fa-info-circle", "Information")}
            ${standardJournalSection}

      ${TemplateComponents.richTextSection("Description", "fas fa-align-left", data.sheetData.enrichedDescription, "description", data.isOwnerOrHigher)}
    `;
  }

  // Add location to region from locations tab
  async _onCreateLocationJournal(event) {
    event.preventDefault();
    const name = await promptForName("Location");
    if (name) {
      const locationJournal =
        await game.campaignCodex.createLocationJournal(name);
      if (locationJournal) {
        await game.campaignCodex.linkRegionToLocation(
          this.document,
          locationJournal,
        );
        this.render(false);
        locationJournal.sheet.render(true);
      }
    }
  }

  async _generateLocationsTab(data) {
    const preparedLocation =
      await TemplateComponents.prepareEntitiesWithPermissions(
        data.linkedLocations,
      );

    const createLocationBtn = game.user.isGM
      ? `
      <button type="button" class="refresh-btn create-location-button" title="Create New Entry">
        <i class="fas fa-map-marker-alt"><span style="font-size:14px">+</span></i>
      </button>`
      : "";

    return `
      ${TemplateComponents.contentHeader("fas fa-map-marker-alt", "Locations in this Region", createLocationBtn)}
      ${game.user.isGM ? `${TemplateComponents.dropZone("location", "fas fa-map-marker-alt", "Add Locations", "Drag location journal or scene (creates location journal) here to add them to this region")}` : ""}
      ${TemplateComponents.entityGrid(preparedLocation, "location")}
    `;
  }

  async _generateNPCsTab(data) {
    const refreshBtn = `
      <button type="button" class="refresh-btn refresh-npcs" title="Refresh auto-populated data">
        <i class="fas fa-sync-alt"></i>
        Refresh
      </button>
    `;

    return `
      ${TemplateComponents.contentHeader("fas fa-users", "NPCs in this Region", refreshBtn)}
      ${TemplateComponents.infoBanner("NPCs are automatically populated from all locations and entries in this region.")}
      ${await this._generateNPCsBySource(data)}
    `;
  }

  async _generateNPCsBySource(data) {
    const directNPCs = data.allNPCs.filter((npc) => npc.source === "location");
    const shopNPCs = data.allNPCs.filter((npc) => npc.source === "shop");
    let content = "";
    // console.log(directNPCs);
    if (directNPCs.length > 0) {
      content += `
        <div class="npc-section">
          <h3 style="color: var(--cc-main-text); font-family: var(--cc-font-heading); font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 16px 0; border-bottom: 1px solid var(--cc-border-light); padding-bottom: 8px;">
            <i class="fas fa-map-marker-alt" style="color: var(--cc-accent); margin-right: 8px;"></i>
            Location NPCs ${data.isGM ? `(${directNPCs.length})` : ""}
          </h3>
          ${await TemplateComponents.entityGrid(directNPCs, "npc", true)}
        </div>
      `;
    }

    if (shopNPCs.length > 0) {
      content += `
        <div class="npc-section">
          <h3 style="color: var(--cc-main-text); font-family: var(--cc-font-heading); font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 16px 0; border-bottom: 1px solid var(--cc-border-light); padding-bottom: 8px;">
            <i class="fas fa-book-open" style="color: var(--cc-accent); margin-right: 8px;"></i>
            Entry NPCs ${data.isGM ? `(${shopNPCs.length})` : ""}
          </h3>
          ${await TemplateComponents.entityGrid(shopNPCs, "npc", true)}
        </div>
      `;
    }

    if (data.allNPCs.length === 0) {
      content = TemplateComponents.emptyState("npc");
    }

    return content;
  }

  async _generateShopsTab(data) {
    const preparedShops =
      await TemplateComponents.prepareEntitiesWithPermissions(data.allShops);

    const refreshBtn = `
      <button type="button" class="refresh-btn refresh-shops" title="Refresh auto-populated data">
        <i class="fas fa-sync-alt"></i>
        Refresh
      </button>
    `;

    return `
      ${TemplateComponents.contentHeader("fas fa-book-open", "Entries in this Region", refreshBtn)}
      ${TemplateComponents.infoBanner("Entries are automatically populated from all locations in this region.")}
      ${TemplateComponents.entityGrid(preparedShops, "shop")}
    `;
  }

  _activateSheetSpecificListeners(html) {
    html
      .querySelector(".create-location-button")
      ?.addEventListener("click", this._onCreateLocationJournal.bind(this));

    html
      .querySelectorAll(".remove-location")
      ?.forEach((element) =>
        element.addEventListener("click", this._onRemoveFromRegion.bind(this)),
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
      .querySelectorAll(".open-npc")
      ?.forEach((element) =>
        element.addEventListener(
          "click",
          async (e) => await this._onOpenDocument(e, "npc"),
        ),
      );
    html
      .querySelectorAll(".open-shop")
      ?.forEach((element) =>
        element.addEventListener(
          "click",
          async (e) => await this._onOpenDocument(e, "shop"),
        ),
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
      .querySelector(".refresh-npcs")
      ?.addEventListener("click", this._onRefreshData.bind(this));
    html
      .querySelector(".refresh-shops")
      ?.addEventListener("click", this._onRefreshData.bind(this));

    html
      .querySelectorAll(".location-link")
      ?.forEach((element) =>
        element.addEventListener(
          "click",
          async (e) => await this._onOpenDocument(e, "location"),
        ),
      );

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
    } else if (data.type === "JournalEntry" || data.type === "JournalEntryPage") {
      await this._handleJournalDrop(data, event);
    }
  }

async _handleSceneDrop(data, event) {
  const scene = await fromUuid(data.uuid);
  if (!scene) {
    ui.notifications.warn("Could not find the dropped scene.");
    return;
  }

  const locationsTab = event.target.closest(
    '.tab-panel[data-tab="locations"]',
  );

  if (locationsTab) {
    const allLocationJournals = game.journal.filter(
      (j) => j.getFlag("campaign-codex", "type") === "location",
    );

    for (const existingLocation of allLocationJournals) {
      const nameMatch =
        existingLocation.name.toLowerCase() === scene.name.toLowerCase();
      const existingLocationData =
        existingLocation.getFlag("campaign-codex", "data") || {};
      const sceneMatch = existingLocationData.linkedScene === scene.uuid;

      if (nameMatch && sceneMatch) {
        ui.notifications.info(
          `Found existing location "${existingLocation.name}". Linking it to this region.`,
        );
        await game.campaignCodex.linkRegionToLocation(
          this.document,
          existingLocation,
        );
        this.render(false);
        return; 
      }
    }
    const locationJournal = await game.campaignCodex.createLocationJournal(
      scene.name,
    );
    if (locationJournal) {
      await game.campaignCodex.linkRegionToLocation(
        this.document,
        locationJournal,
      );
      await game.campaignCodex.linkSceneToDocument(scene, locationJournal);
      ui.notifications.info(
        `Created and linked new location "${locationJournal.name}" from the scene.`,
      );
      this.render(false);
      locationJournal.sheet.render(true);
    }
  } else {
    await this._saveFormData();
    await game.campaignCodex.linkSceneToDocument(scene, this.document);
    ui.notifications.info(
      `Linked scene "${scene.name}" to ${this.document.name}`,
    );
    this.render(false);
  }
}

  async _handleJournalDrop(data, event) {
    const journal = await fromUuid(data.uuid);
    if (!journal || journal.uuid === this.document.uuid) return;
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

    if (journalType === "location") {
      await this._saveFormData();
      await game.campaignCodex.linkRegionToLocation(this.document, journal);
      this.render(false);
    }
  }

  async _onRefreshData(event) {
    this.render(false);
    ui.notifications.info("Region data refreshed!");
  }

  getSheetType() {
    return "region";
  }

  async _onDropToMap(event) {
    const data = await this.getData();
    await NPCDropper.dropNPCsToScene(data.linkedNPCs, {
      title: `Drop ${this.document.name} NPCs to Map`,
      showHiddenToggle: true,
    });
  }
}
