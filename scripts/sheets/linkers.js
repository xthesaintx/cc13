import { TemplateComponents } from './template-components.js';
export class CampaignCodexLinkers {

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
      
      
      const cleanedArray = currentArray.filter(uuid => !brokenUuids.includes(uuid));
      
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

  
  static createQuickLinks(sources, uniqueKey = 'id') {
    if (!sources || !Array.isArray(sources)) {
      return [];
    }

    const allItems = sources.flatMap(source => {
      if (!Array.isArray(source.data)) return [];
      return source.data.map(item => ({ ...item, type: source.type }));
    });

    const seen = new Set();
    return allItems.filter(item => {
      const identifier = item[uniqueKey];
      if (seen.has(identifier)) {
        return false;
      }
      seen.add(identifier);
      return true;
    });
  }



static async getAllLocations(document, directLocationUuids) {
  if (!directLocationUuids || !Array.isArray(directLocationUuids)) return [];

  const locationMap = new Map();
  const brokenLocationUuids = [];
  const brokenShopUuids = [];

  for (const uuid of directLocationUuids) {
    try {
      const journal = await fromUuid(uuid);
      if (!journal) {
        console.warn(`Campaign Codex | Linked location not found: ${uuid}`);
        brokenLocationUuids.push(uuid);
        continue;
      }
      
      const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset('image', 'location');
      locationMap.set(journal.id, {
        id: journal.id,
        uuid: journal.uuid,
        name: journal.name,
        img: imageData,
        source: 'direct',
        meta: '<span class="entity-type">Direct Link</span>'
      });
    } catch (error) {
      console.error(`Campaign Codex | Error processing location ${uuid}:`, error);
      brokenLocationUuids.push(uuid);
    }
  }

  if (brokenLocationUuids.length > 0 && !game.campaignCodexImporting) {
    document._skipRelationshipUpdates = true;
    await this.clearBrokenReferences(document, brokenLocationUuids, 'linkedLocations');
    delete document._skipRelationshipUpdates;
  }

  const npcData = document.getFlag("campaign-codex", "data") || {};
  const npcLinkedShopUuids = npcData.linkedShops || [];

  for (const shopUuid of npcLinkedShopUuids) {
    try {
      const shop = await fromUuid(shopUuid);
      if (!shop) {
        console.warn(`Campaign Codex | Shop not found during location discovery: ${shopUuid}`);
        brokenShopUuids.push(shopUuid);
        continue;
      }
      
      const shopData = shop.getFlag("campaign-codex", "data") || {};
      const linkedNPCUuids = shopData.linkedNPCs || [];
      
      if (linkedNPCUuids.includes(document.uuid)) {
        
        const shopLocationUuid = shopData.linkedLocation;
        if (shopLocationUuid) {
          const location = await fromUuid(shopLocationUuid);
          if (location) {
            const locationData = location.getFlag("campaign-codex", "data") || {};
            const locationShopUuids = locationData.linkedShops || [];
            
            if (locationShopUuids.includes(shop.uuid)) {
              if (!locationMap.has(location.id)) {
                locationMap.set(location.id, {
                  id: location.id,
                  uuid: location.uuid,
                  name: location.name,
                  img: location.getFlag("campaign-codex", "image") || TemplateComponents.getAsset('image', 'shop'),
                  source: 'shop',
                  shops: [shop.name],
                  meta: `<span class="entity-type">Via ${shop.name}</span>`
                });
              } else {
                const existingLocation = locationMap.get(location.id);
                if (existingLocation.source === 'shop' && !existingLocation.shops.includes(shop.name)) {
                  existingLocation.shops.push(shop.name);
                  existingLocation.meta = `<span class="entity-type">Via ${existingLocation.shops.join(', ')}</span>`;
                }
              }
            }
          }
        }
      } else {
        if (!game.campaignCodexImporting) {
          console.warn(`Campaign Codex | NPC ${document.name} thinks it's linked to shop ${shop.name}, but shop doesn't link back.`);
          brokenShopUuids.push(shopUuid);
        }
      }
    } catch (error) {
      console.error(`Campaign Codex | Error processing shop ${shopUuid} for location discovery:`, error);
    }
  }

  if (brokenShopUuids.length > 0 && !game.campaignCodexImporting) {
    document._skipRelationshipUpdates = true;
    await this.clearBrokenReferences(document, brokenShopUuids, 'linkedShops');
    delete document._skipRelationshipUpdates;
  }

  return Array.from(locationMap.values());
}
  
