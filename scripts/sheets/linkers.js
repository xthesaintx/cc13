import { TemplateComponents } from "./template-components.js";
import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { localize, format } from "../helper.js";

/**
 * A static utility class for fetching, processing, and cleaning linked data
 * between different Campaign Codex documents.
 */
export class CampaignCodexLinkers {
  // =========================================================================
  // General & Data Cleaning Utilities
  // =========================================================================

  /**
   * A safe way to get a nested value from an object using a string path.
   * @param {object} obj The object to query.
   * @param {string} path The dot-separated path to the value.
   * @returns {*} The value, or undefined if not found.
   */
  static getValue(obj, path) {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  }

  /**
   * Clear broken references from a document
   * @param {Document} document - The document to clean
   * @param {Array} brokenUuids - Array of broken reference UUIDs
   * @param {string} fieldName - The field name to clean (e.g., 'linkedLocations', 'linkedNPCs')
   */
  static async clearBrokenReferences(document, brokenUuids, fieldName) {
    if (!document || !brokenUuids || brokenUuids.length === 0 || game.campaignCodexImporting) return;

    try {
      const currentData = document.getFlag("campaign-codex", "data") || {};
      const currentArray = currentData[fieldName] || [];

      const cleanedArray = currentArray.filter((uuid) => !brokenUuids.includes(uuid));

      if (cleanedArray.length !== currentArray.length) {
        currentData[fieldName] = cleanedArray;
        await document.setFlag("campaign-codex", "data", currentData);

        const removedCount = currentArray.length - cleanedArray.length;
        ui.notifications.warn(`Removed ${removedCount} broken ${fieldName} references from ${document.name}`);
      }
    } catch (error) {
      console.error(`Campaign Codex | Error clearing broken ${fieldName} references:`, error);
    }
  }

  /**
   * Creates a unique, permission-filtered list of items from multiple sources.
   * @param {Array<object>} sources Array of source objects, each with a `data` array.
   * @param {string} [uniqueKey="id"] The property to use for uniqueness checks.
   * @returns {Array<object>} The filtered array of unique items.
   */
  static createQuickTags(sources, uniqueKey = "id") {
    if (!sources || !Array.isArray(sources)) return [];
    const alphaCards = game.settings.get("campaign-codex", "sortCardsAlpha");
    const sourcesToRender = alphaCards ? [...sources].sort((a, b) => a.name.localeCompare(b.name)) : sources;
    const seen = new Set();
    const uniqueLinks = sourcesToRender.filter((item) => {
      const identifier = item[uniqueKey];
      if (seen.has(identifier)) return false;
      seen.add(identifier);
      return true;
    });
    if (game.user.isGM) return uniqueLinks;
    return uniqueLinks.filter((item) => (item.permission || 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
  }

  /**
   * Creates a unique, permission-filtered list of items from multiple sources.
   * @param {Array<object>} sources Array of source objects, each with a `data` array.
   * @param {string} [uniqueKey="id"] The property to use for uniqueness checks.
   * @returns {Array<object>} The filtered array of unique items.
   */
  static createQuickLinks(sources, uniqueKey = "id") {
    if (!sources || !Array.isArray(sources)) {
      return [];
    }

    const allItems = sources.flatMap((source) => {
      if (!Array.isArray(source.data)) return [];
      return source.data.map((item) => ({ ...item, type: source.type }));
    });

    const seen = new Set();
    const uniqueLinks = allItems.filter((item) => {
      const identifier = item[uniqueKey];
      if (seen.has(identifier)) {
        return false;
      }
      seen.add(identifier);
      return true;
    });

    if (game.user.isGM) {
      return uniqueLinks;
    }

    return uniqueLinks.filter((item) => {
      const permissionLevel = item.permission || 0;

      return permissionLevel >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    });
  }

  // =========================================================================
  // Actor & Character Data
  // =========================================================================

  /**
   * Fetches and processes data for a single linked actor.
   * @param {string} actorUuid The UUID of the actor to fetch.
   * @returns {Promise<object|null>}
   */
  static getLinkedActor(actorUuid) {
    if (!actorUuid) return Promise.resolve(null);

    return fromUuid(actorUuid)
      .then((actor) => {
        if (!actor) {
          console.warn(`Campaign Codex | Linked actor not found: ${actorUuid}`);
          return null;
        }

        // Chain the second promise for the permission check
        return CampaignCodexBaseSheet.canUserView(actor.uuid).then((canView) => {
          // Once the permission check is complete, return the final object
          return {
            id: actor.id,
            uuid: actor.uuid,
            name: actor.name,
            img: actor.img,
            type: actor.type,
            permission: actor.permission,
            canView: canView,
          };
        });
      })
      .catch((error) => {
        console.error(`Campaign Codex | Error getting linked actor ${actorUuid}:`, error);
        return null;
      });
  }

  // =========================================================================
  // Region & Location Data
  // =========================================================================

  /**
   * Fetches the parent region for a given location document.
   * @param {Document} locationDoc The location document.
   * @returns {Promise<object|null>}
   */
  static getLinkedRegion(locationDoc) {
    const locationData = locationDoc.getFlag("campaign-codex", "data") || {};
    const regionUuid = locationData.parentRegion;

    if (!regionUuid) return Promise.resolve(null);

    return fromUuid(regionUuid)
      .then((region) => {
        if (!region) {
          console.warn(`Campaign Codex | Broken parentRegion link from ${locationDoc.name}: ${regionUuid}`);
          return locationDoc.unsetFlag("campaign-codex", "data.parentRegion").then(() => {
            ui.notifications.warn(`Removed broken parent region link from ${locationDoc.name}.`);
            return null;
          });
        }

        return CampaignCodexBaseSheet.canUserView(region.uuid).then((canView) => {
          return {
            id: region.id,
            uuid: region.uuid,
            name: region.name,
            permission: region.permission,
            canView: canView,
            img: region.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "region"),
          };
        });
      })
      .catch((error) => {
        console.error(`Campaign Codex | Error fetching linked region ${regionUuid}:`, error);
        return null;
      });
  }

  /**
   * Fetches and processes a single location from a UUID.
   * @param {string} locationUuid The UUID of the location.
   * @returns {Promise<object|null>}
   */
  static getLinkedLocation(locationUuid) {
    if (!locationUuid) return Promise.resolve(null);

    return fromUuid(locationUuid)
      .then((journal) => {
        if (!journal) {
          console.warn(`Campaign Codex | Linked location not found: ${locationUuid}`);
          return null;
        }

        const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "location");

        return CampaignCodexBaseSheet.canUserView(journal.uuid).then((canView) => {
          return {
            id: journal.id,
            uuid: journal.uuid,
            name: journal.name,
            canView: canView,
            permission: journal.permission,
            img: imageData,
          };
        });
      })
      .catch((error) => {
        console.error(`Campaign Codex | Error getting linked location ${locationUuid}:`, error);
        return null;
      });
  }

