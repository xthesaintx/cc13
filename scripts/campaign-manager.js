export class CampaignManager {
  constructor() {
    this.relationshipCache = new Map();
    this._creationQueue = new Set();
  }

  getActorDisplayMeta(actor) {
    if (!actor) return '<span class="entity-type">NPC</span>';
    if (actor.type === "character")
      return '<span class="entity-type-player">PLAYER</span>';
    return '<span class="entity-type">NPC</span>';
  }

  async createLocationJournal(name = "New Location") {
    const creationKey = `location-${name}`;
    if (this._creationQueue.has(creationKey)) return;
    this._creationQueue.add(creationKey);

    try {
      const journalData = {
        name: name,
        flags: {
          "campaign-codex": {
            type: "location",
            data: {
              description: "",
              linkedNPCs: [],
              linkedScene: null,
              linkedShops: [],
              notes: "",
            },
          },
          core: {
            sheetClass: "campaign-codex.LocationSheet",
          },
        },
        pages: [
          {
            name: "Overview",
            type: "text",
            text: { content: `<h1>${name}</h1><p>Location overview...</p>` },
          },
        ],
      };

      const journal = await JournalEntry.create(journalData);
      return journal;
    } finally {
      this._creationQueue.delete(creationKey);
    }
  }

  async findOrCreateNPCJournalForActor(actor) {
    if (!actor) return null;

    let npcJournal = game.journal.find((j) => {
      const journalData = j.getFlag("campaign-codex", "data");
      return (
        j.getFlag("campaign-codex", "type") === "npc" &&
        journalData?.linkedActor === actor.uuid
      );
    });

    if (!npcJournal) {
      npcJournal = await this.createNPCJournal(actor);
      ui.notifications.info(`Created NPC journal for "${actor.name}"`);
    }

    return npcJournal;
  }

  async createShopJournal(name = "New Entry") {
    const creationKey = `shop-${name}`;
    if (this._creationQueue.has(creationKey)) return;
    this._creationQueue.add(creationKey);

    try {
      const journalData = {
        name: name,
        flags: {
          "campaign-codex": {
            type: "shop",
            data: {
              description: "",
              linkedNPCs: [],
              linkedLocation: null,
              inventory: [],
              linkedScene: null,
              markup: 1.0,
              notes: "",
            },
          },
          core: {
            sheetClass: "campaign-codex.ShopSheet",
          },
        },
        pages: [
          {
            name: "Overview",
            type: "text",
            text: { content: `<h1>${name}</h1><p>Entry overview...</p>` },
          },
        ],
      };

      const journal = await JournalEntry.create(journalData);
      return journal;
    } finally {
      this._creationQueue.delete(creationKey);
    }
  }

  async createNPCJournal(actor = null, name = null) {
    const journalName =
      name || (actor ? `${actor.name} - Journal` : "New NPC Journal");
    const creationKey = `npc-${actor?.uuid || journalName}`;

    if (this._creationQueue.has(creationKey)) return;
    this._creationQueue.add(creationKey);

    try {
      const journalData = {
        name: journalName,
        flags: {
          "campaign-codex": {
            type: "npc",
            data: {
              linkedActor: actor ? actor.uuid : null,
              description: "",
              linkedLocations: [],
              linkedShops: [],
              associates: [],
              notes: "",
            },
          },
          core: {
            sheetClass: "campaign-codex.NPCSheet",
          },
        },
        pages: [
          {
            name: "Overview",
            type: "text",
            text: { content: `<h1>${journalName}</h1><p>NPC details...</p>` },
          },
        ],
      };

      const journal = await JournalEntry.create(journalData);
      return journal;
    } finally {
      this._creationQueue.delete(creationKey);
    }
  }

  async createRegionJournal(name = "New Region") {
    const creationKey = `region-${name}`;
    if (this._creationQueue.has(creationKey)) return;
    this._creationQueue.add(creationKey);

    try {
      const journalData = {
        name: name,
        flags: {
          "campaign-codex": {
            type: "region",
            data: {
              description: "",
              linkedLocations: [],
              linkedScene: null,
              notes: "",
            },
          },
          core: {
            sheetClass: "campaign-codex.RegionSheet",
          },
        },
        pages: [
          {
            name: "Overview",
            type: "text",
            text: { content: `<h1>${name}</h1><p>Region overview...</p>` },
          },
        ],
      };

      const journal = await JournalEntry.create(journalData);
      return journal;
    } finally {
      this._creationQueue.delete(creationKey);
    }
  }

  async linkLocationToNPC(locationDoc, npcDoc) {
    if (locationDoc.uuid === npcDoc.uuid) return;

    const locationData = locationDoc.getFlag("campaign-codex", "data") || {};
    const linkedNPCs = locationData.linkedNPCs || [];
    if (!linkedNPCs.includes(npcDoc.uuid)) {
      linkedNPCs.push(npcDoc.uuid);
      locationData.linkedNPCs = linkedNPCs;
      await locationDoc.setFlag("campaign-codex", "data", locationData);
    }

    const npcData = npcDoc.getFlag("campaign-codex", "data") || {};
    const linkedLocations = npcData.linkedLocations || [];
    if (!linkedLocations.includes(locationDoc.uuid)) {
      linkedLocations.push(locationDoc.uuid);
      npcData.linkedLocations = linkedLocations;
      await npcDoc.setFlag("campaign-codex", "data", npcData);
    }
  }

  async linkSceneToDocument(scene, document) {
    if (!scene || !document) return;

    let targetScene = scene;

    if (scene.pack) {
      const existingScene = game.scenes.find((s) => s.name === scene.name);

      if (existingScene) {
        targetScene = existingScene;
        ui.notifications.info(
          `Using existing scene "${scene.name}" from world`,
        );
      } else {
        try {
          const importedScenes = await Scene.createDocuments([
            scene.toObject(),
          ]);
          targetScene = importedScenes[0];
          ui.notifications.info(
            `Imported scene "${scene.name}" from compendium to world`,
          );
        } catch (error) {
          ui.notifications.error(
            `Failed to import scene "${scene.name}": ${error.message}`,
          );
          console.error("Campaign Codex | Failed to import scene:", error);
          return;
        }
      }
    }

    const docData = document.getFlag("campaign-codex", "data") || {};
    docData.linkedScene = targetScene.uuid;
    await document.setFlag("campaign-codex", "data", docData);
  }

  async openLinkedScene(document) {
    const documentData = document.getFlag("campaign-codex", "data") || {};
    const linkedSceneUuid = documentData.linkedScene;

    if (!linkedSceneUuid) {
      ui.notifications.warn("No scene linked to this document");
      return;
    }

    try {
      const linkedScene = await fromUuid(linkedSceneUuid);
      if (!linkedScene) {
        ui.notifications.error("Linked scene not found");
        return;
      }

      if (!linkedScene.pack) {
        linkedScene.view();
        return;
      }

      const worldSceneUuid = documentData.worldSceneUuid;

      if (worldSceneUuid) {
        try {
          const worldScene = await fromUuid(worldSceneUuid);
          if (worldScene && !worldScene.pack) {
            worldScene.view();
            return;
          }
        } catch (error) {
          console.warn(
            "Campaign Codex | World scene UUID invalid, importing fresh",
          );
        }
      }

      await this._importSceneAndSetWorldUuid(
        document,
        linkedScene,
        documentData,
      );
    } catch (error) {
      console.error("Campaign Codex | Error opening linked scene:", error);
      ui.notifications.error("Failed to open linked scene");
    }
  }

  async _importSceneAndSetWorldUuid(document, compendiumScene, documentData) {
    try {
      const existingScene = game.scenes.find(
        (s) => s.name === compendiumScene.name,
      );

      let worldScene;
      if (existingScene) {
        worldScene = existingScene;
        ui.notifications.info(
          `Using existing world scene "${compendiumScene.name}"`,
        );
      } else {
        const importedScenes = await Scene.createDocuments([
          compendiumScene.toObject(),
        ]);
        worldScene = importedScenes[0];
        ui.notifications.info(
          `Imported scene "${compendiumScene.name}" from compendium to world`,
        );
      }

      const updatedData = { ...documentData, worldSceneUuid: worldScene.uuid };
      await document.setFlag("campaign-codex", "data", updatedData);

      worldScene.view();
    } catch (error) {
      console.error("Campaign Codex | Error importing scene:", error);
      ui.notifications.error(
        `Failed to import scene "${compendiumScene.name}": ${error.message}`,
      );
    }
  }

  async linkLocationToShop(locationDoc, shopDoc) {
    if (locationDoc.uuid === shopDoc.uuid) return;

    const shopData = shopDoc.getFlag("campaign-codex", "data") || {};
    const oldLocation = shopData.linkedLocation;

    if (oldLocation && oldLocation !== locationDoc.uuid) {
      const oldLocationDoc = await fromUuid(oldLocation);
      if (oldLocationDoc) {
        const oldLocationData =
          oldLocationDoc.getFlag("campaign-codex", "data") || {};
        const linkedShops = oldLocationData.linkedShops || [];
        oldLocationData.linkedShops = linkedShops.filter(
          (uuid) => uuid !== shopDoc.uuid,
        );
        await oldLocationDoc.setFlag("campaign-codex", "data", oldLocationData);
      }
    }

    const locationData = locationDoc.getFlag("campaign-codex", "data") || {};
    const linkedShops = locationData.linkedShops || [];
    if (!linkedShops.includes(shopDoc.uuid)) {
      linkedShops.push(shopDoc.uuid);
      locationData.linkedShops = linkedShops;
      await locationDoc.setFlag("campaign-codex", "data", locationData);
    }

    shopData.linkedLocation = locationDoc.uuid;
    await shopDoc.setFlag("campaign-codex", "data", shopData);
  }

  async linkShopToNPC(shopDoc, npcDoc) {
    if (shopDoc.uuid === npcDoc.uuid) return;

    const shopData = shopDoc.getFlag("campaign-codex", "data") || {};
    const linkedNPCs = shopData.linkedNPCs || [];
    if (!linkedNPCs.includes(npcDoc.uuid)) {
      linkedNPCs.push(npcDoc.uuid);
      shopData.linkedNPCs = linkedNPCs;
      await shopDoc.setFlag("campaign-codex", "data", shopData);
    }

    const npcData = npcDoc.getFlag("campaign-codex", "data") || {};
    const linkedShops = npcData.linkedShops || [];
    if (!linkedShops.includes(shopDoc.uuid)) {
      linkedShops.push(shopDoc.uuid);
      npcData.linkedShops = linkedShops;
      await npcDoc.setFlag("campaign-codex", "data", npcData);
    }
  }

  async linkNPCToNPC(npc1Doc, npc2Doc) {
    if (npc1Doc.uuid === npc2Doc.uuid) return;

    const npc1Data = npc1Doc.getFlag("campaign-codex", "data") || {};
    const associates1 = npc1Data.associates || [];
    if (!associates1.includes(npc2Doc.uuid)) {
      associates1.push(npc2Doc.uuid);
      npc1Data.associates = associates1;
      await npc1Doc.setFlag("campaign-codex", "data", npc1Data);
    }

    const npc2Data = npc2Doc.getFlag("campaign-codex", "data") || {};
    const associates2 = npc2Data.associates || [];
    if (!associates2.includes(npc1Doc.uuid)) {
      associates2.push(npc1Doc.uuid);
      npc2Data.associates = associates2;
      await npc2Doc.setFlag("campaign-codex", "data", npc2Data);
    }
  }

  async linkRegionToLocation(regionDoc, locationDoc) {
    if (regionDoc.uuid === locationDoc.uuid) return;

    const allRegions = game.journal.filter(
      (j) => j.getFlag("campaign-codex", "type") === "region",
    );
    for (const region of allRegions) {
      if (region.uuid === regionDoc.uuid) continue;

      const regionData = region.getFlag("campaign-codex", "data") || {};
      const linkedLocations = regionData.linkedLocations || [];

      if (linkedLocations.includes(locationDoc.uuid)) {
        regionData.linkedLocations = linkedLocations.filter(
          (uuid) => uuid !== locationDoc.uuid,
        );
        await region.setFlag("campaign-codex", "data", regionData);
      }
    }

    const regionData = regionDoc.getFlag("campaign-codex", "data") || {};
    const linkedLocations = regionData.linkedLocations || [];
    if (!linkedLocations.includes(locationDoc.uuid)) {
      linkedLocations.push(locationDoc.uuid);
      regionData.linkedLocations = linkedLocations;
      await regionDoc.setFlag("campaign-codex", "data", regionData);
    }

    const locationData = locationDoc.getFlag("campaign-codex", "data") || {};
    locationData.parentRegion = regionDoc.uuid;
    await locationDoc.setFlag("campaign-codex", "data", locationData);

    for (const app of Object.values(ui.windows)) {
      if (
        app.document &&
        (app.document.uuid === regionDoc.uuid ||
          app.document.uuid === locationDoc.uuid)
      ) {
        app.render(false);
      }
    }
  }

  async addItemToShop(shopDoc, itemDoc, quantity = 1) {
    const shopData = shopDoc.getFlag("campaign-codex", "data") || {};
    const inventory = shopData.inventory || [];

    const existingItem = inventory.find((i) => i.itemUuid === itemDoc.uuid);
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      inventory.push({
        itemUuid: itemDoc.uuid,
        quantity: quantity,
        customPrice: null,
      });
    }

    shopData.inventory = inventory;
    await shopDoc.setFlag("campaign-codex", "data", shopData);
  }

  async handleRelationshipUpdates(document, changes, type) {
    if (!foundry.utils.hasProperty(changes, "flags.campaign-codex")) return;

    switch (type) {
      case "location":
        await this._handleLocationUpdates(document);
        break;
      case "shop":
        await this._handleShopUpdates(document);
        break;
      case "npc":
        await this._handleNPCUpdates(
          document,
          changes.flags["campaign-codex"]?.data || {},
        );
        break;
      case "region":
        await this._handleRegionUpdates(document, changes);
        break;
      case "group":
        console.log(`Campaign Codex | Group updated: ${document.name}`);
        break;
    }

    await this._scheduleSheetRefresh(document.uuid);
  }
  async _scheduleSheetRefresh(changedDocUuid) {
    const sheetsToRefresh = new Set();
    const docsWithOpenEditors = new Set();
    for (const app of Object.values(ui.windows)) {
        if (app.constructor.name === "DescriptionEditor" && app.document) {
            docsWithOpenEditors.add(app.document.uuid);
        }
    }
    for (const app of Object.values(ui.windows)) {
        if (!app.document?.getFlag) continue;
        if (docsWithOpenEditors.has(app.document.uuid)) {
            console.log(`Campaign Codex | Skipping refresh for ${app.document.name} because it has an open editor.`);
            continue;
        }
        if (app.document.uuid === changedDocUuid) {
            sheetsToRefresh.add(app);
            continue;
        }
        if (app._isRelatedDocument) {
            if (await app._isRelatedDocument(changedDocUuid)) {
                sheetsToRefresh.add(app);
            }
        }
    }
    for (const app of sheetsToRefresh) {
        app.render(false);
    }
}
  // async _scheduleSheetRefresh(changedDocUuid) {
  //   const sheetsToRefresh = new Set();

  //   for (const app of Object.values(ui.windows)) {
  //     if (!app.document?.getFlag) continue;

  //     if (app.document.uuid === changedDocUuid) {
  //       sheetsToRefresh.add(app);
  //       continue;
  //     }

  //     if (app._isRelatedDocument) {
  //       if (await app._isRelatedDocument(changedDocUuid)) {
  //         sheetsToRefresh.add(app);
  //       }
  //     }
  //   }

  //   for (const app of sheetsToRefresh) {
  //     app.render(false);
  //   }
  // }

  async _handleLocationUpdates(locationDoc) {
    const oldData =
      foundry.utils.getProperty(
        locationDoc._source,
        "flags.campaign-codex.data",
      ) || {};
    const newData =
      foundry.utils.getProperty(locationDoc, "flags.campaign-codex.data") || {};

    const oldShops = oldData.linkedShops || [];
    const newShops = newData.linkedShops || [];
    const addedShops = newShops.filter((uuid) => !oldShops.includes(uuid));
    const removedShops = oldShops.filter((uuid) => !newShops.includes(uuid));

    for (const shopUuid of removedShops) {
      const shopDoc = await fromUuid(shopUuid).catch(() => null);
      if (shopDoc) {
        await shopDoc.unsetFlag("campaign-codex", "data.linkedLocation");
      }
    }
    for (const shopUuid of addedShops) {
      const shopDoc = await fromUuid(shopUuid).catch(() => null);
      if (shopDoc) {
        const shopData = shopDoc.getFlag("campaign-codex", "data") || {};
        shopData.linkedLocation = locationDoc.uuid;
        await shopDoc.setFlag("campaign-codex", "data", shopData);
      }
    }

    const oldNPCs = oldData.linkedNPCs || [];
    const newNPCs = newData.linkedNPCs || [];
    const addedNPCs = newNPCs.filter((uuid) => !oldNPCs.includes(uuid));
    const removedNPCs = oldNPCs.filter((uuid) => !newNPCs.includes(uuid));

    for (const npcUuid of removedNPCs) {
      const npcDoc = await fromUuid(npcUuid).catch(() => null);
      if (npcDoc) {
        const npcData = npcDoc.getFlag("campaign-codex", "data") || {};
        npcData.linkedLocations = (npcData.linkedLocations || []).filter(
          (uuid) => uuid !== locationDoc.uuid,
        );
        await npcDoc.setFlag("campaign-codex", "data", npcData);
      }
    }
    for (const npcUuid of addedNPCs) {
      const npcDoc = await fromUuid(npcUuid).catch(() => null);
      if (npcDoc) {
        const npcData = npcDoc.getFlag("campaign-codex", "data") || {};
        const locations = new Set(npcData.linkedLocations || []);
        locations.add(locationDoc.uuid);
        npcData.linkedLocations = [...locations];
        await npcDoc.setFlag("campaign-codex", "data", npcData);
      }
    }
  }

  async _handleShopUpdates(shopDoc) {
    const oldData =
      foundry.utils.getProperty(shopDoc._source, "flags.campaign-codex.data") ||
      {};
    const newData =
      foundry.utils.getProperty(shopDoc, "flags.campaign-codex.data") || {};

    const oldLocationUuid = oldData.linkedLocation;
    const newLocationUuid = newData.linkedLocation;

    if (oldLocationUuid !== newLocationUuid) {
      if (oldLocationUuid) {
        const oldLocationDoc = await fromUuid(oldLocationUuid).catch(
          () => null,
        );
        if (oldLocationDoc) {
          const data = oldLocationDoc.getFlag("campaign-codex", "data") || {};
          data.linkedShops = (data.linkedShops || []).filter(
            (uuid) => uuid !== shopDoc.uuid,
          );
          await oldLocationDoc.setFlag("campaign-codex", "data", data);
        }
      }
      if (newLocationUuid) {
        const newLocationDoc = await fromUuid(newLocationUuid).catch(
          () => null,
        );
        if (newLocationDoc) {
          const data = newLocationDoc.getFlag("campaign-codex", "data") || {};
          const shops = new Set(data.linkedShops || []);
          shops.add(shopDoc.uuid);
          data.linkedShops = [...shops];
          await newLocationDoc.setFlag("campaign-codex", "data", data);
        }
      }
    }

    const oldNPCs = oldData.linkedNPCs || [];
    const newNPCs = newData.linkedNPCs || [];
    const addedNPCs = newNPCs.filter((uuid) => !oldNPCs.includes(uuid));
    const removedNPCs = oldNPCs.filter((uuid) => !newNPCs.includes(uuid));

    for (const npcUuid of removedNPCs) {
      const npcDoc = await fromUuid(npcUuid).catch(() => null);
      if (npcDoc) {
        const npcData = npcDoc.getFlag("campaign-codex", "data") || {};
        npcData.linkedShops = (npcData.linkedShops || []).filter(
          (uuid) => uuid !== shopDoc.uuid,
        );
        await npcDoc.setFlag("campaign-codex", "data", npcData);
      }
    }
    for (const npcUuid of addedNPCs) {
      const npcDoc = await fromUuid(npcUuid).catch(() => null);
      if (npcDoc) {
        const npcData = npcDoc.getFlag("campaign-codex", "data") || {};
        const shops = new Set(npcData.linkedShops || []);
        shops.add(shopDoc.uuid);
        npcData.linkedShops = [...shops];
        await npcDoc.setFlag("campaign-codex", "data", npcData);
      }
    }
  }

  async _handleNPCUpdates(npcDoc, changes) {
    const oldData =
      foundry.utils.getProperty(npcDoc._source, "flags.campaign-codex.data") ||
      {};
    const newData =
      foundry.utils.getProperty(npcDoc, "flags.campaign-codex.data") || {};

    if (changes.linkedLocations) {
      const oldLocations = oldData.linkedLocations || [];
      const newLocations = newData.linkedLocations || [];

      for (const locationUuid of oldLocations) {
        if (!newLocations.includes(locationUuid)) {
          const locationDoc = await fromUuid(locationUuid);
          if (locationDoc) {
            const locationData =
              locationDoc.getFlag("campaign-codex", "data") || {};
            const linkedNPCs = locationData.linkedNPCs || [];
            locationData.linkedNPCs = linkedNPCs.filter(
              (uuid) => uuid !== npcDoc.uuid,
            );
            await locationDoc.setFlag("campaign-codex", "data", locationData);
          }
        }
      }

      for (const locationUuid of newLocations) {
        if (!oldLocations.includes(locationUuid)) {
          const locationDoc = await fromUuid(locationUuid);
          if (locationDoc) {
            const locationData =
              locationDoc.getFlag("campaign-codex", "data") || {};
            const linkedNPCs = locationData.linkedNPCs || [];
            if (!linkedNPCs.includes(npcDoc.uuid)) {
              linkedNPCs.push(npcDoc.uuid);
              locationData.linkedNPCs = linkedNPCs;
              await locationDoc.setFlag("campaign-codex", "data", locationData);
            }
          }
        }
      }
    }

    if (changes.linkedShops) {
      const oldShops = oldData.linkedShops || [];
      const newShops = newData.linkedShops || [];

      const removalPromises = oldShops
        .filter((shopUuid) => !newShops.includes(shopUuid))
        .map(async (shopUuid) => {
          const shopDoc = await fromUuid(shopUuid);
          if (shopDoc) {
            const shopData = shopDoc.getFlag("campaign-codex", "data") || {};
            shopData.linkedNPCs = (shopData.linkedNPCs || []).filter(
              (uuid) => uuid !== npcDoc.uuid,
            );
            return shopDoc.setFlag("campaign-codex", "data", shopData);
          }
        });

      const additionPromises = newShops
        .filter((shopUuid) => !oldShops.includes(shopUuid))
        .map(async (shopUuid) => {
          const shopDoc = await fromUuid(shopUuid);
          if (shopDoc) {
            const shopData = shopDoc.getFlag("campaign-codex", "data") || {};
            const linkedNPCs = shopData.linkedNPCs || [];
            if (!linkedNPCs.includes(npcDoc.uuid)) {
              linkedNPCs.push(npcDoc.uuid);
              shopData.linkedNPCs = linkedNPCs;
              return shopDoc.setFlag("campaign-codex", "data", shopData);
            }
          }
        });

      await Promise.all([...removalPromises, ...additionPromises]);
    }

    if (changes.associates) {
      const oldAssociates = oldData.associates || [];
      const newAssociates = newData.associates || [];

      for (const associateUuid of oldAssociates) {
        if (!newAssociates.includes(associateUuid)) {
          const associateDoc = await fromUuid(associateUuid);
          if (associateDoc && !associateDoc._pendingDeletion) {
            const associateData =
              associateDoc.getFlag("campaign-codex", "data") || {};
            const associates = associateData.associates || [];

            const updatedAssociates = associates.filter(
              (uuid) => uuid !== npcDoc.uuid,
            );
            if (updatedAssociates.length !== associates.length) {
              associateData.associates = updatedAssociates;
              await associateDoc.setFlag(
                "campaign-codex",
                "data",
                associateData,
              );
            }
          }
        }
      }

      for (const associateUuid of newAssociates) {
        if (!oldAssociates.includes(associateUuid)) {
          const associateDoc = await fromUuid(associateUuid);
          if (associateDoc && !associateDoc._pendingDeletion) {
            const associateData =
              associateDoc.getFlag("campaign-codex", "data") || {};
            const associates = associateData.associates || [];

            if (!associates.includes(npcDoc.uuid)) {
              associates.push(npcDoc.uuid);
              associateData.associates = associates;
              await associateDoc.setFlag(
                "campaign-codex",
                "data",
                associateData,
              );
            }
          }
        }
      }
    }
  }

  async _handleRegionUpdates(regionDoc, changes) {
    if (
      !changes ||
      !foundry.utils.hasProperty(
        changes,
        "flags.campaign-codex.data.linkedLocations",
      )
    ) {
      return;
    }

    const oldData =
      foundry.utils.getProperty(
        regionDoc._source,
        "flags.campaign-codex.data",
      ) || {};
    const newData =
      foundry.utils.getProperty(regionDoc, "flags.campaign-codex.data") || {};

    const oldLocations = oldData.linkedLocations || [];
    const newLocations = newData.linkedLocations || [];

    const allAffectedLocations = [
      ...new Set([...oldLocations, ...newLocations]),
    ];

    for (const app of Object.values(ui.windows)) {
      if (!app.document?.getFlag) continue;

      const appDocUuid = app.document.uuid;
      const appType = app.document.getFlag("campaign-codex", "type");

      if (
        appDocUuid === regionDoc.uuid ||
        (appType === "location" && allAffectedLocations.includes(appDocUuid))
      ) {
        app.render(false);
      }
    }
  }

  async cleanupRelationships(document, type) {
    const data = document.getFlag("campaign-codex", "data") || {};

    switch (type) {
      case "location":
        for (const npcUuid of data.linkedNPCs || []) {
          const npcDoc = await fromUuid(npcUuid);
          if (npcDoc) {
            const npcData = npcDoc.getFlag("campaign-codex", "data") || {};
            npcData.linkedLocations = (npcData.linkedLocations || []).filter(
              (uuid) => uuid !== document.uuid,
            );
            await npcDoc.setFlag("campaign-codex", "data", npcData);
          }
        }

        for (const shopUuid of data.linkedShops || []) {
          const shopDoc = await fromUuid(shopUuid);
          if (shopDoc) {
            const shopData = shopDoc.getFlag("campaign-codex", "data") || {};
            shopData.linkedLocation = null;
            await shopDoc.setFlag("campaign-codex", "data", shopData);
          }
        }
        break;

      case "shop":
        for (const npcUuid of data.linkedNPCs || []) {
          const npcDoc = await fromUuid(npcUuid);
          if (npcDoc) {
            const npcData = npcDoc.getFlag("campaign-codex", "data") || {};
            npcData.linkedShops = (npcData.linkedShops || []).filter(
              (uuid) => uuid !== document.uuid,
            );
            await npcDoc.setFlag("campaign-codex", "data", npcData);
          }
        }

        if (data.linkedLocation) {
          const locationDoc = await fromUuid(data.linkedLocation);
          if (locationDoc) {
            const locationData =
              locationDoc.getFlag("campaign-codex", "data") || {};
            locationData.linkedShops = (locationData.linkedShops || []).filter(
              (uuid) => uuid !== document.uuid,
            );
            await locationDoc.setFlag("campaign-codex", "data", locationData);
          }
        }
        break;

      case "npc":
        for (const locationUuid of data.linkedLocations || []) {
          const locationDoc = await fromUuid(locationUuid);
          if (locationDoc) {
            const locationData =
              locationDoc.getFlag("campaign-codex", "data") || {};
            locationData.linkedNPCs = (locationData.linkedNPCs || []).filter(
              (uuid) => uuid !== document.uuid,
            );
            await locationDoc.setFlag("campaign-codex", "data", locationData);
          }
        }

        for (const shopUuid of data.linkedShops || []) {
          const shopDoc = await fromUuid(shopUuid);
          if (shopDoc) {
            const shopData = shopDoc.getFlag("campaign-codex", "data") || {};
            shopData.linkedNPCs = (shopData.linkedNPCs || []).filter(
              (uuid) => uuid !== document.uuid,
            );
            await shopDoc.setFlag("campaign-codex", "data", shopData);
          }
        }

        for (const associateUuid of data.associates || []) {
          const associateDoc = await fromUuid(associateUuid);
          if (associateDoc) {
            const associateData =
              associateDoc.getFlag("campaign-codex", "data") || {};
            associateData.associates = (associateData.associates || []).filter(
              (uuid) => uuid !== document.uuid,
            );
            await associateDoc.setFlag("campaign-codex", "data", associateData);
          }
        }
        break;

      case "region":
        break;
    }
  }

  async cleanupActorRelationships(actorDoc) {
    const npcJournals = game.journal.filter((j) => {
      const data = j.getFlag("campaign-codex", "data");
      return data && data.linkedActor === actorDoc.uuid;
    });

    for (const journal of npcJournals) {
      const data = journal.getFlag("campaign-codex", "data") || {};
      data.linkedActor = null;
      await journal.setFlag("campaign-codex", "data", data);
    }
  }

  async getLinkedDocuments(sourceDoc, linkType) {
    const data = sourceDoc.getFlag("campaign-codex", "data") || {};
    const linkedIds = data[linkType] || [];

    if (linkType === "linkedActor") {
      if (!linkedIds) return [];
      const actor = await fromUuid(linkedIds);
      return actor ? [actor] : [];
    }

    const documents = [];
    for (const uuid of Array.isArray(linkedIds) ? linkedIds : [linkedIds]) {
      if (uuid) {
        const doc = await fromUuid(uuid);
        if (doc) documents.push(doc);
      }
    }
    return documents;
  }

  async refreshAllSheets(documentUuid) {
    for (const app of Object.values(ui.windows)) {
      if (
        app.document &&
        (app.document.uuid === documentUuid ||
          (await this._isRelatedDocument(app.document, documentUuid)))
      ) {
        app.render(false);
      }
    }
  }

  async _isRelatedDocument(doc, changedDocUuid) {
    if (!doc.getFlag) return false;

    const data = doc.getFlag("campaign-codex", "data") || {};
    const allLinkedUuids = [
      ...(data.linkedNPCs || []),
      ...(data.linkedShops || []),
      ...(data.linkedLocations || []),
      ...(data.associates || []),
      data.linkedLocation,
      data.linkedActor,
    ].filter(Boolean);

    return allLinkedUuids.includes(changedDocUuid);
  }

  async createGroupJournal(name = "New Group Overview") {
    const creationKey = `group-${name}`;
    if (this._creationQueue.has(creationKey)) return;
    this._creationQueue.add(creationKey);

    try {
      const journalData = {
        name: name,
        flags: {
          "campaign-codex": {
            type: "group",
            data: {
              description: "",
              members: [],
              notes: "",
            },
          },
          core: {
            sheetClass: "campaign-codex.GroupSheet",
          },
        },
        pages: [
          {
            name: "Overview",
            type: "text",
            text: { content: `<h1>${name}</h1><p>Group overview...</p>` },
          },
        ],
      };

      const journal = await JournalEntry.create(journalData);
      return journal;
    } finally {
      this._creationQueue.delete(creationKey);
    }
  }

  async resetItemPathsToDefaults() {
    try {
      await game.settings.set(
        "campaign-codex",
        "itemPricePath",
        "system.price.value",
      );
      await game.settings.set(
        "campaign-codex",
        "itemDenominationPath",
        "system.price.denomination",
      );
      ui.notifications.info("Item price paths reset to D&D5e defaults");
    } catch (error) {
      console.error("Campaign Codex | Error resetting item paths:", error);
      ui.notifications.error("Failed to reset item paths");
    }
  }
}
