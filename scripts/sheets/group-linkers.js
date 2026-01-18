import { TemplateComponents } from "./template-components.js";
import { CampaignCodexLinkers } from "./linkers.js";
import { CampaignCodexBaseSheet } from "./base-sheet.js";
import { localize } from "../helper.js";

export class GroupLinkers {
  // ===========================================================================
  // Internal cache
  // ===========================================================================
  static _createOperationCache() {
    return {
      docs: new Map(),
      flags: new Map(),
      canView: new Map(),
      taggedNPCs: new Map(),
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
    if (!cache?.flags.has(key)) {
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
      cache.taggedNPCs.set(key, CampaignCodexLinkers.getTaggedNPCs(uuids));
    }
    return cache.taggedNPCs.get(key);
  }

  // ===========================================================================
  // ORIGINAL METHODS
  // ===========================================================================

  static async formatMissingTags(treeTagNodes, existingNpcs) {
    const existingNpcUuids = new Set(existingNpcs.map(npc => npc.uuid));
    const missingTags = treeTagNodes.filter(
      tagNode => !existingNpcUuids.has(tagNode.uuid)
    );

    if (missingTags.length === 0) return [];
    
    const cache = this._createOperationCache();
    const promises = missingTags.map(async (tagNode) => {
      const doc = await this._getCachedDoc(tagNode.uuid, cache);
      if (doc) {
        return this._createNPCInfo(doc, null, null, null, cache);
      }
      return null;
    });

    const formattedTags = (await Promise.all(promises)).filter(Boolean);
    return formattedTags;
  }

static async buildTagTree(nestedData) {
    const cache = this._createOperationCache();
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");

    const validUuids = new Set([...nestedData.allGroups, ...nestedData.allRegions, ...nestedData.allLocations, ...nestedData.allShops, ...nestedData.allNPCs].map((e) => e.uuid));

    const rootTagMap = new Map();

    const npcDocs = await Promise.all(
      nestedData.allNPCs.map(npc => this._getCachedDoc(npc.uuid, cache))
    );

    const tagGatheringPromises = nestedData.allNPCs.map(async (npc, index) => {
      const doc = npcDocs[index];
      if (!doc) return;

      if (npc.tag === true) {
        rootTagMap.set(npc.uuid, npc);
      }
      
      if (npc.tags.length > 0) {
        const flags = this._getCachedFlags(doc, cache);
        const associates = await CampaignCodexLinkers.getAssociates(doc, flags.associates || []);
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
      const doc = await this._getCachedDoc(taggedNpc.uuid, cache);
      const flags = doc ? this._getCachedFlags(doc, cache) : {};
      
      const associates = doc ? await CampaignCodexLinkers.getAssociates(doc, flags.associates || []) : [];
      
      // Start with the Tag's own links
      const allLocationUuids = new Set(flags.linkedLocations || []);
      const allShopUuids = new Set(flags.linkedShops || []);
      const allGroupUuids = new Set(flags.linkedGroups || []);


      const locations = nestedData.allLocations.filter((loc) => allLocationUuids.has(loc.uuid));
      const regions = nestedData.allRegions.filter((reg) => allLocationUuids.has(reg.uuid));
      const shops = nestedData.allShops.filter((shop) => allShopUuids.has(shop.uuid));
      const groups = nestedData.allGroups.filter((group) => allGroupUuids.has(group.uuid));
      const formatAndFilter = (entities) => {
        return entities
          .filter((entity) => validUuids.has(entity.uuid))
          .map((entity) => ({
            id: entity.id,
            uuid: entity.uuid,
            type: entity.tag ? "tag" : entity.type,
            name: entity.name,
            quests: entity.quests,
            canView: entity?.canView,
            tag: entity.tag || false,
            iconOverride: entity.iconOverride,
          }));
      };

      return {
        id: taggedNpc.id,
        uuid: taggedNpc.uuid,
        type: taggedNpc.type,
        tag: taggedNpc.tag,
        name: taggedNpc.name,
        canView: taggedNpc.canView,
        associates: formatAndFilter(associates),
        locations: formatAndFilter(locations),
        regions: formatAndFilter(regions),
        shops: formatAndFilter(shops),
        groups: formatAndFilter(groups),
      };
    });

    return Promise.all(tagPromises);
  }


  static async processJournalLinks(journalUuids) {
    if (!journalUuids || !Array.isArray(journalUuids) || journalUuids.length === 0) {
        return [];
    }

    const cache = this._createOperationCache();
    const journalPromises = journalUuids.map(async (uuid) => {
        try {
            const document = await this._getCachedDoc(uuid, cache);
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
                journal = document;
                displayName = journal.name;
            }

            if (journal) {
                const canView = await this._getCachedCanView(document.uuid, cache);
                if (canView) {
                    return {
                        id: document.id,
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
    return resolvedJournals.filter(j => j !== null);
  }

  static async getGroupMembers(memberUuids) {
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    if (!memberUuids) return [];
    const cache = this._createOperationCache();
    const memberPromises = memberUuids.map(async (uuid) => {
      try {
        const doc = await this._getCachedDoc(uuid, cache);
        if (!doc) return null;

        const flags = this._getCachedFlags(doc, cache);
        const [linkedTags, canView] = await Promise.all([
          this._getCachedTaggedNPCs(flags.linkedNPCs || flags.associates || [], cache),
          this._getCachedCanView(doc.uuid, cache),
        ]);

        const filteredTags = (linkedTags || [])
          .filter((tag) => !hideByPermission || tag.canView)
          .map((tag) => tag.name)
          .sort();
          
        const type = doc.getFlag("campaign-codex", "type") || "unknown";
        const quests = doc.getFlag("campaign-codex", "data")?.quests || [];
        const isTagged =  doc.getFlag("campaign-codex", "type") === "tag" || flags.tagMode ;


        return {
          id: doc.id,
          uuid: doc.uuid,
          canView: canView,
          tags: filteredTags,
          name: doc.name,
          iconOverride: doc.getFlag("campaign-codex", "icon-override") || null,
          quests: quests.length > 0 && (game.user.isGM || quests.some(q => q.visible)),
          img: doc.getFlag("campaign-codex", "image") || doc.img,
          type: type,
          tag: isTagged || false,
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
      regionsByRegion: {},
      shopsByRegion: {},
      shopsByLocation: {},
      npcsByLocation: {},
      npcsByShop: {},
      itemsByShop: {},
      totalValue: 0,
    };
    
    const processedUuids = new Set();
    const cache = this._createOperationCache();
    
    for (const member of groupMembers) {
      await this._processEntity(member, nestedData, processedUuids, cache);
    }
    return nestedData;
  }

  static async _processEntity(entity, nestedData, processedUuids, cache, parent = null, locationContext = null) {
    // ORIGINAL: Check that allows NPC re-processing
    if (!entity || !entity.type || (processedUuids.has(entity.uuid) && entity.type !== "npc")) return;
    processedUuids.add(entity.uuid);

    let newLocationContext = locationContext;
    if (entity.type === "location" || entity.type === "region") {
      newLocationContext = entity;
    }
    
    switch (entity.type) {
      case "group":
        await this._processGroup(entity, nestedData, processedUuids, cache);
        break;
      case "region":
        await this._processRegion(entity, nestedData, processedUuids, cache, parent, newLocationContext);
        break;
      case "location":
        await this._processLocation(entity, nestedData, processedUuids, cache, parent, newLocationContext);
        break;
      case "shop":
        await this._processShop(entity, nestedData, processedUuids, cache, parent, newLocationContext);
        break;
      case "npc":
        await this._processNPC(entity, nestedData, processedUuids, cache, parent, newLocationContext);
        break;
    }
  }

  static async _processGroup(group, nestedData, processedUuids, cache) {
    if (nestedData.allGroups.some((g) => g.uuid === group.uuid)) return;

    const groupDoc = await this._getCachedDoc(group.uuid, cache);
    if (!groupDoc) return;

    // ORIGINAL: Enrichment logic preserved
    if (!nestedData.allGroups.some((g) => g.uuid === group.uuid)) {
      group.canView = await this._getCachedCanView(groupDoc.uuid, cache);
      nestedData.allGroups.push(group);
    }

    const groupData = this._getCachedFlags(groupDoc, cache);
    const members = await this.getGroupMembers(groupData.members);
    nestedData.membersByGroup[group.uuid] = members;

    for (const member of members) {
      await this._processEntity(member, nestedData, processedUuids, cache, group);
    }
  }

  static async _processRegion(region, nestedData, processedUuids, cache, parent, locationContext) {
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    
    const regionDoc = await this._getCachedDoc(region.uuid, cache).catch(() => null);
    if (!regionDoc) return;

    const regionData = this._getCachedFlags(regionDoc, cache);
    // await this._processInventory(nestedData, regionDoc, regionData, cache);

    if (!nestedData.allRegions.some((r) => r.uuid === region.uuid)) {
      await this._enrichEntity(region, regionDoc, cache);
      nestedData.allRegions.push(region);
    }

    const childTypes = { regions: "region", locations: "location", shops: "shop", npcs: "npc" };
    const childLinks = { 
      regions: regionData.linkedRegions, 
      locations: regionData.linkedLocations, 
      shops: regionData.linkedShops, 
      npcs: regionData.linkedNPCs 
    };

    await Promise.all(
      Object.entries(childTypes).map(async ([key, type]) => {
        const listKey = `${key}ByRegion`;
        const uuids = childLinks[key] || [];
        
        const childPromises = uuids.map(async (uuid) => {
          const doc = await this._getCachedDoc(uuid, cache).catch(() => null);
          if (!doc) return null;

          const childData = this._getCachedFlags(doc, cache);
          const [linkedTags, canView] = await Promise.all([
            this._getCachedTaggedNPCs(childData.linkedNPCs || childData.associates || [], cache),
            this._getCachedCanView(doc.uuid, cache),
          ]);

          const filteredTags = (linkedTags || [])
            .filter((tag) => !hideByPermission || tag.canView)
            .map((tag) => tag.name)
            .sort();
            const isTagged =  doc.getFlag("campaign-codex", "type") === "tag" || childData.tagMode ;

          const allQuests = childData.quests || [];
          return {
            id: doc.id,
            uuid: doc.uuid,
            name: doc.name,
            quests: allQuests.length > 0 && (game.user.isGM || allQuests.some(q => q.visible)),
            img: doc.getFlag("campaign-codex", "image") || doc.img,
            type,
            tags: filteredTags,
            tag: isTagged,
            canView: canView,
            iconOverride: doc.getFlag("campaign-codex", "icon-override") || null,
          };
        });

        const processedInfos = (await Promise.all(childPromises)).filter(Boolean);
        nestedData[listKey][region.uuid] = processedInfos;

        for (const info of processedInfos) {
          await this._processEntity(info, nestedData, processedUuids, cache, region, 
            type === "location" ? info : locationContext);
        }
      })
    );
  }

  static async _processLocation(location, nestedData, processedUuids, cache, parent, locationContext) {
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const locationDoc = await this._getCachedDoc(location.uuid, cache).catch(() => null);
    if (!locationDoc) return;
    
    const locationData = this._getCachedFlags(locationDoc, cache);

    if (!nestedData.allLocations.some((l) => l.uuid === location.uuid)) {
      await this._enrichEntity(location, locationDoc, cache);
      nestedData.allLocations.push(location);
    }

    const childTypes = { shops: "shop", npcs: "npc" };
    const childLinks = { shops: locationData.linkedShops, npcs: locationData.linkedNPCs };
    // await this._processInventory(nestedData, locationDoc, locationData, cache);

    await Promise.all(
      Object.entries(childTypes).map(async ([key, type]) => {
        const listKey = `${key}ByLocation`;
        const uuids = childLinks[key] || [];

        const childPromises = uuids.map(async (uuid) => {
          try {
            const doc = await this._getCachedDoc(uuid, cache);
            if (!doc) return null;

            const childData = this._getCachedFlags(doc, cache);
            const [linkedTags, canView] = await Promise.all([
              this._getCachedTaggedNPCs(childData.linkedNPCs || childData.associates || [], cache),
              this._getCachedCanView(doc.uuid, cache),
            ]);

            const filteredTags = (linkedTags || [])
              .filter((tag) => !hideByPermission || tag.canView)
              .map((tag) => tag.name)
              .sort();
            const isTagged =  doc.getFlag("campaign-codex", "type") === "tag" || childData.tagMode ;

            const allQuests = childData.quests || [];
            return {
              id: doc.id,
              uuid: doc.uuid,
              name: doc.name,
              quests: allQuests.length > 0 && (game.user.isGM || allQuests.some(q => q.visible)),
              img: doc.getFlag("campaign-codex", "image") || doc.img,
              type,
              tags: filteredTags,
              tag: isTagged,
              canView: canView,
              tabOverrides: doc.getFlag("campaign-codex", "tab-overrides") || [],
              iconOverride: doc.getFlag("campaign-codex", "icon-override") || null,
            };
          } catch (error) {
            console.error(`Campaign Codex | Error processing child entity ${uuid}:`, error);
            return null;
          }
        });

        const processedInfos = (await Promise.all(childPromises)).filter(Boolean);
        nestedData[listKey][location.uuid] = processedInfos;

        for (const info of processedInfos) {
          await this._processEntity(info, nestedData, processedUuids, cache, location, locationContext);
        }

      })
    );
  }

  static async _processShop(shop, nestedData, processedUuids, cache, parent, locationContext) {
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const shopDoc = await this._getCachedDoc(shop.uuid, cache);
    if (!shopDoc) return;
    
    const shopData = this._getCachedFlags(shopDoc, cache);

    if (!nestedData.allShops.some((s) => s.uuid === shop.uuid)) {
      const [linkedTags, canView] = await Promise.all([
        this._getCachedTaggedNPCs(shopData.linkedNPCs || [], cache),
        this._getCachedCanView(shopDoc.uuid, cache),
      ]);
      
      shop.tags = linkedTags
        .filter((tag) => !hideByPermission || tag.canView)
        .map((tag) => tag.name)
        .sort();
      shop.canView = canView;
      shop.iconOverride = shopDoc.getFlag("campaign-codex", "icon-override") || null;
      shop.tabOverrides = shopDoc.getFlag("campaign-codex", "tab-overrides") || [];
      shop.quests = !!(shopData.quests && shopData.quests.length);

      nestedData.allShops.push(shop);
    }

    const npcDocs = await Promise.all(
      (shopData.linkedNPCs || []).map(uuid => 
        this._getCachedDoc(uuid, cache).catch(() => null)
      )
    );

    nestedData.npcsByShop[shop.uuid] = [];

    const npcInfoPromises = npcDocs.map(async (npcDoc) => {
      if (!npcDoc) return null;

      const [npcCanView, rawTags] = await Promise.all([
        this._getCachedCanView(npcDoc.uuid, cache),
        this._getCachedTaggedNPCs(npcDoc.getFlag("campaign-codex", "data")?.associates || [], cache),
      ]);

      const npcData = this._getCachedFlags(npcDoc, cache);
      const npcTags = (rawTags || [])
        .filter((tag) => !hideByPermission || tag.canView)
        .map((tag) => tag.name)
        .sort();

      const isTagged =  npcDoc.getFlag("campaign-codex", "type") === "tag" || npcData?.tagMode ;

      const allQuests = npcData.quests || [];
      return {
        id: npcDoc.id,
        uuid: npcDoc.uuid,
        name: npcDoc.name,
        quests: allQuests.length > 0 && (game.user.isGM || allQuests.some(q => q.visible)),
        img: npcDoc.getFlag("campaign-codex", "image") || npcDoc.img,
        type: "npc",
        tags: npcTags,
        tag: tagged,
        canView: npcCanView,
        tabOverrides: npcDoc.getFlag("campaign-codex", "tab-overrides") || [],
        iconOverride: npcDoc.getFlag("campaign-codex", "icon-override") || null,
      };
    });

    const processedNpcInfos = (await Promise.all(npcInfoPromises)).filter(Boolean);
    nestedData.npcsByShop[shop.uuid].push(...processedNpcInfos);

    for (const npcInfo of processedNpcInfos) {
      await this._processEntity(npcInfo, nestedData, processedUuids, cache, shop, locationContext);
    }
    
    // await this._processInventory(nestedData, shopDoc, shopData, cache);
  }

  static async _processInventory(nestedData, doc, data, cache) {
    const inventoryWithoutPerms = await CampaignCodexLinkers.getInventory(doc, data.inventory || []);
    
    const processedInventory = await Promise.all(
      inventoryWithoutPerms.map(async (item) => {
        const canView = await this._getCachedCanView(item.uuid || item.itemUuid, cache);
        return { ...item, canView, type: "item" };
      })
    );

    nestedData.itemsByShop[doc.uuid] = [];
    for (const itemInfo of processedInventory) {
      nestedData.itemsByShop[doc.uuid].push(itemInfo);
      if (!nestedData.allItems.some((i) => i.uuid === itemInfo.uuid && i.shopSource === doc.uuid)) {
        nestedData.allItems.push({ ...itemInfo, shopSource: doc.uuid });
        nestedData.totalValue += itemInfo.finalPrice * itemInfo.quantity;
      }
    }
  }

  static async _processNPC(npc, nestedData, processedUuids, cache, parent, locationContext) {
    const npcDoc = await this._getCachedDoc(npc.uuid, cache).catch(() => null);
    if (!npcDoc) return;

    const npcInfo = await this._createNPCInfo(npcDoc, parent, locationContext, nestedData, cache);

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

  static async _createNPCInfo(npcDoc, parent, locationContext, nestedData, cache) {
    const npcData = this._getCachedFlags(npcDoc, cache);
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    
    const sourceType = parent?.type || "direct";
    let sourceLocationName = null;
    let sourceShopName = null;

    // if (nestedData)  await this._processInventory(nestedData, npcDoc, npcData, cache);
   

    if (sourceType === "shop") {
      sourceShopName = parent.name;
      if (locationContext) {
        sourceLocationName = locationContext.name;
      }
    } else if (sourceType === "location") {
      sourceLocationName = parent.name;
    }

    const [linkedTags, actor, allLocations, linkedShops, canView] = await Promise.all([
      this._getCachedTaggedNPCs(npcData.associates || [], cache),
      npcData.linkedActor ? this._getCachedDoc(npcData.linkedActor, cache) : null,
      CampaignCodexLinkers.getAllLocations(npcDoc, npcData.linkedLocations || []),
      CampaignCodexLinkers.getNameFromUuids(npcData.linkedShops || []),
      this._getCachedCanView(npcDoc.uuid, cache),
    ]);

    const allLocationsNames = allLocations
      .filter(item => item.typeData !== "region")
      .map(item => item.name);
    const allRegionsNames = allLocations
      .filter(item => item.typeData === "region")
      .map(item => item.name);

    const allQuests = npcDoc.getFlag("campaign-codex", "data")?.quests || [];
    const imageData = npcDoc.getFlag("campaign-codex", "image") || actor?.img || TemplateComponents.getAsset("image", "npc");
    const tabOverrides = npcDoc.getFlag("campaign-codex", "tab-overrides") || [];
    const imageAreaOverride = tabOverrides?.find(override => override.key === "imageArea");
    const isTagged =  npcDoc.getFlag("campaign-codex", "type") === "tag" || npcData.tagMode ;


    return {
      id: npcDoc.id,
      uuid: npcDoc.uuid,
      name: npcDoc.name,
      img: imageData,
      type: "npc",
      quests: allQuests.length > 0 && (game.user.isGM || allQuests.some(q => q.visible)),
      tags: linkedTags
        .filter((tag) => !hideByPermission || tag.canView)
        .map((tag) => tag.name)
        .sort(),
      tag: isTagged,
      source: sourceType,
      sourceLocation: sourceLocationName,
      sourceShop: sourceShopName,
      permission: npcData.permission,
      locations: allLocationsNames.sort(),
      regions: allRegionsNames.sort(),
      shops: linkedShops.sort(),
      canView: canView,
      showImage: imageAreaOverride?.visible ?? true,
      tabOverrides: tabOverrides,
      iconOverride: npcDoc.getFlag("campaign-codex", "icon-override") || null,
      meta: game.campaignCodex?.getActorDisplayMeta(actor, npcData) || `<span class="entity-type">${localize("names.npc")}</span>`,
      actor: actor ? { uuid: actor.uuid, name: actor.name, type: actor.type } : null,
    };
  }

  static async _enrichEntity(entity, doc, cache) {
    const hideByPermission = game.settings.get("campaign-codex", "hideByPermission");
    const data = this._getCachedFlags(doc, cache);
    
    const [linkedTags, linkedShops, canView, region, parentregions, npcs, shopNpcCount] = await Promise.all([
      this._getCachedTaggedNPCs(data.linkedNPCs || data.associates || [], cache),
      CampaignCodexLinkers.getNameFromUuids(data.linkedShops || []),
      this._getCachedCanView(doc.uuid, cache),
      entity.type === "location" ? CampaignCodexLinkers.getLinkedRegion(doc) : null,
      entity.type === "region" ? CampaignCodexLinkers.getNameFromUuids(data.parentRegions || [], true) : Promise.resolve([]),
      entity.type === "location" || entity.type === "region" ? CampaignCodexLinkers.getNameFromUuids(data.linkedNPCs || [], true) : Promise.resolve([]),
      entity.type === "location" ? CampaignCodexLinkers.getShopNPCs(doc, data.linkedShops || []).then((npcs) => npcs.length) : Promise.resolve(0),
    ]);

    entity.tabOverrides = doc.getFlag("campaign-codex", "tab-overrides") || [];
    entity.iconOverride = doc.getFlag("campaign-codex", "icon-override") || null;
    entity.canView = canView;
    entity.quests = !!(data.quests && data.quests.length);
    entity.permission = doc.permission;
    entity.shops = linkedShops.sort();
    entity.tags = linkedTags
      .filter((tag) => !hideByPermission || tag.canView)
      .map((tag) => tag.name)
      .sort();
    entity.npcs = npcs;
    
    if (entity.type === "region") {
      entity.region = parentregions.sort();
    }

    if (entity.type === "location") {
      entity.region = [region?.name];
      const directNpcCount = (data.linkedNPCs || []).length;
      entity.npcCount = directNpcCount + shopNpcCount;
      entity.shopCount = (data.linkedShops || []).length;
    }
  }

  // ORIGINAL: _removeDuplicates preserved exactly
  static _removeDuplicates(array) {
    return array.filter((item, index, self) => index === self.findIndex((t) => t.uuid === item.uuid));
  }
}