  static async getLinkedLocation(locationUuid) {
    if (!locationUuid) return null;
    
    try {
      const journal = await fromUuid(locationUuid);
      if (!journal) {
        console.warn(`Campaign Codex | Linked location not found: ${locationUuid}`);
        return null;
      }
      
      const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset('image', 'location');
      
      return {
        id: journal.id,
        uuid: journal.uuid,
        name: journal.name,
        img: imageData
      };
    } catch (error) {
      console.error(`Campaign Codex | Error getting linked location ${locationUuid}:`, error);
      return null;
    }
  }

  
  static async getLinkedLocations(document, locationUuids) {
    if (!locationUuids || !Array.isArray(locationUuids)) return [];
    
    const locations = [];
    const brokenLocationUuids = [];
    
    for (const uuid of locationUuids) {
      try {
        const journal = await fromUuid(uuid);
        if (!journal) {
          console.warn(`Campaign Codex | Linked location not found: ${uuid}`);
          brokenLocationUuids.push(uuid);
          continue;
        }
        
        const locationData = journal.getFlag("campaign-codex", "data") || {};
        const directNPCCount = (locationData.linkedNPCs || []).length;
        const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset('image', 'location');
        
        let shopNPCCount = 0;
        const shopUuids = locationData.linkedShops || [];
        for (const shopUuid of shopUuids) {
          try {
            const shop = await fromUuid(shopUuid);
            if (shop) {
              const shopData = shop.getFlag("campaign-codex", "data") || {};
              shopNPCCount += (shopData.linkedNPCs || []).length;
            }
          } catch (e) {/* Gulp */}
        }
        
        const totalNPCs = directNPCCount + shopNPCCount;
        const shopCount = shopUuids.length;
        
        locations.push({
          id: journal.id,
          uuid: journal.uuid,
          name: journal.name,
          img: imageData,
          meta: `<span class="entity-stat">${totalNPCs}&nbsp;NPCs</span> <span class="entity-stat">${shopCount}&nbsp;Entries</span>`
        });
      } catch (error) {
        console.error(`Campaign Codex | Error processing location ${uuid}:`, error);
        brokenLocationUuids.push(uuid);
      }
    }
    
    if (brokenLocationUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenLocationUuids, 'linkedLocations');
      delete document._skipRelationshipUpdates;
    }
    
