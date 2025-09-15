import { TemplateComponents } from "./template-components.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { localize, format } from "../helper.js";

export class GroupLinkers {
  
  /**
   * Finds any "Tag" NPCs from the tag tree that are not already present in the main NPC list,
   * and formats them for display.
   * @param {Array<object>} treeTagNodes - The output from `buildTagTree`.
   * @param {Array<object>} existingNpcs - The array of `allNPCs` to check against for duplicates.
   * @returns {Promise<Array<object>>} A promise that resolves to an array of formatted "Tag" NPC objects.
   */
  static async formatMissingTags(treeTagNodes, existingNpcs) {
    const existingNpcUuids = new Set(existingNpcs.map(npc => npc.uuid));
    const missingTags = treeTagNodes.filter(
      tagNode => !existingNpcUuids.has(tagNode.uuid)
    );

    if (missingTags.length === 0) return [];
    const promises = missingTags.map(async (tagNode) => {
      const doc = await fromUuid(tagNode.uuid);
      if (doc) {
        return this._createNPCInfo(doc, null, null);
      }
      return null;
    });

    const formattedTags = (await Promise.all(promises)).filter(Boolean);
    return formattedTags;
  }

  /**
   * Builds a structured tree of tagged NPCs and their connections from the pre-processed nestedData.
   * @param {object} nestedData The fully processed data object from GroupLinkers.getNestedData.
   * @returns {Promise<Array<object>>} A promise that resolves to an array of tagged NPC objects with their connections.
   */
  static async buildTagTree(nestedData) {
  const validUuids = new Set([...nestedData.allGroups, ...nestedData.allRegions, ...nestedData.allLocations, ...nestedData.allShops, ...nestedData.allNPCs].map((e) => e.uuid));

  const rootTagMap = new Map();
  const allNpcUuids = new Set(nestedData.allNPCs.map(npc => npc.uuid));

  const tagGatheringPromises = nestedData.allNPCs.map(async (npc) => {
    if (npc.tag === true) {
      rootTagMap.set(npc.uuid, npc);
    }
    
    if (npc.tags.length > 0) {


      const doc = await fromUuid(npc.uuid);
      const docData = doc.getFlag("campaign-codex", "data") || {};
      const associates = await CampaignCodexLinkers.getAssociates(doc, docData.associates || []);
  
      associates.forEach(assoc => {
        if (assoc.tag === true) {
          rootTagMap.set(assoc.uuid, assoc);
        }
      });
    }
  });
  
  await Promise.all(tagGatheringPromises);

  const rootTags = [...rootTagMap.values()];


    const tagPromises = rootTags.map(async (taggedNpc) => {
      const doc = await fromUuid(taggedNpc.uuid);
      const docData = doc.getFlag("campaign-codex", "data") || {};
      const associates = await CampaignCodexLinkers.getAssociates(doc, docData.associates || []);
      const locations = nestedData.allLocations.filter((loc) => taggedNpc.locations.includes(loc.name));
      const regions = nestedData.allRegions.filter((loc) => taggedNpc.locations.includes(loc.name));
      const shops = nestedData.allShops.filter((shop) => taggedNpc.shops.includes(shop.name));
      const formatAndFilter = (entities) => {
        return entities
          .filter((entity) => validUuids.has(entity.uuid))
          .map((entity) => ({
            uuid: entity.uuid,
            type: entity.tag ? "tag" : entity.type,
            name: entity.name,
            canView: entity?.canView,
            tag: entity.tag || false,
          }));
      };

      return {
        uuid: taggedNpc.uuid,
        type: taggedNpc.type,
        tag: taggedNpc.tag,
        name: taggedNpc.name,
        canView: taggedNpc.canView,
        associates: formatAndFilter(associates),
        locations: formatAndFilter(locations),
        regions: formatAndFilter(regions),
        shops: formatAndFilter(shops),
      };
    });

    return Promise.all(tagPromises);
  }

/**
 * Processes an array of journal UUIDs into structured objects.
 * @param {string[]} journalUuids - An array of UUIDs for Journal Entries or Pages.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of processed journal objects.
 */
static async processJournalLinks(journalUuids) {
    // Return an empty array if there's no input
    if (!journalUuids || !Array.isArray(journalUuids) || journalUuids.length === 0) {
        return [];
    }

    // Process each UUID in parallel
    const journalPromises = journalUuids.map(async (uuid) => {
        try {
            const document = await fromUuid(uuid);
            if (!document) {
                console.warn(`Campaign Codex | Linked journal not found: ${uuid}`);
                return null;
            }

            let journal;
            let displayName;

            if (document instanceof JournalEntryPage) {
                journal = document.parent;
                displayName = `${journal.name}: ${document.name}`;
            } else {
                journal = document; // Assume it's a Journal Entry
                displayName = journal.name;
            }

            if (journal) {
                const canView = await CampaignCodexBaseSheet.canUserView(document.uuid);
            
                if (canView) {
                    return {
                        uuid: document.uuid,
                        name: displayName,
                        img: journal.img || "icons/svg/book.svg",
                        canView: true,
                    };
                }
            }
            return null;
        } catch (error) {
            console.warn(`Campaign Codex | Error processing linked journal ${uuid}:`, error);
            return null;
        }
    });

    const resolvedJournals = await Promise.all(journalPromises);
    
    // Filter out any nulls from failed lookups or permission checks
    return resolvedJournals.filter(j => j !== null);
}