  /**
   * Fetches and processes a list of locations, adding metadata like NPC and shop counts.
   * @param {Document} document The document context for cleaning references.
   * @param {string[]} locationUuids Array of location UUIDs.
   * @returns {Promise<Array<object>>}
   */
  static async getLinkedLocations(document, locationUuids) {
    if (!locationUuids || !Array.isArray(locationUuids)) return [];
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const locationPromises = locationUuids.map(async (uuid) => {
      const journal = await fromUuid(uuid);
      if (!journal) {
        throw new Error(`Linked location not found: ${uuid}`);
      }

      const locationData = journal.getFlag("campaign-codex", "data") || {};
      const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "location");

      const [linkedTags, linkedShops, canView] = await Promise.all([
        this.getTaggedNPCs(locationData.linkedNPCs),
        this.getNameFromUuids(locationData.linkedShops || []),
        CampaignCodexBaseSheet.canUserView(journal.uuid),
      ]);

      return {
        id: journal.id,
        uuid: journal.uuid,
        name: journal.name,
        shops: linkedShops.sort(),
        canView: canView,
        permission: journal.permission,
        tags: linkedTags
          .filter((tag) => !hideByPermission || tag.canView)
          .map((tag) => tag.name)
          .sort(),
        img: imageData,
        meta: `<span></span>`,
      };
    });

    const results = await Promise.allSettled(locationPromises);