    return locations;
  }

  
  static async getLinkedRegion(locationDoc) {
    const locationData = locationDoc.getFlag("campaign-codex", "data") || {};
    const regionUuid = locationData.parentRegion;

    if (!regionUuid) return null;

    try {
      const region = await fromUuid(regionUuid);
      if (!region) {
        console.warn(`Campaign Codex | Broken parentRegion link from ${locationDoc.name}: ${regionUuid}`);
        await locationDoc.unsetFlag("campaign-codex", "data.parentRegion");
        ui.notifications.warn(`Removed broken parent region link from ${locationDoc.name}.`);
        return null;
      }
      
      return {
        id: region.id,
        uuid: region.uuid,
        name: region.name,
        img: region.getFlag("campaign-codex", "image") || TemplateComponents.getAsset('image', 'region')
      };
    } catch (error) {
      console.error(`Campaign Codex | Error fetching linked region ${regionUuid}:`, error);
      return null;
    }
  }

  
  static async getLinkedActor(actorUuid) {
    if (!actorUuid) return null;

    try {
      const actor = await fromUuid(actorUuid);
      if (!actor) {
        console.warn(`Campaign Codex | Linked actor not found: ${actorUuid}`);
        return null;
      }

      const ac = this.getValue(actor, 'system.attributes.ac.value') || 
                 this.getValue(actor, 'system.ac.value') || 
                 this.getValue(actor, 'system.armor') || 
                 this.getValue(actor, 'system.defense') ||
                 this.getValue(actor, 'system.stats.toughness.value'); 

      const hp = this.getValue(actor, 'system.attributes.hp') || 
                 this.getValue(actor, 'system.hp') || 
                 this.getValue(actor, 'system.health') ||
                 this.getValue(actor, 'system.wounds'); 

      return {
        id: actor.id,
        uuid: actor.uuid,
        name: actor.name,
        img: actor.img,
        ac: ac ||null,
        hp: hp||null,
        type: actor.type
      };
    } catch (error) {
      console.error(`Campaign Codex | Error getting linked actor ${actorUuid}:`, error);
      return null;
    }
  }

  static async getAssociates(document, associateUuids) {
    if (!associateUuids || !Array.isArray(associateUuids)) return [];
    
    const associates = [];
    const brokenAssociateUuids = [];
    
    for (const uuid of associateUuids) {
      try {
        const journal = await fromUuid(uuid);
        if (!journal) {
          console.warn(`Campaign Codex | Associate journal not found: ${uuid}`);
          brokenAssociateUuids.push(uuid);
          continue;
        }

        const npcData = journal.getFlag("campaign-codex", "data") || {};
        const actor = npcData.linkedActor ? await fromUuid(npcData.linkedActor) : null;
        const imageData = journal.getFlag("campaign-codex", "image") || actor?.img || TemplateComponents.getAsset('image', 'npc');
        const allLocations = await this.getAllLocations(journal, npcData.linkedLocations || []);
        const linkedShops = await this.getLinkedShopsWithLocation(journal, npcData.linkedShops || []);

        associates.push({
          id: journal.id,
          uuid: journal.uuid,
          name: journal.name,
          img: imageData,
          actor: actor,
          meta: game.campaignCodex.getActorDisplayMeta(actor),
          locations: allLocations.map(loc => loc.name),
          shops: linkedShops.map(shop => shop.name)
        });
      } catch (error) {
        console.error(`Campaign Codex | Error processing associate ${uuid}:`, error);
        brokenAssociateUuids.push(uuid);
      }
    }
    
    if (brokenAssociateUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenAssociateUuids, 'associates');
      delete document._skipRelationshipUpdates;
    }
    
    return associates;
  }


  static async getLinkedNPCs(document, npcUuids) {
    if (!npcUuids || !Array.isArray(npcUuids)) return [];
    
    const npcs = [];
    const brokenNPCUuids = [];
    
    for (const uuid of npcUuids) {
      try {
        const journal = await fromUuid(uuid);
        if (!journal) {
          console.warn(`Campaign Codex | NPC journal not found: ${uuid}`);
          brokenNPCUuids.push(uuid);
          continue;
        }
        
        const npcData = journal.getFlag("campaign-codex", "data") || {};
        const actor = npcData.linkedActor ? await fromUuid(npcData.linkedActor) : null;
        const imageData = journal.getFlag("campaign-codex", "image") || actor?.img || TemplateComponents.getAsset('image', 'npc');

        npcs.push({
          id: journal.id,
          uuid: journal.uuid,
          name: journal.name,
          img: imageData,
          actor: actor,
          meta: game.campaignCodex.getActorDisplayMeta(actor)
        });
      } catch (error) {
        console.error(`Campaign Codex | Error processing NPC ${uuid}:`, error);
        brokenNPCUuids.push(uuid);
      }
    }
    
    if (brokenNPCUuids.length > 0 && !game.campaignCodexImporting) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenNPCUuids, 'linkedNPCs');
      delete document._skipRelationshipUpdates;
    }
    
    return npcs;
  }


  static async getAllNPCs(locationUuids) {
    if (!locationUuids || !Array.isArray(locationUuids)) return [];
    
    const npcMap = new Map();
    
    for (const locationUuid of locationUuids) {
      try {
        const location = await fromUuid(locationUuid);
        if (!location) {
          console.warn(`Campaign Codex | Location not found for NPC aggregation: ${locationUuid}`);
          continue;
        }
        
        const locationData = location.getFlag("campaign-codex", "data") || {};
        
        const directNPCs = await this.getLinkedNPCs(location, locationData.linkedNPCs || []);
        for (const npc of directNPCs) {
          if (!npcMap.has(npc.id)) {
            npcMap.set(npc.id, {
              ...npc,
              locations: [location.name],
              shops: [],
              source: 'location'
            });
          } else {
            const existingNpc = npcMap.get(npc.id);
            if (!existingNpc.locations.includes(location.name)) {
              existingNpc.locations.push(location.name);
            }
          }
        }
        
        const shopUuids = locationData.linkedShops || [];
        for (const shopUuid of shopUuids) {
          try {
            const shop = await fromUuid(shopUuid);
            if (!shop) continue;
            
            const shopData = shop.getFlag("campaign-codex", "data") || {};
            const shopNPCs = await this.getLinkedNPCs(shop, shopData.linkedNPCs || []);

            for (const npc of shopNPCs) {
              if (!npcMap.has(npc.id)) {
                npcMap.set(npc.id, {
                  ...npc,
                  locations: [location.name],
                  shops: [shop.name],
                  source: 'shop'
                });
              } else {
                const existingNpc = npcMap.get(npc.id);
                if (!existingNpc.locations.includes(location.name)) {
                  existingNpc.locations.push(location.name);
                }
                if (!existingNpc.shops.includes(shop.name)) {
                  existingNpc.shops.push(shop.name);
                }
                if (existingNpc.source === 'location') {
                  existingNpc.source = 'shop';
                }
              }
            }
          } catch (error) {
            console.error(`Campaign Codex | Error processing shop ${shopUuid} for NPC aggregation:`, error);
          }
        }
      } catch (error) {
        console.error(`Campaign Codex | Error processing location ${locationUuid} for NPC aggregation:`, error);
      }
    }
    
    return Array.from(npcMap.values());
  }

  static async getDirectNPCs(document, npcUuids) {
    if (!npcUuids || !Array.isArray(npcUuids)) return [];
    
    const npcs = [];
    const brokenNPCUuids = [];
    
    for (const uuid of npcUuids) {
      try {
        const journal = await fromUuid(uuid);
        if (!journal) {
          console.warn(`Campaign Codex | Direct NPC journal not found: ${uuid}`);
          brokenNPCUuids.push(uuid);
          continue;
        }
        
        const npcData = journal.getFlag("campaign-codex", "data") || {};
        const actor = npcData.linkedActor ? await fromUuid(npcData.linkedActor) : null;
        const imageData = journal.getFlag("campaign-codex", "image") || actor?.img || TemplateComponents.getAsset('image', 'npc');

        npcs.push({
          id: journal.id,
          uuid: journal.uuid,
          name: journal.name,
          img: imageData,
          actor: actor,
          meta: game.campaignCodex.getActorDisplayMeta(actor),
          source: 'direct'
        });
      } catch (error) {
        console.error(`Campaign Codex | Error processing direct NPC ${uuid}:`, error);
        brokenNPCUuids.push(uuid);
      }
    }
    
    if (brokenNPCUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenNPCUuids, 'linkedNPCs');
      delete document._skipRelationshipUpdates;
    }
    
    return npcs;
  }

  static async getShopNPCs(document, shopUuids) {
    if (!shopUuids || !Array.isArray(shopUuids)) return [];
    
    const npcMap = new Map();
    const brokenShopUuids = [];
    
    for (const shopUuid of shopUuids) {
      try {
        const shop = await fromUuid(shopUuid);
        if (!shop) {
          console.warn(`Campaign Codex | Shop not found: ${shopUuid}`);
          brokenShopUuids.push(shopUuid);
          continue;
        }
        
        const shopData = shop.getFlag("campaign-codex", "data") || {};
        const linkedNPCUuids = shopData.linkedNPCs || [];
        
        const linkedNpcs = await this.getLinkedNPCs(shop, linkedNPCUuids);

        for (const npc of linkedNpcs) {
          const npcJournal = await fromUuid(npc.uuid);
          if (!npcJournal) continue;

          if (!npcMap.has(npcJournal.id)) {
            npcMap.set(npcJournal.id, {
              ...npc,
              shops: [shop.name],
              source: 'shop'
            });
          } else {
            const existingNpc = npcMap.get(npcJournal.id);
            if (!existingNpc.shops.includes(shop.name)) {
              existingNpc.shops.push(shop.name);
            }
          }
        }
      } catch (error) {
        console.error(`Campaign Codex | Error processing shop ${shopUuid}:`, error);
        brokenShopUuids.push(shopUuid);
      }
    }
    
  if (brokenShopUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenShopUuids, 'linkedShops');
      delete document._skipRelationshipUpdates;
    }
    
    return Array.from(npcMap.values());
  }

  

  static async getLinkedShopsWithLocation(document, shopUuids) {
    if (!shopUuids || !Array.isArray(shopUuids)) return [];
    
    const shops = [];
    const brokenShopUuids = [];
    
    for (const uuid of shopUuids) {
      try {
        const journal = await fromUuid(uuid);
        if (!journal) {
          console.warn(`Campaign Codex | Shop journal not found: ${uuid}`);
          brokenShopUuids.push(uuid);
          continue;
        }
        
        const shopData = journal.getFlag("campaign-codex", "data") || {};
        const linkedLocationUuid = shopData.linkedLocation;
        const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset('image','shop');
        let locationName = 'Unknown';
        
        if (linkedLocationUuid) {
          const location = await fromUuid(linkedLocationUuid);
          if (location) {
            locationName = location.name;
          }
        }
        
        shops.push({
          id: journal.id,
          uuid: journal.uuid,
          name: journal.name,
          img: imageData,
          meta: `<span class="entity-type">${locationName}</span>`
        });
      } catch (error) {
        console.error(`Campaign Codex | Error processing shop ${uuid}:`, error);
        brokenShopUuids.push(uuid);
      }
    }
    
    if (brokenShopUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenShopUuids, 'linkedShops');
      delete document._skipRelationshipUpdates;
    }
    
    return shops;
  }

  static async getLinkedShops(document, shopUuids) {
    if (!shopUuids || !Array.isArray(shopUuids)) return [];
    
    const shops = [];
    const brokenShopUuids = [];
    
    for (const uuid of shopUuids) {
      try {
        const journal = await fromUuid(uuid);
        if (!journal) {
          console.warn(`Campaign Codex | Shop journal not found: ${uuid}`);
          brokenShopUuids.push(uuid);
          continue;
        }
        
        const shopData = journal.getFlag("campaign-codex", "data") || {};
        const npcCount = (shopData.linkedNPCs || []).length;
        const imageData = journal.getFlag("campaign-codex", "image") || TemplateComponents.getAsset('image','shop');

        shops.push({
          id: journal.id,
          uuid: journal.uuid,
          name: journal.name,
          img: imageData,
          meta: `<span class="entity-stat">${npcCount} NPCs</span>`
        });
      } catch (error) {
        console.error(`Campaign Codex | Error processing shop ${uuid}:`, error);
        brokenShopUuids.push(uuid);
      }
    }
    
    if (brokenShopUuids.length > 0) {
      document._skipRelationshipUpdates = true;
      await this.clearBrokenReferences(document, brokenShopUuids, 'linkedShops');
      delete document._skipRelationshipUpdates;
    }
    
    return shops;
  }

  static async getAllShops(locationUuids) {
    if (!locationUuids || !Array.isArray(locationUuids)) return [];
    
    const shopMap = new Map();
    
    for (const locationUuid of locationUuids) {
      try {
        const location = await fromUuid(locationUuid);
        if (!location) {
          console.warn(`Campaign Codex | Location not found for shop aggregation: ${locationUuid}`);
          continue;
        }
        
        const locationData = location.getFlag("campaign-codex", "data") || {};
        const shops = await this.getLinkedShops(location, locationData.linkedShops || []);

        for (const shop of shops) {
          const shopJournal = await fromUuid(shop.uuid);
          if (!shopJournal) continue;
          
          const shopData = shopJournal.getFlag("campaign-codex", "data") || {};
          const inventoryCount = (shopData.inventory || []).length;

          if (!shopMap.has(shop.id)) {
            shopMap.set(shop.id, {
              ...shop,
              locations: [location.name],
              meta: `${shop.meta} <span class="entity-stat">${inventoryCount} Items</span>`
            });
          } else {
            const existingShop = shopMap.get(shop.id);
            if (!existingShop.locations.includes(location.name)) {
              existingShop.locations.push(location.name);
            }
          }
        }
      } catch (error) {
        console.error(`Campaign Codex | Error processing location ${locationUuid} for shop aggregation:`, error);
      }
    }
    
    return Array.from(shopMap.values());
  }