  static async getGroupMembers(memberUuids) {
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    if (!memberUuids) return [];

    const memberPromises = memberUuids.map(async (uuid) => {
      try {
        const doc = await fromUuid(uuid);
        if (!doc) return null;
        const memberData = doc.getFlag("campaign-codex", "data") || {};

        const [linkedTags, canView] = await Promise.all([
          CampaignCodexLinkers.getTaggedNPCs(memberData.linkedNPCs || memberData.associates || []),
          CampaignCodexBaseSheet.canUserView(doc.uuid),
        ]);

        const filteredTags = (linkedTags || [])
          .filter((tag) => !hideByPermission || tag.canView)
          .map((tag) => tag.name)
          .sort();
        const type = doc.getFlag?.("campaign-codex", "type") || "unknown";

        return {
          uuid: doc.uuid,
          canView: canView,
          tags: filteredTags,
          name: doc.name,
          img: doc.getFlag?.("campaign-codex", "image") || doc.img,
          type,
          tag: doc.getFlag?.("campaign-codex", "data")?.tagMode || false,
        };
      } catch (error) {
        console.error(`Error processing group member ${uuid}:`, error);
        return null;
      }
    });

    const members = await Promise.all(memberPromises);

    return members.filter(Boolean);
  }

  static async getNestedData(groupMembers) {
    const nestedData = {
      allGroups: [],
      allRegions: [],
      allLocations: [],
      allShops: [],
      allNPCs: [],
      allItems: [],
      membersByGroup: {},
      npcsByRegion: {},
      locationsByRegion: {},
      shopsByRegion: {},
      shopsByLocation: {},
      npcsByLocation: {},
      npcsByShop: {},
      itemsByShop: {},
      totalValue: 0,
    };
    const processedUuids = new Set();
    for (const member of groupMembers) {
      await this._processEntity(member, nestedData, processedUuids);
    }
    return nestedData;
  }

  static async _processEntity(entity, nestedData, processedUuids, parent = null, locationContext = null) {
    if (!entity || !entity.type || (processedUuids.has(entity.uuid) && entity.type !== "npc")) return;
    processedUuids.add(entity.uuid);

    let newLocationContext = locationContext;
    if (entity.type === "location" || entity.type === "region") {
      newLocationContext = entity;
    }
    switch (entity.type) {
      case "group":
        await this._processGroup(entity, nestedData, processedUuids);
        break;
      case "region":
        await this._processRegion(entity, nestedData, processedUuids, newLocationContext);
        break;
      case "location":
        await this._processLocation(entity, nestedData, processedUuids, parent, newLocationContext);
        break;
      case "shop":
        await this._processShop(entity, nestedData, processedUuids, parent, newLocationContext);
        break;
      case "npc":
        await this._processNPC(entity, nestedData, parent, newLocationContext);
        break;
    }
  }