    const locations = [];
    const brokenLocationUuids = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        locations.push(result.value);
      } else {
        const failedUuid = locationUuids[index];
        brokenLocationUuids.push(failedUuid);
        console.warn(`Campaign Codex | ${result.reason.message}`);
      }
    });

    if (brokenLocationUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenLocationUuids, "linkedLocations");
      delete document._skipRelationshipUpdates;
    }

    return locations;
  }

  /**
   * Gathers all locations an NPC is associated with, both directly and indirectly via shops.
   * @static
   * @async
   * @param {Document} document                The NPC document.
   * @param {string[]} directLocationUuids     Array of directly linked location UUIDs.
   * @returns {Promise<Array<object>>}         A promise that resolves to an array of formatted location objects.
   */
  static async getAllLocations(document, directLocationUuids) {
    if (!directLocationUuids || !Array.isArray(directLocationUuids)) return [];

    const locationMap = new Map();
    const brokenLocationUuids = [];
    const brokenShopUuids = [];

    const locationPromises = directLocationUuids.map((uuid) => this._processDirectLocation(uuid, locationMap));
    const locationResults = await Promise.allSettled(locationPromises);

    locationResults.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`Campaign Codex | Error processing location ${directLocationUuids[index]}:`, result.reason);
        brokenLocationUuids.push(directLocationUuids[index]);
      }
    });

    if (brokenLocationUuids.length > 0 && !game.campaignCodexImporting) {
      await this._clearBrokenDocumentReferences(document, brokenLocationUuids, "linkedLocations");
    }

    const npcData = document.getFlag("campaign-codex", "data") || {};
    const npcLinkedShopUuids = npcData.linkedShops || [];

    const shopPromises = npcLinkedShopUuids.map((shopUuid) => this._processShopForLocation(shopUuid, document, locationMap));
    const shopResults = await Promise.allSettled(shopPromises);

    shopResults.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value?.isBroken) {
        brokenShopUuids.push(npcLinkedShopUuids[index]);
      } else if (result.status === "rejected") {
        console.error(`Campaign Codex | Error processing shop ${npcLinkedShopUuids[index]} for location discovery:`, result.reason);
      }
    });

    if (brokenShopUuids.length > 0 && !game.campaignCodexImporting) {
      await this._clearBrokenDocumentReferences(document, brokenShopUuids, "linkedShops");
    }

    return Array.from(locationMap.values());
  }

  /**
   * Processes a single directly linked location and adds it to the map.
   * @private
   * @static
   * @async
   * @param {string} uuid                      The UUID of the location to process.
   * @param {Map<string, object>} locationMap  The map to populate with location data.
   * @returns {Promise<void>}
   * @throws {Error}                           Throws an error if the location document is not found.
   */
  static async _processDirectLocation(uuid, locationMap) {
    const journal = await fromUuid(uuid);
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    if (!journal) {
      console.warn(`Campaign Codex | Linked location not found: ${uuid}`);
      throw new Error("Location not found");
    }

    const typeData = journal.getFlag("campaign-codex", "type") || {};
    const npcData = journal.getFlag("campaign-codex", "data") || {};
    const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "location");
    const typeIcon = typeData === "region" || typeData === "location" ? typeData : "location";

    const [linkedTags, linkedShops, canView] = await Promise.all([
      this.getTaggedNPCs(npcData.linkedNPCs),
      this.getNameFromUuids(npcData.linkedShops || []),
      CampaignCodexBaseSheet.canUserView(journal.uuid),
    ]);

    locationMap.set(journal.id, {
      id: journal.id,
      uuid: journal.uuid,
      name: journal.name,
      img: imageData,
      tags: (linkedTags || [])
        .filter((tag) => !hideByPermission || tag.canView)
        .map((tag) => tag.name)
        .sort(),
      source: "direct",
      canView: canView,
      shops: linkedShops,
      permission: journal.permission,
      meta: `<i class="${TemplateComponents.getAsset("icon", typeIcon)}"></i>`,
    });
  }

  /**
   * Processes a shop to find its associated location and adds/updates it in the map.
   * @private
   * @static
   * @async
   * @param {string} shopUuid                  The UUID of the shop to process.
   * @param {Document} document                The original NPC document for back-reference checks.
   * @param {Map<string, object>} locationMap  The map to populate with location data.
   * @returns {Promise<{isBroken: boolean}|void>} An object indicating a broken link, or nothing.
   */
  static async _processShopForLocation(shopUuid, document, locationMap) {
    const shop = await fromUuid(shopUuid);
    if (!shop) {
      console.warn(`Campaign Codex | Shop not found during location discovery: ${shopUuid}`);
      return { isBroken: true };
    }

    const shopData = shop.getFlag("campaign-codex", "data") || {};
    const linkedNPCUuids = shopData.linkedNPCs || [];

    if (!linkedNPCUuids.includes(document.uuid)) {
      if (!game.campaignCodexImporting) {
        console.warn(`Campaign Codex | NPC ${document.name} thinks it's linked to shop ${shop.name}, but shop doesn't link back.`);
        return { isBroken: true };
      }
      return;
    }

    const shopLocationUuid = shopData.linkedLocation;
    if (!shopLocationUuid) return;

    const location = await fromUuid(shopLocationUuid);
    if (!location) return;

    const locationData = location.getFlag("campaign-codex", "data") || {};
    const locationShopUuids = locationData.linkedShops || [];

    const typeData = shop.getFlag("campaign-codex", "type") || {};
    const typeIcon = typeData === "region" || typeData === "location" ? typeData : "location";

    if (!locationShopUuids.includes(shop.uuid)) return;

    if (!locationMap.has(location.id)) {
      const [linkedTagsSecondary, canView] = await Promise.all([this.getTaggedNPCs(locationData.linkedNPCs), CampaignCodexBaseSheet.canUserView(location.uuid)]);

      locationMap.set(location.id, {
        id: location.id,
        uuid: location.uuid,
        name: location.name,
        tags: (linkedTagsSecondary || []).map((tag) => tag.name),
        img: location.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "shop"),
        source: "shop",
        shops: [shop.name],
        canView: canView,
        permission: location.permission,
        meta: `<i class="${TemplateComponents.getAsset("icon", typeIcon)}"></i>`,
      });
    } else {
      const existingLocation = locationMap.get(location.id);
      if (existingLocation.source === "shop" && !existingLocation.shops.includes(shop.name)) {
        existingLocation.shops.push(shop.name);
      }
    }
  }

  /**
   * A utility to safely clear broken UUIDs from a document's flags.
   * @private
   * @static
   * @async
   * @param {Document} document   The document to update.
   * @param {string[]} uuids      An array of broken UUIDs to remove.
   * @param {string} flag         The name of the flag property (e.g., "linkedLocations").
   * @returns {Promise<void>}
   */
  static async _clearBrokenDocumentReferences(document, uuids, flag) {
    document._skipRelationshipUpdates = true;
    await this.clearBrokenReferences(document, uuids, flag);
    delete document._skipRelationshipUpdates;
  }

  // =========================================================================
  // NPC & Associate Data
  // =========================================================================

  /**
   * Fetches and processes a list of linked NPCs.
   * @param {Document} document The document context for cleaning references.
   * @param {string[]} npcUuids Array of NPC UUIDs.
   * @returns {Promise<Array<object>>}
   */
  static async getLinkedNPCs(document, npcUuids) {
    if (!npcUuids || !Array.isArray(npcUuids)) return [];
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const npcPromises = npcUuids.map(async (uuid) => {
      const journal = await fromUuid(uuid);
      if (!journal) {
        throw new Error(`NPC journal not found: ${uuid}`);
      }

      const npcData = journal.getFlag("campaign-codex", "data") || {};

      const [actor, linkedTags, allLocations, linkedShops, canView] = await Promise.all([
        npcData.linkedActor ? fromUuid(npcData.linkedActor) : Promise.resolve(null),
        this.getTaggedNPCs(npcData.associates),
        this.getNameFromUuids(npcData.linkedLocations || []),
        this.getNameFromUuids(npcData.linkedShops || []),
        CampaignCodexBaseSheet.canUserView(journal.uuid),
      ]);

      const imageData = journal.getFlag("campaign-codex", "image") || actor?.img || TemplateComponents.getAsset("image", "npc");

      return {
        id: journal.id,
        uuid: journal.uuid,
        name: journal.name,
        locations: allLocations.sort(),
        shops: linkedShops.sort(),
        img: imageData,
        tag: npcData.tagMode,
        tags: (linkedTags || [])
          .filter((tag) => !hideByPermission || tag.canView)
          .map((tag) => tag.name)
          .sort(),
        actor: actor,
        canView: canView,
        permission: journal.permission,
        meta: game.campaignCodex?.getActorDisplayMeta(actor, npcData.tagMode) || `<span class="entity-type">${localize("names.npc")}</span>`,
      };
    });

    const results = await Promise.allSettled(npcPromises);

    const npcs = [];
    const brokenNPCUuids = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        npcs.push(result.value);
      } else {
        const failedUuid = npcUuids[index];
        brokenNPCUuids.push(failedUuid);
        console.error(`Campaign Codex | Error processing NPC ${failedUuid}:`, result.reason);
      }
    });

    if (brokenNPCUuids.length > 0 && !game.campaignCodexImporting) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenNPCUuids, "linkedNPCs");
      delete document._skipRelationshipUpdates;
    }

    return npcs;
  }

  /**
   * Fetches and processes a list of directly linked NPCs.
   * @param {Document} document The document context for cleaning references.
   * @param {string[]} npcUuids Array of NPC UUIDs.
   * @returns {Promise<Array<object>>}
   */

  static async getDirectNPCs(document, npcUuids) {
    if (!npcUuids || !Array.isArray(npcUuids)) return [];
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const npcPromises = npcUuids.map(async (uuid) => {
      const journal = await fromUuid(uuid);
      if (!journal) {
        throw new Error(`Direct NPC journal not found: ${uuid}`);
      }

      const npcData = journal.getFlag("campaign-codex", "data") || {};

      const [actor, linkedTags, allLocations, linkedShops, canView] = await Promise.all([
        npcData.linkedActor ? fromUuid(npcData.linkedActor) : Promise.resolve(null),
        this.getTaggedNPCs(npcData.associates),
        this.getNameFromUuids(npcData.linkedLocations || []),
        this.getNameFromUuids(npcData.linkedShops || []),
        CampaignCodexBaseSheet.canUserView(journal.uuid),
      ]);

      const imageData = journal.getFlag("campaign-codex", "image") || actor?.img || TemplateComponents.getAsset("image", "npc");

      return {
        id: journal.id,
        uuid: journal.uuid,
        name: journal.name,
        img: imageData,
        actor: actor,
        canView: canView,
        permission: journal.permission,
        tag: npcData.tagMode,
        tags: (linkedTags || [])
          .filter((tag) => !hideByPermission || tag.canView)
          .map((tag) => tag.name)
          .sort(),
        meta: game.campaignCodex?.getActorDisplayMeta(actor, npcData.tagMode) || `<span class="entity-type">${localize("names.npc")}</span>`,
        locations: allLocations.sort(),
        shops: linkedShops.sort(),
        source: "direct",
      };
    });

    const results = await Promise.allSettled(npcPromises);

    const npcs = [];
    const brokenNPCUuids = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        npcs.push(result.value);
      } else {
        const failedUuid = npcUuids[index];
        brokenNPCUuids.push(failedUuid);
        console.error(`Campaign Codex | Error processing direct NPC ${failedUuid}:`, result.reason);
      }
    });

    if (brokenNPCUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenNPCUuids, "linkedNPCs");
      delete document._skipRelationshipUpdates;
    }

    return npcs;
  }

  /**
   * Fetches NPCs linked via shops.
   * @param {Document} document The document context for cleaning references.
   * @param {string[]} shopUuids Array of shop UUIDs.
   * @returns {Promise<Array<object>>}
   */
  static async getShopNPCs(document, shopUuids) {
    if (!shopUuids || !Array.isArray(shopUuids)) return [];

    const shopPromises = shopUuids.map(async (shopUuid) => {
      const shop = await fromUuid(shopUuid);
      if (!shop) {
        throw new Error(`Shop not found: ${shopUuid}`);
      }
      const shopData = shop.getFlag("campaign-codex", "data") || {};
      const linkedNPCUuids = shopData.linkedNPCs || [];

      const linkedNpcs = await this.getLinkedNPCs(shop, linkedNPCUuids);

      return { shopName: shop.name, npcs: linkedNpcs };
    });

    const results = await Promise.allSettled(shopPromises);

    const npcMap = new Map();
    const brokenShopUuids = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        const { shopName, npcs } = result.value;
        for (const npc of npcs) {
          if (!npcMap.has(npc.id)) {
            npcMap.set(npc.id, {
              ...npc,
              shops: [shopName],
              source: "shop",
            });
          } else {
            const existingNpc = npcMap.get(npc.id);
            if (!existingNpc.shops.includes(shopName)) {
              existingNpc.shops.push(shopName);
            }
          }
        }
      } else {
        const failedUuid = shopUuids[index];
        brokenShopUuids.push(failedUuid);
        console.error(`Campaign Codex | Error processing shop ${failedUuid}:`, result.reason);
      }
    });

    if (brokenShopUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenShopUuids, "linkedShops");
      delete document._skipRelationshipUpdates;
    }

    return Array.from(npcMap.values());
  }

  /**
   * Fetches and processes tagged NPCs, including their view permissions.
   * @param {string[]} npcList Array of NPC UUIDs.
   * @returns {Promise<Array<object>>}
   */

  static async getTaggedNPCs(npcList) {
    if (!npcList?.length) return [];
    const tagPromises = npcList.map(async (uuid) => {
      try {
        const journal = await fromUuid(uuid);
        if (!journal) return null;

        const npcData = journal.getFlag("campaign-codex", "data") || {};
        if (npcData.tagMode) {
          return {
            id: journal.id,
            uuid: journal.uuid,
            name: journal.name,
            permission: journal.permission,
            meta: `<span class="entity-type" style="background: var(--cc-border);">${localize("names.tag")}</span>`,
            tag: npcData.tagMode,
            canView: await CampaignCodexBaseSheet.canUserView(journal.uuid),
          };
        }
        return null;
      } catch (error) {
        console.log(error);
        return null;
      }
    });
    const resolvedTags = await Promise.all(tagPromises);
    return resolvedTags.filter(Boolean);
  }

  /**
   * Fetches and processes NPC associates with extra location/shop context.
   * @param {Document} document The document context for cleaning references.
   * @param {string[]} associateUuids Array of associate NPC UUIDs.
   * @returns {Promise<Array<object>>}
   */

  static async getAssociates(document, associateUuids) {
    if (!associateUuids || !Array.isArray(associateUuids)) return [];
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");

    const associatePromises = associateUuids.map(async (uuid) => {
      try {
        const journal = await fromUuid(uuid);
        if (!journal) {
          throw new Error(`Associate journal not found: ${uuid}`);
        }

        const npcData = journal.getFlag("campaign-codex", "data") || {};

        const [actor, allLocations, linkedShops, linkedTags, canView] = await Promise.all([
          npcData.linkedActor ? fromUuid(npcData.linkedActor) : Promise.resolve(null),
          this.getNameFromUuids(npcData.linkedLocations || []),
          this.getNameFromUuids(npcData.linkedShops || []),
          this.getTaggedNPCs(npcData.associates),
          CampaignCodexBaseSheet.canUserView(journal.uuid),
        ]);

        const imageData = journal.getFlag("campaign-codex", "image") || actor?.img || TemplateComponents.getAsset("image", "npc");
        const filteredTags = (linkedTags || [])
          .filter((tag) => !hideByPermission || tag.canView)
          .map((tag) => tag.name)
          .sort();

        return {
          id: journal.id,
          uuid: journal.uuid,
          name: journal.name,
          img: imageData,
          actor: actor,
          tag: npcData.tagMode,
          type: journal.getFlag("campaign-codex", "type") || "npc",
          tags: filteredTags,
          permission: journal.permission,
          meta: game.campaignCodex?.getActorDisplayMeta(actor, npcData.tagMode) || `<span class="entity-type">${localize("names.npc")}</span>`,
          locations: allLocations.sort(),
          shops: linkedShops.sort(),
          canView: canView,
        };
      } catch (error) {
        throw new Error(`Error processing associate ${uuid}: ${error.message}`);
      }
    });

    const results = await Promise.allSettled(associatePromises);

    const associates = [];
    const brokenAssociateUuids = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        associates.push(result.value);
      } else {
        const failedUuid = associateUuids[index];
        brokenAssociateUuids.push(failedUuid);
        console.error(`Campaign Codex | ${result.reason.message}`);
      }
    });

    if (brokenAssociateUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenAssociateUuids, "associates");
      delete document._skipRelationshipUpdates;
    }

    return associates;
  }

  /**
   * Gathers all unique NPCs from a list of locations, including those in shops.
   * @param {string[]} locationUuids Array of location UUIDs to scan.
   * @returns {Promise<Array<object>>}
   */
  static async getAllNPCs(locationUuids) {
    if (!locationUuids || !Array.isArray(locationUuids)) return [];

    const locationPromises = locationUuids.map(async (locationUuid) => {
      const location = await fromUuid(locationUuid);
      if (!location) {
        throw new Error(`Location not found for NPC aggregation: ${locationUuid}`);
      }

      const allNpcsFromThisLocation = [];
      const locationData = location.getFlag("campaign-codex", "data") || {};

      const directNPCs = await this.getLinkedNPCs(location, locationData.linkedNPCs || []);
      for (const npc of directNPCs) {
        allNpcsFromThisLocation.push({ ...npc, locationName: location.name });
      }

      const shopPromises = (locationData.linkedShops || []).map(async (shopUuid) => {
        const shop = await fromUuid(shopUuid);
        if (!shop) return [];
        const shopData = shop.getFlag("campaign-codex", "data") || {};
        const shopNPCs = await this.getLinkedNPCs(shop, shopData.linkedNPCs || []);
        return shopNPCs.map((npc) => ({ ...npc, locationName: location.name, shopName: shop.name }));
      });

      const shopResults = await Promise.allSettled(shopPromises);
      for (const result of shopResults) {
        if (result.status === "fulfilled") {
          allNpcsFromThisLocation.push(...result.value);
        }
      }

      return allNpcsFromThisLocation;
    });

    const allResults = await Promise.allSettled(locationPromises);

    const npcMap = new Map();
    for (const result of allResults) {
      if (result.status === "fulfilled") {
        const npcsFromOneLocation = result.value;
        for (const npc of npcsFromOneLocation) {
          if (!npcMap.has(npc.id)) {
            npcMap.set(npc.id, {
              ...npc,
              locations: [npc.locationName],
              shops: npc.shopName ? [npc.shopName] : [],
            });
          } else {
            const existingNpc = npcMap.get(npc.id);
            if (!existingNpc.locations.includes(npc.locationName)) {
              existingNpc.locations.push(npc.locationName);
            }
            if (npc.shopName && !existingNpc.shops.includes(npc.shopName)) {
              existingNpc.shops.push(npc.shopName);
            }
          }
        }
      } else {
        console.error("Campaign Codex | Error processing a location for NPC aggregation:", result.reason);
      }
    }

    return Array.from(npcMap.values());
  }

  // =========================================================================
  // Shop & Inventory Data
  // =========================================================================

  /**
   * Fetches and processes a list of linked shops.
   * @param {Document} document The document context for cleaning references.
   * @param {string[]} shopUuids Array of shop UUIDs.
   * @returns {Promise<Array<object>>}
   */
  static async getLinkedShops(document, shopUuids) {
    if (!shopUuids || !Array.isArray(shopUuids)) return [];
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const shopPromises = shopUuids.map(async (uuid) => {
      const journal = await fromUuid(uuid);
      if (!journal) {
        throw new Error(`Shop journal not found: ${uuid}`);
      }

      const shopData = journal.getFlag("campaign-codex", "data") || {};
      const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "shop");
      const shopIcon = shopData.isLoot ? `<i class="fas fa-gem"></i>` : `<i class="fas fa-boxes"></i>`;

      const [linkedTagsShop, canView] = await Promise.all([this.getTaggedNPCs(shopData.linkedNPCs), CampaignCodexBaseSheet.canUserView(journal.uuid)]);

      return {
        id: journal.id,
        uuid: journal.uuid,
        name: journal.name,
        img: imageData,
        tags: (linkedTagsShop || [])
          .filter((tag) => !hideByPermission || tag.canView)
          .map((tag) => tag.name)
          .sort(),
        meta: `<span>${shopData.hideInventory ? "" : shopIcon}</span>`,
        canView: canView,
        permission: journal.permission,
      };
    });

    const results = await Promise.allSettled(shopPromises);

    const shops = [];
    const brokenShopUuids = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        shops.push(result.value);
      } else {
        const failedUuid = shopUuids[index];
        brokenShopUuids.push(failedUuid);
        console.error(`Campaign Codex | Error processing shop ${failedUuid}:`, result.reason);
      }
    });

    if (brokenShopUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenShopUuids, "linkedShops");
      delete document._skipRelationshipUpdates;
    }

    return shops;
  }

  /**
   * Fetches linked shops and adds their parent location name to the metadata.
   * @param {Document} document The document context for cleaning references.
   * @param {string[]} shopUuids Array of shop UUIDs.
   * @returns {Promise<Array<object>>}
   */
  static async getLinkedShopsWithLocation(document, shopUuids) {
    if (!shopUuids || !Array.isArray(shopUuids)) return [];
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const shopPromises = shopUuids.map(async (uuid) => {
      const journal = await fromUuid(uuid);
      if (!journal) {
        throw new Error(`Shop journal not found: ${uuid}`);
      }

      const shopData = journal.getFlag("campaign-codex", "data") || {};
      const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "shop");
      const shopIcon = shopData.isLoot ? `<i class="fas fa-gem"></i>` : `<i class="fas fa-boxes"></i>`;

      const [location, linkedTags, canView] = await Promise.all([
        shopData.linkedLocation ? fromUuid(shopData.linkedLocation) : Promise.resolve(null),
        this.getTaggedNPCs(shopData.linkedNPCs),
        CampaignCodexBaseSheet.canUserView(journal.uuid),
      ]);

      return {
        id: journal.id,
        uuid: journal.uuid,
        name: journal.name,
        tags: (linkedTags || [])
          .filter((tag) => !hideByPermission || tag.canView)
          .map((tag) => tag.name)
          .sort(),
        canView: canView,
        permission: journal.permission,
        locations: location ? [location.name] : [],
        img: imageData,
        meta: `<span>${shopData.hideInventory ? "" : shopIcon}</span>`,
      };
    });

    const results = await Promise.allSettled(shopPromises);

    const shops = [];
    const brokenShopUuids = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        shops.push(result.value);
      } else {
        const failedUuid = shopUuids[index];
        brokenShopUuids.push(failedUuid);
        console.error(`Campaign Codex | Error processing shop ${failedUuid}:`, result.reason);
      }
    });

    if (brokenShopUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenShopUuids, "linkedShops");
      delete document._skipRelationshipUpdates;
    }

    return shops;
  }

  /**
   * Gathers all unique shops from a list of locations.
   * @param {string[]} locationUuids Array of location UUIDs to scan.
   * @returns {Promise<Array<object>>}
   */
  static async getAllShops(locationUuids) {
    if (!locationUuids || !Array.isArray(locationUuids)) return [];

    const locationPromises = locationUuids.map(async (locationUuid) => {
      try {
        const location = await fromUuid(locationUuid);
        if (!location) {
          console.warn(`Campaign Codex | Location not found for shop aggregation: ${locationUuid}`);
          return [];
        }

        const locationData = location.getFlag("campaign-codex", "data") || {};
        const shops = await this.getLinkedShops(location, locationData.linkedShops || []);

        const enrichedShops = await Promise.all(
          shops.map(async (shop) => {
            const shopJournal = await fromUuid(shop.uuid);
            if (!shopJournal) return null;

            const shopData = shopJournal.getFlag("campaign-codex", "data") || {};
            const inventoryCount = (shopData.inventory || []).length;
            const shopIcon = shopData.isLoot ? `<i class="fas fa-gem"></i>` : `<i class="fas fa-boxes"></i>`;

            return {
              ...shop,
              locations: [location.name],
              meta: `${shopData.hideInventory ? "<span></span>" : `${shopIcon} <span class="entity-stat">${inventoryCount} Items</span>`}`,
            };
          }),
        );

        return enrichedShops.filter(Boolean);
      } catch (error) {
        console.error(`Campaign Codex | Error processing location ${locationUuid} for shop aggregation:`, error);
        return [];
      }
    });

    const results = await Promise.all(locationPromises);
    const allShops = results.flat();

    const shopMap = new Map();
    for (const shop of allShops) {
      if (!shopMap.has(shop.id)) {
        shopMap.set(shop.id, shop);
      } else {
        const existingShop = shopMap.get(shop.id);
        const newLocationName = shop.locations[0];
        if (!existingShop.locations.includes(newLocationName)) {
          existingShop.locations.push(newLocationName);
        }
      }
    }

    return Array.from(shopMap.values());
  }

  /**
   * Fetches and processes all items in an inventory list.
   * @param {Document} document The document containing the inventory.
   * @param {Array<object>} inventoryData The raw inventory data from flags.
   * @returns {Promise<Array<object>>}
   */
  static async getInventory(document, inventoryData) {
    if (!inventoryData || !Array.isArray(inventoryData)) return [];
    const roundFinalPrice = game.settings.get("campaign-codex", "roundFinalPrice");

    const systemId = game.system.id;
    const { pricePath, denominationPath, currency: defaultCurrency } = this._getSystemSettings(systemId);
    const denominationOverride = game.settings.get("campaign-codex", "itemDenominationOverride");
    const finalCurrency = denominationOverride || defaultCurrency;
    const markup = document.getFlag("campaign-codex", "data.markup") || 1.0;

    const itemPromises = inventoryData.map(async (itemData) => {
      const [item, canView] = await Promise.all([fromUuid(itemData.itemUuid), CampaignCodexBaseSheet.canUserView(itemData.itemUuid)]);

      if (!item) {
        throw new Error(`Inventory item not found: ${itemData.itemUuid}`);
      }

      const rawPrice = this.getValue(item, pricePath) || 0;
      let basePrice = parseFloat(String(rawPrice).replace(/[^\d.]/g, "")) || 0;
      let currency = "gp"; // Fallback

      if (finalCurrency) {
        currency = finalCurrency;
      } else if (denominationPath) {
        currency = this.getValue(item, denominationPath) || "gp";
      }


    if (systemId === "pf2e") {
      const pf2ePrice = this.getValue(item, "system.price.value");
      if (pf2ePrice) {
        const pp = pf2ePrice.pp || 0;
        const gp = pf2ePrice.gp || 0;
        const sp = pf2ePrice.sp || 0;
        const cp = pf2ePrice.cp || 0;
        if (pp > 0) {
          const totalPrice = pp + (gp / 10) + (sp / 100) + (cp / 1000);
          basePrice = parseFloat(totalPrice.toFixed(3)); // Format to 3 decimal places
          currency = "pp";
        } else if (gp > 0) {
          const totalPrice = gp + (sp / 10) + (cp / 100);
          basePrice = parseFloat(totalPrice.toFixed(2)); // Format to 2 decimal places
          currency = "gp";
        } else if (sp > 0) {
          const totalPrice = sp + (cp / 10);
          basePrice = parseFloat(totalPrice.toFixed(1)); // Format to 1 decimal place
          currency = "sp";
        } else {
          basePrice = cp;
          currency = "cp";
        }
      }
    }
    
    if (systemId === "shadowdark") {
      const sdPrice = this.getValue(item, "system.cost");

      if (sdPrice) {
        const gp = sdPrice.gp || 0;
        const sp = sdPrice.sp || 0;
        const cp = sdPrice.cp || 0;

        if (gp > 0) {
          const totalPrice = gp + (sp / 10) + (cp / 100);
          basePrice = parseFloat(totalPrice.toFixed(2));
          currency = "gp";
        } else if (sp > 0) {
          const totalPrice = sp + (cp / 10);
          basePrice = parseFloat(totalPrice.toFixed(1));
          currency = "sp";
        } else {
          basePrice = cp;
          currency = "cp";
        }
      }
    }
      console.log(basePrice);
      const finalPrice = roundFinalPrice ? itemData.customPrice ?? Math.round(basePrice * markup) : Math.round((basePrice * markup)*100)/100 ;

      return {
        permission: item.permission,
        canView: canView,
        itemId: item.id,
        itemUuid: item.uuid,
        uuid: item.uuid,
        name: item.name,
        img: item.img,
        basePrice: basePrice,
        finalPrice: finalPrice,
        currency: currency,
        quantity: itemData.quantity === undefined ? 1 : itemData.quantity,
        weight: null,
      };
    });

    const results = await Promise.allSettled(itemPromises);

    const inventory = [];
    const brokenItemUuids = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        inventory.push(result.value);
      } else {
        brokenItemUuids.push(inventoryData[index].itemUuid);
        console.error(`Campaign Codex | Error processing inventory item:`, result.reason);
      }
    });

    if (brokenItemUuids.length > 0) {
      try {
        const currentData = document.getFlag("campaign-codex", "data") || {};
        const currentInventory = currentData.inventory || [];
        const cleanedInventory = currentInventory.filter((item) => !brokenItemUuids.includes(item.itemUuid));

        if (cleanedInventory.length !== currentInventory.length) {
          currentData.inventory = cleanedInventory;
          await document.setFlag("campaign-codex", "data", currentData);
          const removedCount = currentInventory.length - cleanedInventory.length;
          ui.notifications.warn(`Removed ${removedCount} broken inventory items from ${document.name}`);
        }
      } catch (error) {
        console.error(`Campaign Codex | Error cleaning broken inventory items:`, error);
      }
    }

    return inventory;
  }

  // =========================================================================
  // Internal Helpers
  // =========================================================================
  /**
   * A simple, non-recursive function to get the names of linked locations.
   * @param {string[]} ccUuids Array of Campaign Codex Journal UUIDs.
   * @param (boolean} removeTags Removes tagMode docs if they exist
   * @returns {Promise<string[]>} A promise that resolves to an array of location names.
   */

  static async getNameFromUuids(ccUuids, removeTags = false) {
    if (!ccUuids || !Array.isArray(ccUuids)) return [];

    const namePromises = ccUuids.map(async (uuid) => {
      try {
        const doc = await fromUuid(uuid);
        if (!doc) return null;
        // PERMISSION CHECK
        const canView = game.user.isGM || doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
        if (!canView) {
          return null;
        }
        if (removeTags) {
          const docData = doc.getFlag("campaign-codex", "data") || {};
          if (docData.tagMode === true) {
            return null;
          }
        }

        return doc.name;
      } catch (e) {
        return null;
      }
    });

    const names = await Promise.all(namePromises);
    return names.filter(Boolean);
  }

  /**
   * Gets the appropriate item price and currency paths for the current game system.
   * @param {string} systemId The ID of the current game system.
   * @returns {object}
   * @private
   */
  static _getSystemSettings(systemId) {
    // Check for custom overrides from settings.
    const customPricePath = game.settings.get("campaign-codex", "itemPricePath");
    const customDenominationPath = game.settings.get("campaign-codex", "itemDenominationPath");
    const denominationOverride = game.settings.get("campaign-codex", "itemDenominationOverride");

    if (customPricePath && customPricePath !== "system.price.value") {
      return {
        pricePath: customPricePath,
        denominationPath: customDenominationPath,
        currency: denominationOverride || (customDenominationPath ? null : "gp"),
      };
    }

    switch (systemId) {
      case "dnd5e":
        return {
          pricePath: "system.price.value",
          denominationPath: "system.price.denomination",
          currency: null,
        };
      case "pf2e":
        return {
          pricePath: "system.price.value",
          denominationPath: null,
          currency: "gp",
        };
      case "sfrpg":
        return {
          pricePath: "system.price",
          denominationPath: null,
          currency: "c",
        };
      case "swade":
        return {
          pricePath: "system.price",
          denominationPath: null,
          currency: "c",
        };
      case "pf1":
        return {
          pricePath: "system.price",
          denominationPath: null,
          currency: "gp",
        };
      case "ose":
        return {
          pricePath: "system.cost",
          denominationPath: null,
          currency: "gp",
        };
      case "daggerheart":
        return {
          pricePath: "system.cost",
          denominationPath: null,
          currency: "handfuls",
        };
      default:
        return {
          pricePath: "system.price.value",
          denominationPath: "system.price.denomination",
          currency: null,
        };
    }
  }
}