static _getSystemSettings(systemId) {
  // Check for custom overrides from settings.
  const customPricePath = game.settings.get("campaign-codex", "itemPricePath");
  const customDenominationPath = game.settings.get("campaign-codex", "itemDenominationPath");
  const denominationOverride = game.settings.get("campaign-codex", "itemDenominationOverride");
  
  if (customPricePath && customPricePath !== "system.price.value") {
      return {
          pricePath: customPricePath,
          denominationPath: customDenominationPath,
          currency: denominationOverride || (customDenominationPath ? null : "gp")
      };
  }

  switch (systemId) {
    case "dnd5e":
      return {
        pricePath: "system.price.value",
        denominationPath: "system.price.denomination",
        currency: null 
      };
    case "pf2e":
      return {
        pricePath: "system.price.value", 
        denominationPath: null, 
        currency: "gp"
      };
    case "sfrpg":
      return {
        pricePath: "system.price",
        denominationPath: null,
        currency: "c"
      };
    case "swade":
      return {
        pricePath: "system.price",
        denominationPath: null,
        currency: "c"
      };
    case "pf1":
      return {
        pricePath: "system.price",
        denominationPath: null,
        currency: "gp"
      };
    case "ose":
      return {
        pricePath: "system.cost",
        denominationPath: null,
        currency: "gp"
      };
    case "daggerheart":
      return {
        pricePath: "system.cost", 
        denominationPath: null,
        currency: "handfuls"
      };
    default:
      return {
        pricePath: "system.price.value",
        denominationPath: "system.price.denomination",
        currency: null
      };
  }
}
  
