import { TemplateComponents } from "./template-components.js";
import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { localize } from "../helper.js";

/**
 * A static utility class for fetching, processing, and cleaning linked data
 * between different Campaign Codex documents.
 */
export class CampaignCodexLinkers {
  // =========================================================================
  // NEW: Internal cache (doesn't affect external API)
  // =========================================================================
  static _createOperationCache() {
    return {
      docs: new Map(),
      flags: new Map(),
      canView: new Map(),
      taggedNPCs: new Map(),
      names: new Map(),
    };
  }

  static async _getCachedDoc(uuid, cache) {
    if (!cache.docs.has(uuid)) {
      cache.docs.set(uuid, await fromUuid(uuid).catch(() => null));
    }
    return cache.docs.get(uuid);
  }

  static _getCachedFlags(doc, cache) {
    const key = doc.uuid;
    if (!cache.flags.has(key)) {
      cache.flags.set(key, doc.getFlag("campaign-codex", "data") || {});
    }
    return cache.flags.get(key);
  }

  static async _getCachedCanView(uuid, cache) {
    if (!cache.canView.has(uuid)) {
      cache.canView.set(uuid, CampaignCodexBaseSheet.canUserView(uuid));
    }
    return cache.canView.get(uuid);
  }

  static async _getCachedTaggedNPCs(uuids, cache) {
    const key = uuids.join(',');
    if (!cache.taggedNPCs.has(key)) {
      cache.taggedNPCs.set(key, this.getTaggedNPCs(uuids));
    }
    return cache.taggedNPCs.get(key);
  }

  // =========================================================================
  // General & Data Cleaning Utilities
  // =========================================================================