  static async _processGroup(group, nestedData, processedUuids) {
    const groupDoc = await fromUuid(group.uuid);
    if (!groupDoc) return;

    if (!nestedData.allGroups.some((g) => g.uuid === group.uuid)) {
      group.canView = await CampaignCodexBaseSheet.canUserView(groupDoc.uuid);
      nestedData.allGroups.push(group);
    }

    const groupData = groupDoc.getFlag("campaign-codex", "data") || {};
    const members = await this.getGroupMembers(groupData.members);
    nestedData.membersByGroup[group.uuid] = members;

    for (const member of members) {
      await this._processEntity(member, nestedData, processedUuids, group);
    }
  }

  static async _processRegion(region, nestedData, processedUuids, locationContext) {
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");

    const regionDoc = await fromUuid(region.uuid).catch(() => null);
    if (!regionDoc) return;
    const regionData = regionDoc.getFlag("campaign-codex", "data") || {};

    if (!nestedData.allRegions.some((r) => r.uuid === region.uuid)) {
      await this._enrichEntity(region, regionDoc);
      nestedData.allRegions.push(region);
    }
    const childTypes = { locations: "location", shops: "shop", npcs: "npc" };
    const childLinks = { locations: regionData.linkedLocations, shops: regionData.linkedShops, npcs: regionData.linkedNPCs };

    for (const [key, type] of Object.entries(childTypes)) {
      const listKey = `${key}ByRegion`;

      const childPromises = (childLinks[key] || []).map(async (uuid) => {
        const doc = await fromUuid(uuid).catch(() => null);
        if (!doc) return null;
        const childData = doc.getFlag("campaign-codex", "data") || {};
        const [linkedTags, canView] = await Promise.all([
          CampaignCodexLinkers.getTaggedNPCs(childData.linkedNPCs || childData.associates || []),
          CampaignCodexBaseSheet.canUserView(doc.uuid),
        ]);

        const filteredTags = (linkedTags || [])
          .filter((tag) => !hideByPermission || tag.canView)
          .map((tag) => tag.name)
          .sort();

        return {
          uuid: doc.uuid,
          name: doc.name,
          img: doc.getFlag("campaign-codex", "image") || doc.img,
          type,
          tags: filteredTags,
          tag: doc.getFlag("campaign-codex", "data")?.tagMode,
          canView: canView,
        };
      });

      const processedInfos = (await Promise.all(childPromises)).filter(Boolean);

      nestedData[listKey][region.uuid] = processedInfos;

      for (const info of processedInfos) {
        await this._processEntity(info, nestedData, processedUuids, region, type === "location" ? info : locationContext);
      }
    }
  }

  static async _processLocation(location, nestedData, processedUuids, parent, locationContext) {
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const locationDoc = await fromUuid(location.uuid).catch(() => null);
    if (!locationDoc) return;
    const locationData = locationDoc.getFlag("campaign-codex", "data") || {};

    if (!nestedData.allLocations.some((l) => l.uuid === location.uuid)) {
      await this._enrichEntity(location, locationDoc);
      nestedData.allLocations.push(location);
    }
    const childTypes = { shops: "shop", npcs: "npc" };
    const childLinks = { shops: locationData.linkedShops, npcs: locationData.linkedNPCs };

    for (const [key, type] of Object.entries(childTypes)) {
      const listKey = `${key}ByLocation`;

      const childPromises = (childLinks[key] || []).map(async (uuid) => {
        try {
          const doc = await fromUuid(uuid);
          if (!doc) return null;

          const childData = doc.getFlag("campaign-codex", "data") || {};
          const [linkedTags, canView] = await Promise.all([
            CampaignCodexLinkers.getTaggedNPCs(childData.linkedNPCs || childData.associates || []),
            CampaignCodexBaseSheet.canUserView(doc.uuid),
          ]);

          const filteredTags = (linkedTags || [])
            .filter((tag) => !hideByPermission || tag.canView)
            .map((tag) => tag.name)
            .sort();

          return {
            uuid: doc.uuid,
            name: doc.name,
            img: doc.getFlag("campaign-codex", "image") || doc.img,
            type,
            tags: filteredTags,
            tag: doc.getFlag("campaign-codex", "data")?.tagMode,
            canView: canView,
          };
        } catch (error) {
          console.error(`Campaign Codex | Error processing child entity ${uuid}:`, error);
          return null;
        }
      });

      const processedInfos = (await Promise.all(childPromises)).filter(Boolean);

      nestedData[listKey][location.uuid] = processedInfos;

      for (const info of processedInfos) {
        await this._processEntity(info, nestedData, processedUuids, location, locationContext);
      }
    }
  }

