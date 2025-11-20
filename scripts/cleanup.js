export class CleanUp {
  constructor() {
    this.setupHooks();
  }

  setupHooks() {
    Hooks.on("preDeleteJournalEntry", async (document, options, userId) => {
      document._pendingDeletion = true;

      const type = document.getFlag("campaign-codex", "type");
      if (!type) return;

      const data = document.getFlag("campaign-codex", "data") || {};
      if (type === "npc" && data.tagMode) {
        game.campaignCodex.removeTagFromCache(document);
        console.log(`Campaign Codex | Removed deleted tag "${document.name}" from cache.`);
      }

      try {
        await this.performComprehensiveCleanup(document, type);
      } catch (error) {
        console.warn(
          `Campaign Codex | Cleanup failed for ${document.name}:`,
          error,
        );
      }
    });


    Hooks.on("deleteJournalEntry", async (document, options, userId) => {
      const type = document.getFlag("campaign-codex", "type");
      if (!type) return;

    const tocSheet = foundry.applications.instances.get("campaign-codex-toc-sheet");
    if (tocSheet) {
      tocSheet.render();
    }

    for (const app of foundry.applications.instances.values()) {
      // for (const app of Object.values(ui.windows)) {
        if (app.document && app.document.id === document.id) {
          const isCampaignCodexSheet = [
            "LocationSheet",
            "ShopSheet",
            "NPCSheet",
            "RegionSheet",
            "GroupSheet",
          ].includes(app.constructor.name);

          if (isCampaignCodexSheet) {
            console.log(
              `Campaign Codex | Closing sheet for deleted document: ${document.name}`,
            );

            app._forceClose = true;
            await app.close();
          }
        }
      }

      await this.refreshAffectedGroupSheets(document);
    });

    Hooks.on("preDeleteActor", async (document, options, userId) => {
      try {
        await this.cleanupActorRelationships(document);
      } catch (error) {
        console.warn(
          `Campaign Codex | Actor cleanup failed for ${document.name}:`,
          error,
        );
      }
    });
  }

  /**
   * Comprehensive cleanup that searches ALL documents for relationships
   */
  async performComprehensiveCleanup(deletedDoc, type) {
    const deletedUuid = deletedDoc.uuid;
    const updatePromises = [];

    console.log(
      `Campaign Codex | Starting comprehensive cleanup for ${type}: ${deletedDoc.name}`,
    );

    const allCCDocuments = game.journal.filter((j) =>
      j.getFlag("campaign-codex", "type"),
    );

    switch (type) {
      case "region":
        updatePromises.push(
          ...(await this.cleanupRegionRelationships(
            deletedUuid,
            allCCDocuments,
          )),
        );
        break;
      case "location":
        updatePromises.push(
          ...(await this.cleanupLocationRelationships(
            deletedUuid,
            allCCDocuments,
          )),
        );
        break;
      case "shop":
        updatePromises.push(
          ...(await this.cleanupShopRelationships(deletedUuid, allCCDocuments)),
        );
        break;
      case "npc":
        updatePromises.push(
          ...(await this.cleanupNPCRelationships(deletedUuid, allCCDocuments)),
        );
        break;
      case "group":
        updatePromises.push(
          ...(await this.cleanupGroupRelationships(
            deletedUuid,
            allCCDocuments,
          )),
        );
        break;
    }

    if (updatePromises.length > 0) {
      console.log(
        `Campaign Codex | Executing ${updatePromises.length} cleanup updates`,
      );
      await Promise.allSettled(updatePromises);
      console.log(`Campaign Codex | Cleanup completed for ${deletedDoc.name}`);
    }
  }

  async cleanupRegionRelationships(deletedUuid, allDocuments) {
    const updatePromises = [];
    let needsUpdate = false;

    for (const doc of allDocuments) {
      const docType = doc.getFlag("campaign-codex", "type");
      const docData = doc.getFlag("campaign-codex", "data") || {};

      if (docType === "location" && docData.parentRegion === deletedUuid) {
        console.log(
          `Campaign Codex | Removing region reference from location: ${doc.name}`,
        );
        updatePromises.push(
          doc
            .unsetFlag("campaign-codex", "data.parentRegion")
            .catch((err) =>
              console.warn(`Failed to update:  ${doc.name}:`, err),
            ),
        );
      }

      if (docType === "shop" && docData.linkedLocation === deletedUuid) {
        console.log(
          `Campaign Codex | Removing region reference from shop: ${doc.name}`,
        );
        updatePromises.push(
          doc
            .unsetFlag("campaign-codex", "data.linkedLocation")
            .catch((err) =>
              console.warn(`Failed to update: ${doc.name}:`, err),
            ),
        );
      }

// 
      if (docType === "npc")
      {
        if (docData.linkedLocations && docData.linkedLocations.includes(deletedUuid))
         {
          console.log(`Campaign Codex | Removing location from NPC: ${doc.name}`,);
          const updatedData = { ...docData };
          updatedData.linkedLocations = updatedData.linkedLocations.filter((uuid) => uuid !== deletedUuid,);
          needsUpdate = true;
          if (needsUpdate) 
          {
              updatePromises.push(
                doc
                  .setFlag("campaign-codex", "data", updatedData)
                  .catch((err) =>
                    console.warn(`Failed to update ${docType} ${doc.name}:`, err),
                  ),
              );
          }
        }
       } 
// 


      if (
        docType === "group" &&
        docData.members &&
        docData.members.includes(deletedUuid)
      ) {
        console.log(`Campaign Codex | Removing region from group: ${doc.name}`);
        const updatedData = { ...docData };
        updatedData.members = updatedData.members.filter(
          (uuid) => uuid !== deletedUuid,
        );
        updatePromises.push(
          doc
            .setFlag("campaign-codex", "data", updatedData)
            .catch((err) =>
              console.warn(`Failed to update: ${doc.name}:`, err),
            ),
        );
      }
    }

    return updatePromises;
  }

  async cleanupLocationRelationships(deletedUuid, allDocuments) {
    const updatePromises = [];

    for (const doc of allDocuments) {
      const docType = doc.getFlag("campaign-codex", "type");
      const docData = doc.getFlag("campaign-codex", "data") || {};
      let needsUpdate = false;
      const updatedData = { ...docData };

      switch (docType) {
        case "region":
          if (
            docData.linkedLocations &&
            docData.linkedLocations.includes(deletedUuid)
          ) {
            console.log(
              `Campaign Codex | Removing location from region: ${doc.name}`,
            );
            updatedData.linkedLocations = updatedData.linkedLocations.filter(
              (uuid) => uuid !== deletedUuid,
            );
            needsUpdate = true;
          }
          break;

        case "npc":
          if (
            docData.linkedLocations &&
            docData.linkedLocations.includes(deletedUuid)
          ) {
            console.log(
              `Campaign Codex | Removing location from NPC: ${doc.name}`,
            );
            updatedData.linkedLocations = updatedData.linkedLocations.filter(
              (uuid) => uuid !== deletedUuid,
            );
            needsUpdate = true;
          }
          break;

        case "shop":
          if (docData.linkedLocation === deletedUuid) {
            console.log(
              `Campaign Codex | Removing location reference from shop: ${doc.name}`,
            );
            updatedData.linkedLocation = null;
            needsUpdate = true;
          }
          break;

        case "group":
          if (docData.members && docData.members.includes(deletedUuid)) {
            console.log(
              `Campaign Codex | Removing location from group: ${doc.name}`,
            );
            updatedData.members = updatedData.members.filter(
              (uuid) => uuid !== deletedUuid,
            );
            needsUpdate = true;
          }
          break;
      }

      if (needsUpdate) {
        updatePromises.push(
          doc
            .setFlag("campaign-codex", "data", updatedData)
            .catch((err) =>
              console.warn(`Failed to update ${docType} ${doc.name}:`, err),
            ),
        );
      }
    }

    return updatePromises;
  }

  async cleanupShopRelationships(deletedUuid, allDocuments) {
    const updatePromises = [];

    for (const doc of allDocuments) {
      const docType = doc.getFlag("campaign-codex", "type");
      const docData = doc.getFlag("campaign-codex", "data") || {};
      let needsUpdate = false;
      const updatedData = { ...docData };

      switch (docType) {
        case "region":
          if (
            docData.linkedShops &&
            docData.linkedShops.includes(deletedUuid)
          ) {
            console.log(
              `Campaign Codex | Removing shop from region: ${doc.name}`,
            );
            updatedData.linkedShops = updatedData.linkedShops.filter(
              (uuid) => uuid !== deletedUuid,
            );
            needsUpdate = true;
          }
          break;

        case "location":
          if (
            docData.linkedShops &&
            docData.linkedShops.includes(deletedUuid)
          ) {
            console.log(
              `Campaign Codex | Removing shop from location: ${doc.name}`,
            );
            updatedData.linkedShops = updatedData.linkedShops.filter(
              (uuid) => uuid !== deletedUuid,
            );
            needsUpdate = true;
          }
          break;

        case "npc":
          if (
            docData.linkedShops &&
            docData.linkedShops.includes(deletedUuid)
          ) {
            console.log(`Campaign Codex | Removing shop from NPC: ${doc.name}`);
            updatedData.linkedShops = updatedData.linkedShops.filter(
              (uuid) => uuid !== deletedUuid,
            );
            needsUpdate = true;
          }
          break;

        case "group":
          if (docData.members && docData.members.includes(deletedUuid)) {
            console.log(
              `Campaign Codex | Removing shop from group: ${doc.name}`,
            );
            updatedData.members = updatedData.members.filter(
              (uuid) => uuid !== deletedUuid,
            );
            needsUpdate = true;
          }
          break;
      }

      if (needsUpdate) {
        updatePromises.push(
          doc
            .setFlag("campaign-codex", "data", updatedData)
            .catch((err) =>
              console.warn(`Failed to update ${docType} ${doc.name}:`, err),
            ),
        );
      }
    }

    return updatePromises;
  }

  async cleanupNPCRelationships(deletedUuid, allDocuments) {
    const updatePromises = [];

    for (const doc of allDocuments) {
      const docType = doc.getFlag("campaign-codex", "type");
      const docData = doc.getFlag("campaign-codex", "data") || {};
      let needsUpdate = false;
      const updatedData = { ...docData };

      switch (docType) {
        case "region":
          if (docData.linkedNPCs && docData.linkedNPCs.includes(deletedUuid)) {
            console.log(
              `Campaign Codex | Removing NPC from region: ${doc.name}`,
            );
            updatedData.linkedNPCs = updatedData.linkedNPCs.filter(
              (uuid) => uuid !== deletedUuid,
            );
            needsUpdate = true;
          }
          break;

        case "location":
          if (docData.linkedNPCs && docData.linkedNPCs.includes(deletedUuid)) {
            console.log(
              `Campaign Codex | Removing NPC from location: ${doc.name}`,
            );
            updatedData.linkedNPCs = updatedData.linkedNPCs.filter(
              (uuid) => uuid !== deletedUuid,
            );
            needsUpdate = true;
          }
          break;

        case "shop":
          if (docData.linkedNPCs && docData.linkedNPCs.includes(deletedUuid)) {
            console.log(`Campaign Codex | Removing NPC from shop: ${doc.name}`);
            updatedData.linkedNPCs = updatedData.linkedNPCs.filter(
              (uuid) => uuid !== deletedUuid,
            );
            needsUpdate = true;
          }
          break;

        case "npc":
          if (docData.associates && docData.associates.includes(deletedUuid)) {
            console.log(
              `Campaign Codex | Removing NPC association from: ${doc.name}`,
            );
            updatedData.associates = updatedData.associates.filter(
              (uuid) => uuid !== deletedUuid,
            );
            needsUpdate = true;
          }
          break;

        case "group":
          if (docData.members && docData.members.includes(deletedUuid)) {
            console.log(
              `Campaign Codex | Removing NPC from group: ${doc.name}`,
            );
            updatedData.members = updatedData.members.filter(
              (uuid) => uuid !== deletedUuid,
            );
            needsUpdate = true;
          }
          break;
      }

      if (needsUpdate) {
        updatePromises.push(
          doc
            .setFlag("campaign-codex", "data", updatedData)
            .catch((err) =>
              console.warn(`Failed to update ${docType} ${doc.name}:`, err),
            ),
        );
      }
    }

    return updatePromises;
  }

  async cleanupGroupRelationships(deletedUuid, allDocuments) {
    console.log(
      `Campaign Codex | No bidirectional cleanup needed for group deletion`,
    );
    return [];
  }

  /**
   * Enhanced actor cleanup that searches all NPC journals
   */
  async cleanupActorRelationships(actorDoc) {
    const actorUuid = actorDoc.uuid;
    const updatePromises = [];

    console.log(
      `Campaign Codex | Starting actor cleanup for: ${actorDoc.name}`,
    );

    const npcJournals = game.journal.filter((j) => {
      const data = j.getFlag("campaign-codex", "data");
      return data && data.linkedActor === actorUuid;
    });

    for (const journal of npcJournals) {
      console.log(
        `Campaign Codex | Removing actor link from NPC journal: ${journal.name}`,
      );
      const data = journal.getFlag("campaign-codex", "data") || {};
      data.linkedActor = null;

      updatePromises.push(
        journal
          .setFlag("campaign-codex", "data", data)
          .catch((err) =>
            console.warn(`Failed to update NPC journal ${journal.name}:`, err),
          ),
      );
    }

    if (updatePromises.length > 0) {
      await Promise.allSettled(updatePromises);
      console.log(
        `Campaign Codex | Actor cleanup completed, updated ${updatePromises.length} NPC journals`,
      );
    }
  }

  /**
   * Refresh any open group sheets that might be affected by document deletion
   */
  async refreshAffectedGroupSheets(deletedDoc) {
    const deletedUuid = deletedDoc.uuid;

      // if (app.document && uuidSet.has(app.document.uuid)) {
      //     app.render(true);
      //   }
      // }
    for (const app of foundry.applications.instances.values()) {
    // for (const app of Object.values(ui.windows)) {
      if (app.constructor.name === "GroupSheet" && app.document) {
        const groupData = app.document.getFlag("campaign-codex", "data") || {};
        const members = groupData.members || [];

        if (members.includes(deletedUuid)) {
          console.log(
            `Campaign Codex | Refreshing affected group sheet: ${app.document.name}`,
          );

          const updatedData = { ...groupData };
          updatedData.members = updatedData.members.filter(
            (uuid) => uuid !== deletedUuid,
          );

          try {
            await app.document.setFlag("campaign-codex", "data", updatedData);
            app.render(false);
          } catch (error) {
            console.warn(
              `Failed to update group sheet ${app.document.name}:`,
              error,
            );
          }
        }
      }
    }
  }

  /**
   * Manual cleanup function for when things get out of sync
   */
  static async performManualCleanup() {
    console.log(
      "Campaign Codex | Starting manual cleanup of all relationships",
    );

    const allCCDocuments = game.journal.filter((j) =>
      j.getFlag("campaign-codex", "type"),
    );
    const brokenLinks = [];
    const fixPromises = [];

    for (const doc of allCCDocuments) {
      const type = doc.getFlag("campaign-codex", "type");
      const data = doc.getFlag("campaign-codex", "data") || {};

      const uuidsToCheck = [];

      if (data.linkedActor)
        uuidsToCheck.push({ field: "linkedActor", uuid: data.linkedActor });
      if (data.linkedLocation)
        uuidsToCheck.push({
          field: "linkedLocation",
          uuid: data.linkedLocation,
        });
      if (data.parentRegion)
        uuidsToCheck.push({ field: "parentRegion", uuid: data.parentRegion });
      if (data.linkedScene)
        uuidsToCheck.push({ field: "linkedScene", uuid: data.linkedScene });
      if (data.linkedStandardJournal)
        uuidsToCheck.push({
          field: "linkedStandardJournal",
          uuid: data.linkedStandardJournal,
        });

      [
        "linkedNPCs",
        "linkedShops",
        "linkedLocations",
        "associates",
        "members",
      ].forEach((field) => {
        if (Array.isArray(data[field])) {
          data[field].forEach((uuid) =>
            uuidsToCheck.push({ field, uuid, isArray: true }),
          );
        }
      });

      if (Array.isArray(data.inventory)) {
        data.inventory.forEach((item, index) => {
          if (item.itemUuid) {
            uuidsToCheck.push({
              field: "inventory",
              uuid: item.itemUuid,
              isArray: true,
              index,
            });
          }
        });
      }

      for (const check of uuidsToCheck) {
        try {
          const linkedDoc = await fromUuid(check.uuid);
          if (!linkedDoc) {
            brokenLinks.push({
              document: doc,
              field: check.field,
              uuid: check.uuid,
              isArray: check.isArray,
              index: check.index,
            });
          }
        } catch (error) {
          brokenLinks.push({
            document: doc,
            field: check.field,
            uuid: check.uuid,
            isArray: check.isArray,
            index: check.index,
          });
        }
      }
    }

    console.log(`Campaign Codex | Found ${brokenLinks.length} broken links`);

    const fixesByDocument = new Map();

    for (const broken of brokenLinks) {
      if (!fixesByDocument.has(broken.document.id)) {
        fixesByDocument.set(broken.document.id, {
          document: broken.document,
          data: {
            ...(broken.document.getFlag("campaign-codex", "data") || {}),
          },
        });
      }

      const fix = fixesByDocument.get(broken.document.id);

      if (broken.isArray) {
        if (broken.field === "inventory" && broken.index !== undefined) {
          fix.data.inventory = fix.data.inventory.filter(
            (_, i) => i !== broken.index,
          );
        } else if (Array.isArray(fix.data[broken.field])) {
          fix.data[broken.field] = fix.data[broken.field].filter(
            (uuid) => uuid !== broken.uuid,
          );
        }
      } else {
        fix.data[broken.field] = null;
      }
    }

    for (const fix of fixesByDocument.values()) {
      fixPromises.push(
        fix.document
          .setFlag("campaign-codex", "data", fix.data)
          .catch((err) =>
            console.warn(`Failed to fix ${fix.document.name}:`, err),
          ),
      );
    }

    await Promise.allSettled(fixPromises);

    console.log(
      `Campaign Codex | Manual cleanup completed. Fixed ${fixPromises.length} documents.`,
    );
    ui.notifications.info(
      `Manual cleanup completed. Fixed ${brokenLinks.length} broken links in ${fixPromises.length} documents.`,
    );
  }

  async cleanupSceneRelationships(deletedUuid, allDocuments) {
    const updatePromises = [];

    for (const doc of allDocuments) {
      const docData = doc.getFlag("campaign-codex", "data") || {};

      if (docData.linkedScene === deletedUuid) {
        console.log(
          `Campaign Codex | Removing scene reference from: ${doc.name}`,
        );
        updatePromises.push(
          doc
            .unsetFlag("campaign-codex", "data.linkedScene")
            .catch((err) => console.warn(`Failed to update ${doc.name}:`, err)),
        );
      }
    }

    return updatePromises;
  }

  async cleanupStandardJournalRelationships(deletedUuid, allDocuments) {
    const updatePromises = [];

    for (const doc of allDocuments) {
      const docData = doc.getFlag("campaign-codex", "data") || {};

      if (docData.linkedStandardJournal === deletedUuid) {
        console.log(
          `Campaign Codex | Removing standard journal reference from: ${doc.name}`,
        );

        const updatedData = foundry.utils.deepClone(docData);
        updatedData.linkedStandardJournal = null;

        updatePromises.push(
          doc
            .setFlag("campaign-codex", "data", updatedData)
            .catch((err) => console.warn(`Failed to update ${doc.name}:`, err)),
        );
      }
    }

    return updatePromises;
  }
}
