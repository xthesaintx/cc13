import { TemplateComponents } from "./template-components.js";
import { CampaignCodexLinkers } from "./linkers.js";

export class GroupLinkers {
  static async getGroupMembers(memberUuids) {
    if (!memberUuids) return [];
    const members = [];
    for (const uuid of memberUuids) {
      const doc = await fromUuid(uuid).catch(() => null);
      if (!doc) continue;
      const type = doc.getFlag?.("campaign-codex", "type") || "unknown";
      members.push({
        uuid: doc.uuid,
        name: doc.name,
        img: doc.getFlag?.("campaign-codex", "image") || doc.img,
        type,
      });
    }
    return members;
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
      locationsByRegion: {},
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
    nestedData.allNPCs = this._removeDuplicates(nestedData.allNPCs);
    return nestedData;
  }

  static async _processEntity(
    entity,
    nestedData,
    processedUuids,
    parent = null,
    locationContext = null,
  ) {
    if (!entity || !entity.type || (processedUuids.has(entity.uuid) && entity.type !== "npc")) return;
    // CHANGED SO CAN HAVE DUPLICATE NPCS IN THE TREE VIEW
    // if (!entity || !entity.type || processedUuids.has(entity.uuid)) return;
    processedUuids.add(entity.uuid);

    let newLocationContext = locationContext;
    if (entity.type === "location") {
      newLocationContext = entity;
    }

    switch (entity.type) {
      case "group":
        await this._processGroup(entity, nestedData, processedUuids);
        break;
      case "region":
        await this._processRegion(entity, nestedData, processedUuids);
        break;
      case "location":
        await this._processLocation(
          entity,
          nestedData,
          processedUuids,
          parent,
          newLocationContext,
        );
        break;
      case "shop":
        await this._processShop(
          entity,
          nestedData,
          processedUuids,
          parent,
          newLocationContext,
        );
        break;
      case "npc":
        await this._processNPC(entity, nestedData, parent, newLocationContext);
        break;
    }
  }

  static async _processGroup(group, nestedData, processedUuids) {
    if (!nestedData.allGroups.find((g) => g.uuid === group.uuid))
      nestedData.allGroups.push(group);
    const groupDoc = await fromUuid(group.uuid);
    const groupData = groupDoc.getFlag("campaign-codex", "data") || {};
    const members = await this.getGroupMembers(groupData.members);
    nestedData.membersByGroup[group.uuid] = members;
    for (const member of members) {
      await this._processEntity(member, nestedData, processedUuids, group);
    }
  }

  static async _processRegion(region, nestedData, processedUuids) {
    if (!nestedData.allRegions.find((r) => r.uuid === region.uuid))
      nestedData.allRegions.push(region);
    const regionDoc = await fromUuid(region.uuid);
    const regionData = regionDoc.getFlag("campaign-codex", "data") || {};
    nestedData.locationsByRegion[region.uuid] = [];

    for (const locationUuid of regionData.linkedLocations || []) {
      const locationDoc = await fromUuid(locationUuid).catch(() => null);
      if (!locationDoc) continue;

      // Corrected: Define locationData here.
      const locationData = locationDoc.getFlag("campaign-codex", "data") || {};

      const locationInfo = {
        uuid: locationDoc.uuid,
        name: locationDoc.name,
        img: locationDoc.getFlag("campaign-codex", "image") || locationDoc.img,
        type: "location",
        npcCount: (locationData.linkedNPCs || []).length,
        shopCount: (locationData.linkedShops || []).length,
      };
      nestedData.locationsByRegion[region.uuid].push(locationInfo);
      await this._processEntity(
        locationInfo,
        nestedData,
        processedUuids,
        region,
        locationInfo,
      );
    }
  }