  static async _processShop(shop, nestedData, processedUuids, parent, locationContext) {
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const shopDoc = await fromUuid(shop.uuid);
    if (!shopDoc) return;
    const shopData = shopDoc.getFlag("campaign-codex", "data") || {};

    if (!nestedData.allShops.some((s) => s.uuid === shop.uuid)) {
      const [linkedTags, canView] = await Promise.all([CampaignCodexLinkers.getTaggedNPCs(shopData.linkedNPCs) || [], CampaignCodexBaseSheet.canUserView(shopDoc.uuid)]);
      shop.tags = linkedTags
        .filter((tag) => !hideByPermission || tag.canView)
        .map((tag) => tag.name)
        .sort();
      shop.canView = canView;
      nestedData.allShops.push(shop);
    }

    const npcDocs = await Promise.all((shopData.linkedNPCs || []).map((npcUuid) => fromUuid(npcUuid).catch(() => null)));

    nestedData.npcsByShop[shop.uuid] = [];

    const npcInfoPromises = npcDocs.map(async (npcDoc) => {
      if (!npcDoc) return null;

      const [npcCanView, rawTags] = await Promise.all([
        CampaignCodexBaseSheet.canUserView(npcDoc.uuid),
        CampaignCodexLinkers.getTaggedNPCs(npcDoc.getFlag("campaign-codex", "data")?.associates || []),
      ]);

      const npcData = npcDoc.getFlag("campaign-codex", "data");
      const npcTags = (rawTags || [])
        .filter((tag) => !hideByPermission || tag.canView)
        .map((tag) => tag.name)
        .sort();

      return {
        uuid: npcDoc.uuid,
        name: npcDoc.name,
        img: npcDoc.getFlag("campaign-codex", "image") || npcDoc.img,
        type: "npc",
        tags: npcTags,
        tag: npcData?.tagMode,
        canView: npcCanView,
      };
    });

    const processedNpcInfos = (await Promise.all(npcInfoPromises)).filter(Boolean);

    nestedData.npcsByShop[shop.uuid].push(...processedNpcInfos);
    for (const npcInfo of processedNpcInfos) {
      await this._processEntity(npcInfo, nestedData, processedUuids, shop, locationContext);
    }

    const inventoryWithoutPerms = await CampaignCodexLinkers.getInventory(shopDoc, shopData.inventory || []);

    const processedInventory = await Promise.all(
      inventoryWithoutPerms.map(async (item) => {
        const canView = await CampaignCodexBaseSheet.canUserView(item.uuid || item.itemUuid);
        return { ...item, canView, type: "item" };
      }),
    );

    nestedData.itemsByShop[shop.uuid] = [];
    for (const itemInfo of processedInventory) {
      nestedData.itemsByShop[shop.uuid].push(itemInfo);
      if (!nestedData.allItems.some((i) => i.uuid === itemInfo.uuid && i.shopSource === shop.uuid)) {
        nestedData.allItems.push({ ...itemInfo, shopSource: shop.uuid });
        nestedData.totalValue += itemInfo.finalPrice * itemInfo.quantity;
      }
    }
  }

  static async _processNPC(npc, nestedData, parent, locationContext) {
    const npcDoc = await fromUuid(npc.uuid).catch(() => null);
    if (!npcDoc) return;

    const npcInfo = await this._createNPCInfo(npcDoc, parent, locationContext);

    if (!nestedData.allNPCs.find((n) => n.uuid === npcInfo.uuid)) {
      nestedData.allNPCs.push(npcInfo);
    }

    if (parent?.type === "location") {
      if (!nestedData.npcsByLocation[parent.uuid]) nestedData.npcsByLocation[parent.uuid] = [];
      if (!nestedData.npcsByLocation[parent.uuid].find((n) => n.uuid === npcInfo.uuid)) {
        nestedData.npcsByLocation[parent.uuid].push(npcInfo);
      }
    } else if (parent?.type === "shop") {
      if (!nestedData.npcsByShop[parent.uuid]) nestedData.npcsByShop[parent.uuid] = [];
      if (!nestedData.npcsByShop[parent.uuid].find((n) => n.uuid === npcInfo.uuid)) {
        nestedData.npcsByShop[parent.uuid].push(npcInfo);
      }
    } else if (parent?.type === "region") {
      if (!nestedData.npcsByRegion[parent.uuid]) nestedData.npcsByRegion[parent.uuid] = [];
      if (!nestedData.npcsByRegion[parent.uuid].find((n) => n.uuid === npcInfo.uuid)) {
        nestedData.npcsByRegion[parent.uuid].push(npcInfo);
      }
    }
  }