static async getInventory(document, inventoryData) {
  if (!inventoryData || !Array.isArray(inventoryData)) return [];
  
  const inventory = [];
  const brokenItemUuids = [];
  
  const systemId = game.system.id;
  const { pricePath, denominationPath, currency: defaultCurrency } = this._getSystemSettings(systemId);

  const denominationOverride = game.settings.get("campaign-codex", "itemDenominationOverride");
  const finalCurrency = denominationOverride || defaultCurrency;
  
  for (const itemData of inventoryData) {
    try {
      const item = await fromUuid(itemData.itemUuid);
      if (!item) {
        console.warn(`Campaign Codex | Inventory item not found: ${itemData.itemUuid}`);
        brokenItemUuids.push(itemData.itemUuid);
        continue;
      }
      
      const rawPrice = this.getValue(item, pricePath) || 0;
      let basePrice = parseFloat(String(rawPrice).replace(/[^\d.]/g, '')) || 0;
      
      let currency;
      if (finalCurrency) {
          currency = finalCurrency;
      } else if (denominationPath) {
          currency = this.getValue(item, denominationPath) || "gp";
      } else {
          currency = "gp"; // Fallback
      }

      // Special handling for Pathfinder 2e's price structure
      if (systemId === "pf2e") {
        // The price in PF2e is an object with different coin values.
        const pf2ePrice = this.getValue(item, "system.price.value");
        if (pf2ePrice) {
          if (pf2ePrice.pp > 0) {
            currency = "pp";
            basePrice = pf2ePrice.pp;
          } else if (pf2ePrice.gp > 0) {
            currency = "gp";
            basePrice = pf2ePrice.gp;
          } else if (pf2ePrice.sp > 0) {
            currency = "sp";
            basePrice = pf2ePrice.sp;
          } else {
            currency = "cp";
            basePrice = pf2ePrice.cp;
          }
        }
      }

      const weight = null;

      const markup = document.getFlag("campaign-codex", "data.markup") || 1.0;
      const finalPrice = itemData.customPrice ?? Math.round(basePrice * markup);


      inventory.push({
        itemId: item.id,
        itemUuid: item.uuid,
        name: item.name,
        img: item.img,
        basePrice: basePrice,
        finalPrice: finalPrice,
        currency: currency,
        quantity: itemData.quantity === undefined ? 1 : itemData.quantity,
        weight: weight
      });
    } catch (error) {
      console.error(`Campaign Codex | Error processing inventory item:`, error);
      brokenItemUuids.push(itemData.itemUuid);
    }
  }

  // (The rest of your error handling code remains the same)
  if (brokenItemUuids.length > 0) {
    try {
      const currentData = document.getFlag("campaign-codex", "data") || {};
      const currentInventory = currentData.inventory || [];
      const cleanedInventory = currentInventory.filter(item => !brokenItemUuids.includes(item.itemUuid));
      
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


static getValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}


}