  static getValue(obj, path) {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  }

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
      // console.error(`Campaign Codex | Error clearing broken ${fieldName} references:`, error);
    }
  }

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

  static createQuickLinks(sources, uniqueKey = "id") {
    if (!sources || !Array.isArray(sources)) return [];

    const allItems = sources.flatMap((source) => {
      if (!Array.isArray(source.data)) return [];
      return source.data.map((item) => ({ ...item, type: source.type }));
    });

    const seen = new Set();
    const uniqueLinks = allItems.filter((item) => {
      const identifier = item[uniqueKey];
      if (seen.has(identifier)) return false;
      seen.add(identifier);
      return true;
    });

    if (game.user.isGM) return uniqueLinks;
    return uniqueLinks.filter((item) => {
      const permissionLevel = item.permission || 0;
      return permissionLevel >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    });
  }

  // =========================================================================
  // Actor & Character Data
  // =========================================================================

  static getLinkedActor(actorUuid) {
    if (!actorUuid) return Promise.resolve(null);
    
    const cache = this._createOperationCache();
    return this._getCachedDoc(actorUuid, cache)
      .then((actor) => {
        if (!actor) {
          console.warn(`Campaign Codex | Linked actor not found: ${actorUuid}`);
          return null;
        }
        return this._getCachedCanView(actor.uuid, cache).then((canView) => ({
          id: actor.id,
          uuid: actor.uuid,
          name: actor.name,
          img: actor.img,
          type: actor.type,
          permission: actor.permission,
          canView: canView,
        }));
      })
      .catch((error) => {
        // console.error(`Campaign Codex | Error getting linked actor ${actorUuid}:`, error);
        return null;
      });
  }

  // =========================================================================
  // Region & Location Data
  // =========================================================================

  static getLinkedRegion(locationDoc) {
    const locationData = locationDoc.getFlag("campaign-codex", "data") || {};
    const regionUuid = locationData.parentRegion;
    if (!regionUuid) return Promise.resolve(null);

    const cache = this._createOperationCache();
    return this._getCachedDoc(regionUuid, cache)
      .then((region) => {
        if (!region) {
          console.warn(`Campaign Codex | Broken parentRegion link from ${locationDoc.name}: ${regionUuid}`);
          return locationDoc.unsetFlag("campaign-codex", "data.parentRegion").then(() => {
            ui.notifications.warn(`Removed broken parent region link from ${locationDoc.name}.`);
            return null;
          });
        }
        return this._getCachedCanView(region.uuid, cache).then((canView) => ({
          id: region.id,
          uuid: region.uuid,
          name: region.name,
          permission: region.permission,
          canView: canView,
          sheetTypeLabelOverride: region.getFlag("campaign-codex", "data.sheetTypeLabelOverride") || null,
          iconOverride: region.getFlag("campaign-codex", "icon-override") || null,
          img: region.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "region"),
        }));
      })
      .catch((error) => {
        // console.error(`Campaign Codex | Error fetching linked region ${regionUuid}:`, error);
        return null;
      });
  }

  static getLinkedLocation(locationUuid) {
    if (!locationUuid) return Promise.resolve(null);
    
    const cache = this._createOperationCache();
    return this._getCachedDoc(locationUuid, cache)
      .then((journal) => {
        if (!journal) {
          console.warn(`Campaign Codex | Linked location not found: ${locationUuid}`);
          return null;
        }
        const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "location");
        const iconOverride = journal.getFlag("campaign-codex", "icon-override") || null;
        const tabOverrides = journal.getFlag("campaign-codex", "tab-overrides") || [];
        const imageAreaOverride = tabOverrides?.find(override => override.key === "imageArea");
        return this._getCachedCanView(journal.uuid, cache).then((canView) => ({
          id: journal.id,
          uuid: journal.uuid,
          name: journal.name,
          canView: canView,
          permission: journal.permission,
          img: imageData,
          showImage: imageAreaOverride?.visible ?? true,
          sheetTypeLabelOverride: journal.getFlag("campaign-codex", "data.sheetTypeLabelOverride") || null,
          iconOverride: iconOverride,
        }));
      })
      .catch((error) => {
        // console.error(`Campaign Codex | Error getting linked location ${locationUuid}:`, error);
        return null;
      });
  }

  static async getLinkedLocations(document, locationUuids) {
    if (!locationUuids || !Array.isArray(locationUuids)) return [];
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const cache = this._createOperationCache();
    
    const locationPromises = locationUuids.map(async (uuid) => {
      const journal = await this._getCachedDoc(uuid, cache);
      if (!journal) throw new Error(`Linked location not found: ${uuid}`);
      
      const locationData = this._getCachedFlags(journal, cache);
      const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "location");
      const tabOverrides = journal.getFlag("campaign-codex", "tab-overrides") || [];
      const imageAreaOverride = tabOverrides?.find(override => override.key === "imageArea");
      const [linkedTags, linkedShops, canView] = await Promise.all([
        this._getCachedTaggedNPCs(locationData.linkedNPCs || [], cache),
        this.getNameFromUuids(locationData.linkedShops || []),
        this._getCachedCanView(journal.uuid, cache),
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
        type: journal.getFlag("campaign-codex", "type"),
        showImage: imageAreaOverride?.visible ?? true,
        iconOverride: journal.getFlag("campaign-codex", "icon-override") || null,
        meta: null,
      };
    });

    const results = await Promise.allSettled(locationPromises);
    const locations = [];
    const brokenLocationUuids = [];
    
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        locations.push(result.value);
      } else {
        brokenLocationUuids.push(locationUuids[index]);
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
  
  static async getLinkedRegions(document, regionUuids) {
    if (!regionUuids || !Array.isArray(regionUuids)) return [];
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const cache = this._createOperationCache();
    
    const regionPromises = regionUuids.map(async (uuid) => {
      const journal = await this._getCachedDoc(uuid, cache);
      if (!journal) throw new Error(`Linked region not found: ${uuid}`);

      const regionData = this._getCachedFlags(journal, cache);
      const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "region");
      const tabOverrides = journal.getFlag("campaign-codex", "tab-overrides") || [];
      const imageAreaOverride = tabOverrides?.find(override => override.key === "imageArea");
      const [linkedTags, linkedShops, canView] = await Promise.all([
        this._getCachedTaggedNPCs(regionData.linkedNPCs || [], cache),
        this.getNameFromUuids(regionData.linkedShops || []),
        this._getCachedCanView(journal.uuid, cache),
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
        showImage: imageAreaOverride?.visible ?? true,
        iconOverride: journal.getFlag("campaign-codex", "icon-override") || null,
        meta: null, 
      };
    });

    const results = await Promise.allSettled(regionPromises);
    const regions = [];
    const brokenRegionUuids = [];
    
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        regions.push(result.value);
      } else {
        brokenRegionUuids.push(regionUuids[index]);
        console.warn(`Campaign Codex | ${result.reason.message}`);
      }
    });

    if (brokenRegionUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenRegionUuids, "linkedRegions");
      delete document._skipRelationshipUpdates;
    }

    return regions;
  }

  static async getAllLocations(document, directLocationUuids) {
    if (!directLocationUuids || !Array.isArray(directLocationUuids)) return [];

    const locationMap = new Map();
    const brokenLocationUuids = [];
    const brokenShopUuids = [];
    const cache = this._createOperationCache();

    const locationPromises = directLocationUuids.map((uuid) => this._processDirectLocation(uuid, locationMap, cache));
    const locationResults = await Promise.allSettled(locationPromises);

    locationResults.forEach((result, index) => {
      if (result.status === "rejected") {
        brokenLocationUuids.push(directLocationUuids[index]);
      }
    });

    if (brokenLocationUuids.length > 0 && !game.campaignCodexImporting) {
      await this._clearBrokenDocumentReferences(document, brokenLocationUuids, "linkedLocations");
    }

    const npcData = document.getFlag("campaign-codex", "data") || {};
    const npcLinkedShopUuids = npcData.linkedShops || [];

    const shopPromises = npcLinkedShopUuids.map((shopUuid) => this._processShopForLocation(shopUuid, document, locationMap, cache));
    const shopResults = await Promise.allSettled(shopPromises);

    shopResults.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value?.isBroken) {
        brokenShopUuids.push(npcLinkedShopUuids[index]);
      } else if (result.status === "rejected") {
        // console.error(`Campaign Codex | Error processing shop ${npcLinkedShopUuids[index]} for location discovery:`, result.reason);
      }
    });

    if (brokenShopUuids.length > 0 && !game.campaignCodexImporting) {
      await this._clearBrokenDocumentReferences(document, brokenShopUuids, "linkedShops");
    }

    return Array.from(locationMap.values());
  }

  static async _processDirectLocation(uuid, locationMap, cache) {
    const journal = await this._getCachedDoc(uuid, cache);
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    if (!journal) {
      console.warn(`Campaign Codex | Linked location not found: ${uuid}`);
      throw new Error("Location not found");
    }

    const typeData = journal.getFlag("campaign-codex", "type") || {};
    const npcData = this._getCachedFlags(journal, cache);
    const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "location");
    const typeIcon = typeData === "region" || typeData === "location" ? typeData : "location";
      const tabOverrides = journal.getFlag("campaign-codex", "tab-overrides") || [];
      const imageAreaOverride = tabOverrides?.find(override => override.key === "imageArea");
    const [linkedTags, linkedShops, canView] = await Promise.all([
      this._getCachedTaggedNPCs(npcData.linkedNPCs || [], cache),
      this.getNameFromUuids(npcData.linkedShops || []),
      this._getCachedCanView(journal.uuid, cache),
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
      typeData: typeData,
      showImage: imageAreaOverride?.visible ?? true,
      iconOverride: journal.getFlag("campaign-codex", "icon-override") || null,
      meta: `<i class="${journal.getFlag("campaign-codex", "icon-override") || TemplateComponents.getAsset("icon", typeIcon)}"></i>`,
    });
  }

  static async _processShopForLocation(shopUuid, document, locationMap, cache) {
    const shop = await this._getCachedDoc(shopUuid, cache);
    if (!shop) {
      console.warn(`Campaign Codex | Shop not found during location discovery: ${shopUuid}`);
      return { isBroken: true };
    }

    const shopData = this._getCachedFlags(shop, cache);
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

    const location = await this._getCachedDoc(shopLocationUuid, cache);
    if (!location) return;

    const locationData = this._getCachedFlags(location, cache);
    const locationShopUuids = locationData.linkedShops || [];
    const locationType = location.getFlag("campaign-codex", "type");
    const typeData = shop.getFlag("campaign-codex", "type") || {};
    const typeIcon = locationType === "region" || locationType === "location" ? locationType : "location";
      const tabOverrides = location.getFlag("campaign-codex", "tab-overrides") || [];
      const imageAreaOverride = location.tabOverrides?.find(override => override.key === "imageArea");
    if (!locationShopUuids.includes(shop.uuid)) return;

    if (!locationMap.has(location.id)) {
      const [linkedTagsSecondary, canView] = await Promise.all([
        this._getCachedTaggedNPCs(locationData.linkedNPCs || [], cache),
        this._getCachedCanView(location.uuid, cache),
      ]);

      locationMap.set(location.id, {
        id: location.id,
        uuid: location.uuid,
        name: location.name,
        tags: (linkedTagsSecondary || []).map((tag) => tag.name),
        img: location.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "shop"),
        iconOverride: location.getFlag("campaign-codex", "icon-override") || null,
        showImage: imageAreaOverride?.visible ?? true,
        source: "shop",
        shops: [shop.name],
        canView: canView,
        typeData: typeIcon,
        permission: location.permission,
        meta: `<i class="${location.getFlag("campaign-codex", "icon-override") || TemplateComponents.getAsset("icon", typeIcon)}"></i>`,
      });
    } else {
      const existingLocation = locationMap.get(location.id);
      if (existingLocation.source === "shop" && !existingLocation.shops.includes(shop.name)) {
        existingLocation.shops.push(shop.name);
      }
    }
  }

  static async _clearBrokenDocumentReferences(document, uuids, flag) {
    document._skipRelationshipUpdates = true;
    await this.clearBrokenReferences(document, uuids, flag);
    delete document._skipRelationshipUpdates;
  }

  // =========================================================================
  // NPC & Associate Data
  // =========================================================================

  static async getLinkedNPCs(document, npcUuids) {
    if (!npcUuids || !Array.isArray(npcUuids)) return [];
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const cache = this._createOperationCache();
    
    const npcPromises = npcUuids.map(async (uuid) => {
      const journal = await this._getCachedDoc(uuid, cache);
      if (!journal) throw new Error(`NPC journal not found: ${uuid}`);

      const npcData = this._getCachedFlags(journal, cache);
      const [actor, linkedTags, allLocations, linkedShops, canView] = await Promise.all([
        npcData.linkedActor ? this._getCachedDoc(npcData.linkedActor, cache) : null,
        this._getCachedTaggedNPCs(npcData.associates || [], cache),
        this.getNameFromUuids(npcData.linkedLocations || []),
        this.getNameFromUuids(npcData.linkedShops || []),
        this._getCachedCanView(journal.uuid, cache),
      ]);
      
      const imageData = journal.getFlag("campaign-codex", "image") || actor?.img || TemplateComponents.getAsset("image", "npc");
      const tabOverrides = journal.getFlag("campaign-codex", "tab-overrides") || [];
      const imageAreaOverride = tabOverrides?.find(override => override.key === "imageArea");
      return {
        id: journal.id,
        uuid: journal.uuid,
        name: journal.name,
        locations: allLocations.sort(),
        shops: linkedShops.sort(),
        img: imageData,
        showImage: imageAreaOverride?.visible ?? true,
        iconOverride: journal.getFlag("campaign-codex", "icon-override") || null,
        tag: npcData.tagMode,
        tags: (linkedTags || [])
          .filter((tag) => !hideByPermission || tag.canView)
          .map((tag) => tag.name)
          .sort(),
        actor: actor,
        canView: canView,
        permission: journal.permission,
        meta: game.campaignCodex?.getActorDisplayMeta(actor, npcData) || `<span class="entity-type">${localize("names.npc")}</span>`,
      };
    });

    const results = await Promise.allSettled(npcPromises);
    const npcs = [];
    const brokenNPCUuids = [];
    
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        npcs.push(result.value);
      } else {
        brokenNPCUuids.push(npcUuids[index]);
        // console.error(`Campaign Codex | Error processing NPC ${failedUuid}:`, result.reason);
      }
    });

    if (brokenNPCUuids.length > 0 && !game.campaignCodexImporting) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenNPCUuids, "linkedNPCs");
      delete document._skipRelationshipUpdates;
    }

    return npcs;
  }

  static async getDirectNPCs(document, npcUuids) {
    if (!npcUuids || !Array.isArray(npcUuids)) return [];
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const cache = this._createOperationCache();
    
    const npcPromises = npcUuids.map(async (uuid) => {
      const journal = await this._getCachedDoc(uuid, cache);
      if (!journal) throw new Error(`Direct NPC journal not found: ${uuid}`);

      const npcData = this._getCachedFlags(journal, cache);
      const [actor, linkedTags, allLocations, linkedShops, canView] = await Promise.all([
        npcData.linkedActor ? this._getCachedDoc(npcData.linkedActor, cache) : null,
        this._getCachedTaggedNPCs(npcData.associates || [], cache),
        this.getNameFromUuids(npcData.linkedLocations || []),
        this.getNameFromUuids(npcData.linkedShops || []),
        this._getCachedCanView(journal.uuid, cache),
      ]);
      const imageData = journal.getFlag("campaign-codex", "image") || actor?.img || TemplateComponents.getAsset("image", "npc");
      const tabOverrides = journal.getFlag("campaign-codex", "tab-overrides") || [];
      const imageAreaOverride = tabOverrides?.find(override => override.key === "imageArea");
      return {
        id: journal.id,
        uuid: journal.uuid,
        name: journal.name,
        img: imageData,
        showImage: imageAreaOverride?.visible ?? true,
        iconOverride: journal.getFlag("campaign-codex", "icon-override") || null,
        actor: actor,
        canView: canView,
        permission: journal.permission,
        tag: npcData.tagMode,
        tags: (linkedTags || [])
          .filter((tag) => !hideByPermission || tag.canView)
          .map((tag) => tag.name)
          .sort(),
        meta: game.campaignCodex?.getActorDisplayMeta(actor, npcData) || `<span class="entity-type">${localize("names.npc")}</span>`,
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
        brokenNPCUuids.push(npcUuids[index]);
        // console.error(`Campaign Codex | Error processing direct NPC ${failedUuid}:`, result.reason);
      }
    });

    if (brokenNPCUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenNPCUuids, "linkedNPCs");
      delete document._skipRelationshipUpdates;
    }

    return npcs;
  }

  static async getShopNPCs(document, shopUuids) {
    if (!shopUuids || !Array.isArray(shopUuids)) return [];
    const cache = this._createOperationCache();

    const shopPromises = shopUuids.map(async (shopUuid) => {
      const shop = await this._getCachedDoc(shopUuid, cache);
      if (!shop) throw new Error(`Shop not found: ${shopUuid}`);
      
      const shopData = this._getCachedFlags(shop, cache);
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
        brokenShopUuids.push(shopUuids[index]);
        // console.error(`Campaign Codex | Error processing shop ${failedUuid}:`, result.reason);
      }
    });

    if (brokenShopUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenShopUuids, "linkedShops");
      delete document._skipRelationshipUpdates;
    }

    return Array.from(npcMap.values());
  }

  static async getTaggedNPCs(npcList) {
    if (!npcList?.length) return [];
    const cache = this._createOperationCache();
    
    const tagPromises = npcList.map(async (uuid) => {
      try {
        const journal = await this._getCachedDoc(uuid, cache);
        if (!journal) return null;

        const npcData = this._getCachedFlags(journal, cache);
        if (npcData.tagMode) {
          return {
            id: journal.id,
            uuid: journal.uuid,
            name: journal.name,
            permission: journal.permission,
            meta: `<span class="entity-type" style="background: var(--cc-border);">${localize("names.tag")}</span>`,
            tag: npcData.tagMode,
            canView: await this._getCachedCanView(journal.uuid, cache),
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

  static async getAssociates(document, associateUuids) {
    if (!associateUuids || !Array.isArray(associateUuids)) return [];
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const cache = this._createOperationCache();
    
    const associatePromises = associateUuids.map(async (uuid) => {
      const journal = await this._getCachedDoc(uuid, cache);
      if (!journal) throw new Error(`Associate journal not found: ${uuid}`);

      const npcData = this._getCachedFlags(journal, cache);
      const [actor, allLocations, linkedShops, linkedTags, canView] = await Promise.all([
        npcData.linkedActor ? this._getCachedDoc(npcData.linkedActor, cache) : null,
        this.getNameFromUuids(npcData.linkedLocations || []),
        this.getNameFromUuids(npcData.linkedShops || []),
        this._getCachedTaggedNPCs(npcData.associates || [], cache),
        this._getCachedCanView(journal.uuid, cache),
      ]);

      const imageData = journal.getFlag("campaign-codex", "image") || actor?.img || TemplateComponents.getAsset("image", "npc");
      const tabOverrides = journal.getFlag("campaign-codex", "tab-overrides") || [];
      const imageAreaOverride = tabOverrides?.find(override => override.key === "imageArea");
      const filteredTags = (linkedTags || [])
        .filter((tag) => !hideByPermission || tag.canView)
        .map((tag) => tag.name)
        .sort();

      return {
        id: journal.id,
        uuid: journal.uuid,
        name: journal.name,
        img: imageData,
        showImage: imageAreaOverride?.visible ?? true,
        iconOverride: journal.getFlag("campaign-codex", "icon-override") || null,
        actor: actor,
        tag: npcData.tagMode,
        type: journal.getFlag("campaign-codex", "type") || "npc",
        tags: filteredTags,
        permission: journal.permission,
        meta: game.campaignCodex?.getActorDisplayMeta(actor, npcData) || `<span class="entity-type">${localize("names.npc")}</span>`,
        locations: allLocations.sort(),
        shops: linkedShops.sort(),
        canView: canView,
      };
    });

    const results = await Promise.allSettled(associatePromises);
    const associates = [];
    const brokenAssociateUuids = [];
    
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        associates.push(result.value);
      } else {
        brokenAssociateUuids.push(associateUuids[index]);
        // console.error(`Campaign Codex | ${result.reason.message}`);
      }
    });

    if (brokenAssociateUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenAssociateUuids, "associates");
      delete document._skipRelationshipUpdates;
    }

    return associates;
  }

  static async getAllNPCs(locationUuids) {
    if (!locationUuids || !Array.isArray(locationUuids)) return [];
    const cache = this._createOperationCache();

    const locationPromises = locationUuids.map(async (locationUuid) => {
      const location = await this._getCachedDoc(locationUuid, cache);
      if (!location) throw new Error(`Location not found for NPC aggregation: ${locationUuid}`);

      const allNpcsFromThisLocation = [];
      const locationData = this._getCachedFlags(location, cache);
      const directNPCs = await this.getLinkedNPCs(location, locationData.linkedNPCs || []);

      for (const npc of directNPCs) {
        allNpcsFromThisLocation.push({ ...npc, locationName: location.name });
      }

      const shopPromises = (locationData.linkedShops || []).map(async (shopUuid) => {
        const shop = await this._getCachedDoc(shopUuid, cache);
        if (!shop) return [];
        
        const shopData = this._getCachedFlags(shop, cache);
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
        // console.error("Campaign Codex | Error processing a location for NPC aggregation:", result.reason);
      }
    }

    return Array.from(npcMap.values());
  }

  // =========================================================================
  // Shop & Inventory Data
  // =========================================================================

  static async getLinkedShops(document, shopUuids) {
    if (!shopUuids || !Array.isArray(shopUuids)) return [];
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const cache = this._createOperationCache();
    
    const shopPromises = shopUuids.map(async (uuid) => {
      const journal = await this._getCachedDoc(uuid, cache);
      if (!journal) throw new Error(`Shop journal not found: ${uuid}`);

      const shopData = this._getCachedFlags(journal, cache);
      const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "shop");
      const shopIcon = shopData.isLoot ? `<i class="fas fa-gem"></i>` : `<i class="fas fa-boxes"></i>`;
      const tabOverrides = journal.getFlag("campaign-codex", "tab-overrides") || [];
      const imageAreaOverride = tabOverrides?.find(override => override.key === "imageArea");
      const [linkedTagsShop, canView] = await Promise.all([
        this._getCachedTaggedNPCs(shopData.linkedNPCs || [], cache),
        this._getCachedCanView(journal.uuid, cache),
      ]);

      return {
        id: journal.id,
        uuid: journal.uuid,
        name: journal.name,
        img: imageData,
        showImage: imageAreaOverride?.visible ?? true,
        iconOverride: journal.getFlag("campaign-codex", "icon-override") || null,
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
        brokenShopUuids.push(shopUuids[index]);
        // console.error(`Campaign Codex | Error processing shop ${failedUuid}:`, result.reason);
      }
    });

    if (brokenShopUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenShopUuids, "linkedShops");
      delete document._skipRelationshipUpdates;
    }

    return shops;
  }

  static async getLinkedShopsWithLocation(document, shopUuids) {
    if (!shopUuids || !Array.isArray(shopUuids)) return [];
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const cache = this._createOperationCache();
    
    const shopPromises = shopUuids.map(async (uuid) => {
      const journal = await this._getCachedDoc(uuid, cache);
      if (!journal) throw new Error(`Shop journal not found: ${uuid}`);

      const shopData = this._getCachedFlags(journal, cache);
      const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset("image", "shop");
      const shopIcon = shopData.isLoot ? `<i class="fas fa-gem"></i>` : `<i class="fas fa-boxes"></i>`;
      const tabOverrides = journal.getFlag("campaign-codex", "tab-overrides") || [];
      const imageAreaOverride = tabOverrides?.find(override => override.key === "imageArea");
      const [location, linkedTags, canView] = await Promise.all([
        shopData.linkedLocation ? this._getCachedDoc(shopData.linkedLocation, cache) : null,
        this._getCachedTaggedNPCs(shopData.linkedNPCs || [], cache),
        this._getCachedCanView(journal.uuid, cache),
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
        showImage: imageAreaOverride?.visible ?? true,
        iconOverride: journal.getFlag("campaign-codex", "icon-override") || null,
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
        brokenShopUuids.push(shopUuids[index]);
        // console.error(`Campaign Codex | Error processing shop ${failedUuid}:`, result.reason);
      }
    });

    if (brokenShopUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenShopUuids, "linkedShops");
      delete document._skipRelationshipUpdates;
    }

    return shops;
  }

  static async getAllShops(locationUuids) {
    if (!locationUuids || !Array.isArray(locationUuids)) return [];
    const cache = this._createOperationCache();

    const locationPromises = locationUuids.map(async (locationUuid) => {
      const location = await this._getCachedDoc(locationUuid, cache);
      if (!location) {
        console.warn(`Campaign Codex | Location not found for shop aggregation: ${locationUuid}`);
        return [];
      }

      const locationData = this._getCachedFlags(location, cache);
      const shops = await this.getLinkedShops(location, locationData.linkedShops || []);

      const enrichedShops = await Promise.all(
        shops.map(async (shop) => {
          const shopJournal = await this._getCachedDoc(shop.uuid, cache);
          if (!shopJournal) return null;

          const shopData = this._getCachedFlags(shopJournal, cache);
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
    });

    const results = await Promise.allSettled(locationPromises);
    const allShops = results.flatMap(result => result.status === "fulfilled" ? result.value : []);

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

  static getCurrency() {
    const systemId = game.system.id;
    const { currency: defaultCurrency } = this._getSystemSettings(systemId);
    const denominationOverride = game.settings.get("campaign-codex", "itemDenominationOverride");
    const finalCurrency = denominationOverride || defaultCurrency;
    return finalCurrency || "gp";
  }

  static async getInventory(document, inventoryData) {
    if (!inventoryData || !Array.isArray(inventoryData)) return [];
    const roundFinalPrice = game.settings.get("campaign-codex", "roundFinalPrice");
    const systemId = game.system.id;
    const { pricePath, denominationPath, currency: defaultCurrency } = this._getSystemSettings(systemId);
    const denominationOverride = game.settings.get("campaign-codex", "itemDenominationOverride");
    const finalCurrency = denominationOverride || defaultCurrency;
    const markup = document.getFlag("campaign-codex", "data.markup") || 1.0;
    const cache = this._createOperationCache();

    const itemPromises = inventoryData.map(async (itemData) => {
      const [item, canView] = await Promise.all([
        this._getCachedDoc(itemData.itemUuid, cache),
        this._getCachedCanView(itemData.itemUuid, cache),
      ]);

      if (!item) throw new Error(`Inventory item not found: ${itemData.itemUuid}`);

      const rawPrice = this.getValue(item, pricePath) || 0;
      let basePrice = parseFloat(String(rawPrice).replace(/[^\d.]/g, "")) || 0;
      let currency = "gp";

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
            basePrice = parseFloat(totalPrice.toFixed(3));
            currency = "pp";
          } else if (gp > 0) {
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
      
      const finalPrice = roundFinalPrice ? itemData.customPrice ?? Math.round(basePrice * markup) : Math.round((basePrice * markup) * 100) / 100;

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
        // console.error(`Campaign Codex | Error processing inventory item:`, result.reason);
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
        // console.error(`Campaign Codex | Error cleaning broken inventory items:`, error);
      }
    }

    return inventory;
  }

  static async getNameFromUuids(ccUuids, removeTags = false) {
    if (!ccUuids || !Array.isArray(ccUuids)) return [];
    const cache = this._createOperationCache();
    
    // NEW: Batch all doc fetches at once
    const docs = await Promise.all(ccUuids.map(uuid => this._getCachedDoc(uuid, cache)));
    
    const namePromises = docs.map(async (doc, index) => {
      try {
        if (!doc) return null;
        // PERMISSION CHECK
        const canView = game.user.isGM || doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
        if (!canView) return null;
        
        if (removeTags) {
          const docData = doc.getFlag("campaign-codex", "data") || {};
          if (docData.tagMode === true) return null;
        }

        return doc.name;
      } catch (e) {
        return null;
      }
    });

    const names = await Promise.all(namePromises);
    return names.filter(Boolean);
  }

  static _getSystemSettings(systemId) {
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

    // Original switch statement preserved exactly
    switch (systemId) {
      case "dnd5e":
        return { pricePath: "system.price.value", denominationPath: "system.price.denomination", currency: null };
      case "pf2e":
        return { pricePath: "system.price.value", denominationPath: null, currency: "gp" };
      case "sfrpg":
        return { pricePath: "system.price", denominationPath: null, currency: "c" };
      case "swade":
        return { pricePath: "system.price", denominationPath: null, currency: "c" };
      case "pf1":
        return { pricePath: "system.price", denominationPath: null, currency: "gp" };
      case "ose":
        return { pricePath: "system.cost", denominationPath: null, currency: "gp" };
      case "shadowdark":
        return { pricePath: "system.cost", denominationPath: null, currency: "gp" };
      case "daggerheart":
        return { pricePath: "system.cost", denominationPath: null, currency: "handfuls" };
      default:
        return { pricePath: "system.price.value", denominationPath: "system.price.denomination", currency: null };
    }
  }
}