  static async _createNPCInfo(npcDoc, parent, locationContext) {
    const npcData = npcDoc.getFlag("campaign-codex", "data") || {};
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const sourceType = parent?.type || "direct";
    let sourceLocationName = null;
    let sourceShopName = null;

    if (sourceType === "shop") {
      sourceShopName = parent.name;
      if (locationContext) {
        sourceLocationName = locationContext.name;
      }
    } else if (sourceType === "location") {
      sourceLocationName = parent.name;
    }

    const [linkedTags, actor, allLocations, linkedShops, canView] = await Promise.all([
      CampaignCodexLinkers.getTaggedNPCs(npcData.associates) || [],
      npcData.linkedActor ? fromUuid(npcData.linkedActor) : null,
      CampaignCodexLinkers.getNameFromUuids(npcData.linkedLocations || []),
      CampaignCodexLinkers.getNameFromUuids(npcData.linkedShops || []),
      CampaignCodexBaseSheet.canUserView(npcDoc.uuid),
    ]);
    const imageData = npcDoc.getFlag("campaign-codex", "image") || actor?.img || TemplateComponents.getAsset("image", "npc");

    return {
      uuid: npcDoc.uuid,
      name: npcDoc.name,
      img: imageData,
      type: "npc",
      tags: linkedTags
        .filter((tag) => !hideByPermission || tag.canView)
        .map((tag) => tag.name)
        .sort(),
      tag: npcData.tagMode,
      source: sourceType,
      sourceLocation: sourceLocationName,
      sourceShop: sourceShopName,
      permission: npcData.permission,
      locations: allLocations.sort(),
      shops: linkedShops.sort(),
      canView: canView,
      meta: game.campaignCodex?.getActorDisplayMeta(actor, npcData.tagMode) || `<span class="entity-type">${localize("names.npc")}</span>`,
      actor: actor ? { uuid: actor.uuid, name: actor.name, type: actor.type } : null,
    };
  }

  static async _enrichEntity(entity, doc) {
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const data = doc.getFlag("campaign-codex", "data") || {};
    const [linkedTags, linkedShops, canView, region, npcs, shopNpcCount] = await Promise.all([
      CampaignCodexLinkers.getTaggedNPCs(data.linkedNPCs || data.associates || []) || [],
      CampaignCodexLinkers.getNameFromUuids(data.linkedShops || []),
      CampaignCodexBaseSheet.canUserView(doc.uuid),
      entity.type === "location" ? CampaignCodexLinkers.getLinkedRegion(doc) : Promise.resolve(null),
      entity.type === "location" || entity.type === "region" ? CampaignCodexLinkers.getNameFromUuids(data.linkedNPCs || [], true) : Promise.resolve([]),
      entity.type === "location" ? CampaignCodexLinkers.getShopNPCs(doc, data.linkedShops || []).then((npcs) => npcs.length) : Promise.resolve(0),
    ]);

    entity.canView = canView;
    entity.permission = doc.permission;
    entity.shops = linkedShops.sort();
    entity.tags = linkedTags
      .filter((tag) => !hideByPermission || tag.canView)
      .map((tag) => tag.name)
      .sort();
    entity.npcs = npcs;

    if (entity.type === "location") {
      entity.region = region?.name;
      const directNpcCount = (data.linkedNPCs || []).length;
      entity.npcCount = directNpcCount + shopNpcCount;
      entity.shopCount = (data.linkedShops || []).length;
    }
  }

  static _removeDuplicates(array) {
    return array.filter((item, index, self) => index === self.findIndex((t) => t.uuid === item.uuid));
  }
}