  static async _processLocation(
    location,
    nestedData,
    processedUuids,
    parent,
    locationContext,
  ) {
    if (!nestedData.allLocations.find((l) => l.uuid === location.uuid)) {
      const locationDoc = await fromUuid(location.uuid).catch(() => null);
      if (locationDoc) {
        const region = await CampaignCodexLinkers.getLinkedRegion(locationDoc);
        location.region = region?.name;
        const locationData =
          locationDoc.getFlag("campaign-codex", "data") || {};
        const locdirectNPCs = locationData.linkedNPCs || [];
        const locshopNPCs = await CampaignCodexLinkers.getShopNPCs(
          locationDoc,
          locationData.linkedShops || [],
        );
        const allNPCs = [...locdirectNPCs, ...locshopNPCs];
        location.npcCount = allNPCs.length;
        location.shopCount = (locationData.linkedShops || []).length;
      }
      nestedData.allLocations.push(location);
    }

    const locationDoc = await fromUuid(location.uuid);
    const locationData = locationDoc.getFlag("campaign-codex", "data") || {};

    nestedData.shopsByLocation[location.uuid] = [];
    for (const shopUuid of locationData.linkedShops || []) {
      const shopDoc = await fromUuid(shopUuid).catch(() => null);
      if (!shopDoc) continue;
      const shopInfo = {
        uuid: shopDoc.uuid,
        name: shopDoc.name,
        img: shopDoc.getFlag("campaign-codex", "image") || shopDoc.img,
        type: "shop",
      };
      nestedData.shopsByLocation[location.uuid].push(shopInfo);
      await this._processEntity(
        shopInfo,
        nestedData,
        processedUuids,
        location,
        locationContext,
      );
    }

    nestedData.npcsByLocation[location.uuid] = [];
    for (const npcUuid of locationData.linkedNPCs || []) {
      const npcInfo = { uuid: npcUuid, type: "npc" };
      await this._processEntity(
        npcInfo,
        nestedData,
        processedUuids,
        location,
        locationContext,
      );
    }
  }

  static async _processShop(
    shop,
    nestedData,
    processedUuids,
    parent,
    locationContext,
  ) {
    if (!nestedData.allShops.find((s) => s.uuid === shop.uuid)) {
      nestedData.allShops.push(shop);
    }
    const shopDoc = await fromUuid(shop.uuid);
    const shopData = shopDoc.getFlag("campaign-codex", "data") || {};

    nestedData.npcsByShop[shop.uuid] = [];
    for (const npcUuid of shopData.linkedNPCs || []) {
      const npcInfo = { uuid: npcUuid, type: "npc" };
      await this._processEntity(
        npcInfo,
        nestedData,
        processedUuids,
        shop,
        locationContext,
      );
    }

    const processedInventory = await CampaignCodexLinkers.getInventory(
      shopDoc,
      shopData.inventory || [],
    );

    nestedData.itemsByShop[shop.uuid] = [];
    for (const item of processedInventory) {
      const itemInfo = {
        uuid: item.itemUuid,
        name: item.name,
        img: item.img,
        type: "item",
        quantity: item.quantity,
        finalPrice: item.finalPrice,
        currency: item.currency,
      };
      nestedData.itemsByShop[shop.uuid].push(itemInfo);
      nestedData.allItems.push(itemInfo);
      nestedData.totalValue += itemInfo.finalPrice * item.quantity;
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
      if (!nestedData.npcsByLocation[parent.uuid])
        nestedData.npcsByLocation[parent.uuid] = [];
      if (
        !nestedData.npcsByLocation[parent.uuid].find(
          (n) => n.uuid === npcInfo.uuid,
        )
      ) {
        nestedData.npcsByLocation[parent.uuid].push(npcInfo);
      }
    } else if (parent?.type === "shop") {
      if (!nestedData.npcsByShop[parent.uuid])
        nestedData.npcsByShop[parent.uuid] = [];
      if (
        !nestedData.npcsByShop[parent.uuid].find((n) => n.uuid === npcInfo.uuid)
      ) {
        nestedData.npcsByShop[parent.uuid].push(npcInfo);
      }
    }
  }

  static async _createNPCInfo(npcDoc, parent, locationContext) {
    const npcData = npcDoc.getFlag("campaign-codex", "data") || {};
    const actor = npcData.linkedActor
      ? await fromUuid(npcData.linkedActor).catch(() => null)
      : null;

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

    return {
      uuid: npcDoc.uuid,
      name: npcDoc.name,
      img: npcDoc.getFlag("campaign-codex", "image") || actor?.img,
      type: "npc",
      source: sourceType,
      sourceLocation: sourceLocationName,
      sourceShop: sourceShopName,
      actor: actor
        ? {
            uuid: actor.uuid,
            name: actor.name,
            ac: actor.system?.attributes?.ac?.value || 10,
            hp: actor.system?.attributes?.hp || { value: 0, max: 0 },
            type: actor.type,
          }
        : null,
    };
  }

  static _removeDuplicates(array) {
    return array.filter(
      (item, index, self) =>
        index === self.findIndex((t) => t.uuid === item.uuid),
    );
  }
}
