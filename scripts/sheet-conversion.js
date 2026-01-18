import {confirmationDialog } from "./helper.js";

export class sheetConversion {
/**
   * Main entry point for migration when a sheet type changes.
   */
  static async updateRelationshipsOnTypeChange(convertedDoc, oldType, newType) {
    if (!newType || !oldType || newType === oldType) return;

    const normOld = oldType.toLowerCase();
    const normNew = newType.toLowerCase();
    const data = convertedDoc.getFlag("campaign-codex", "data") || {};

    const lossRules = {
        npc: {
            shop: ["linkedShops", "linkedLocations"],
            group: ["linkedShops", "linkedLocations"],
            location: ["linkedLocations"]
        },
        tag: {
            shop: ["linkedShops", "linkedLocations"],
            group: ["linkedShops", "linkedLocations"],
            location: ["linkedLocations"]
        },
        shop: {
            location: ["linkedLocation"],
            group: ["linkedLocation"]
        },
        location: {
            shop: ["linkedShops"],
            group: ["parentRegion", "linkedShops"]
        },
        region: {
            shop: ["parentRegions", "linkedRegions", "linkedLocations", "linkedShops"],
            location: ["parentRegions", "linkedRegions", "linkedLocations"], 
            group: ["parentRegions", "linkedRegions", "linkedLocations", "linkedShops"]
        }
    };

    const potentialLosses = lossRules[normOld]?.[normNew] || [];
    const actualLosses = potentialLosses.filter(field => {
        const val = data[field];
        return val && (Array.isArray(val) ? val.length > 0 : true);
    });

      if (actualLosses.length > 0) {
      const formatLabel = (str) => {
        let label = str.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
        return label.replace("Shops", "Entries").replace("Shop", "Entry");
      };

      const formatType = (t) => {
        let label = t.charAt(0).toUpperCase() + t.slice(1);
        return label.replace(/Shop/g, "Entry");
      };

      const listItems = actualLosses.map(field => `<li><strong>${formatLabel(field)}</strong></li>`).join("");
      const message = `
            <p style="margin-bottom: 0px;">Do you want to update this sheets data from <strong>${formatType(oldType)}</strong> to <strong>${formatType(newType)}</strong>?
            The following data types are not supported by the new sheet and will be <strong>lost</strong>:</p>
            <ul style="margin-top: 0px;margin-bottom: 0px;">${listItems}</ul>
        `;

      const proceed = await confirmationDialog(message);
      if (!proceed) return;
    }

    await this._migrateExternalLinks(convertedDoc, normOld, normNew);
    await this._migrateInternalLinks(convertedDoc, normOld, normNew);
  }

  /**
   * Updates other journals that reference the converted document.
   * Logic: Find the old reference -> Check if a valid field exists for the new type -> Move or Remove.
   */
  static async _migrateExternalLinks(convertedDoc, oldType, newType) {
    
    const getTargetField = (hostType, targetType) => {
      const map = {
        npc: {
          shop: "linkedShops",
          region: "linkedLocations",
          location: "linkedLocations",
          npc: "associates",
          tag: "associates"
        },
        tag: {
          shop: "linkedShops",
          region: "linkedLocations",
          location: "linkedLocations",
          npc: "associates",
          tag: "associates"
        },
        shop: {
          npc: "linkedNPCs",
          tag: "linkedNPCs",
          
          region: "linkedLocation", 
          location: "linkedLocation"
        },
        location: {
          shop: "linkedShops",
          npc: "linkedNPCs",
          tag: "linkedNPCs",
          
          region: "parentRegion" 
        },
        region: {
          shop: "linkedShops",
          npc: "linkedNPCs",
          tag: "linkedNPCs",
          location: "linkedLocations",
          region: "linkedRegions",
          
        },
        group: {
          tag: "linkedNPCs" 
        }
      };
      return map[hostType]?.[targetType];
    };

    const updates = [];
    const allJournals = game.journal.filter(j => j.getFlag("campaign-codex", "type"));

    for (const journal of allJournals) {
      if (journal.uuid === convertedDoc.uuid) continue;

      const hostType = journal.getFlag("campaign-codex", "type")?.toLowerCase();
      if (!hostType) continue;

      const data = journal.getFlag("campaign-codex", "data") || {};
      let changed = false;
      let newData = foundry.utils.deepClone(data);

      
      const oldFieldName = getTargetField(hostType, oldType);
      
      
      
      if (!oldFieldName) continue;

      
      let isPresent = false;
      const isOldArray = Array.isArray(newData[oldFieldName]);
      
      if (isOldArray) {
        if (newData[oldFieldName].some(u => (u.uuid || u) === convertedDoc.uuid)) isPresent = true;
      } else {
        if ((newData[oldFieldName]?.uuid || newData[oldFieldName]) === convertedDoc.uuid) isPresent = true;
      }

      if (isPresent) {
        
        const newFieldName = getTargetField(hostType, newType);

        
        if (isOldArray) {
          newData[oldFieldName] = newData[oldFieldName].filter(u => (u.uuid || u) !== convertedDoc.uuid);
        } else {
          newData[oldFieldName] = null;
        }
        changed = true; 

        
        if (newFieldName) {
           
           if (Array.isArray(newData[newFieldName]) || (newFieldName.includes("linked") && newFieldName !== "linkedLocation")) {
             if (!newData[newFieldName]) newData[newFieldName] = [];
             
             if (!newData[newFieldName].some(u => (u.uuid || u) === convertedDoc.uuid)) {
                newData[newFieldName].push(convertedDoc.uuid);
             }
           } 
           
           else {
             
             newData[newFieldName] = convertedDoc.uuid;
           }
           console.log(`Campaign Codex | Moved link in ${journal.name}: ${oldFieldName} -> ${newFieldName}`);
        } else {
           console.log(`Campaign Codex | Removed link in ${journal.name}: No slot for ${newType}`);
        }
      }

      if (changed) {
        updates.push({ _id: journal.id, "flags.campaign-codex.data": newData });
      }
    }

    if (updates.length > 0) {
      await JournalEntry.updateDocuments(updates);
    }
  }

  /**
   * Updates the converted document's own data fields.
   * Logic: Iterate defined rules -> Move or Split data.
   */
  static async _migrateInternalLinks(convertedDoc, oldType, newType) {
    const data = foundry.utils.deepClone(convertedDoc.getFlag("campaign-codex", "data") || {});
    let changed = false;

    
    const move = (sourceField, targetField, isTargetArray = true) => {
      const val = data[sourceField];
      if (!val || (Array.isArray(val) && val.length === 0)) return;

      const items = Array.isArray(val) ? val : [val];
      
      if (targetField) {
        if (isTargetArray) {
          if (!data[targetField]) data[targetField] = [];
          const current = new Set(data[targetField]);
          items.forEach(i => current.add(i));
          data[targetField] = [...current];
        } else {
          
          if (!data[targetField] && items.length > 0) data[targetField] = items[0];
        }
      }
      
      
      data[sourceField] = null; 
      changed = true;
    };

    
    const splitLocations = async (sourceField) => {
      const uuids = data[sourceField];
      if (!uuids || !Array.isArray(uuids) || uuids.length === 0) return;

      const regions = [];
      const locations = [];

      
      for (const uuid of uuids) {
        const doc = await fromUuid(uuid).catch(() => null);
        if (!doc) continue;
        const type = doc.getFlag("campaign-codex", "type");
        if (type === "region") regions.push(uuid);
        else if (type === "location") locations.push(uuid);
      }

      
      if (regions.length > 0) {
        data.linkedRegions = [...(data.linkedRegions || []), ...regions];
      }
      if (locations.length > 0) {
        data.linkedLocations = [...(data.linkedLocations || []), ...locations];
      }

      
      data[sourceField] = null;
      changed = true;
    };

    
    
    

    
    if (["npc", "tag"].includes(oldType)) {
      if (newType === "shop" || newType === "group") {
        
        if (data.linkedShops) { data.linkedShops = null; changed = true; }
        if (data.linkedLocations) { data.linkedLocations = null; changed = true; }
        if (newType === "shop") move("associates", "linkedNPCs");
        if (newType === "group") move("associates", "linkedNPCs"); 
      }
      else if (["npc", "tag"].includes(newType)) {
        
      }
      else if (newType === "location") {
        
        
        if (data.linkedLocations) { data.linkedLocations = null; changed = true; }
        move("associates", "linkedNPCs");
      }
      else if (newType === "region") {
        
        
        await splitLocations("linkedLocations");
        move("associates", "linkedNPCs");
      }
    }

    
    else if (oldType === "shop") {
      if (["npc", "tag"].includes(newType)) {
        move("linkedNPCs", "associates");
        move("linkedLocation", "linkedLocations", true); 
      }
      else if (newType === "location") {
        
        
        if (data.linkedLocation) { data.linkedLocation = null; changed = true; }
      }
      else if (newType === "region") {
        
        move("linkedLocation", "linkedLocations", true); 
      }
      else if (newType === "group") {
        
        if (data.linkedLocation) { data.linkedLocation = null; changed = true; }
      }
    }

    
    else if (oldType === "location") {
      if (["npc", "tag"].includes(newType)) {
        move("linkedNPCs", "associates");
        move("parentRegion", "linkedLocations", true); 
        
      }
      else if (newType === "shop") {
        
        move("parentRegion", "linkedLocation", false); 
        if (data.linkedShops) { data.linkedShops = null; changed = true; }
      }
      else if (newType === "region") {
        
        move("parentRegion", "parentRegions", true); 
        
      }
      else if (newType === "group") {
        
        if (data.parentRegion) { data.parentRegion = null; changed = true; }
        if (data.linkedShops) { data.linkedShops = null; changed = true; }
      }
    }

    
    else if (oldType === "region") {
      if (["npc", "tag"].includes(newType)) {
        move("parentRegions", "linkedLocations");
        move("linkedRegions", "linkedLocations"); 
        move("linkedNPCs", "associates");
        
        
      }
      else if (newType === "shop") {
        
        if (data.parentRegions) { data.parentRegions = null; changed = true; }
        if (data.linkedRegions) { data.linkedRegions = null; changed = true; }
        if (data.linkedLocations) { data.linkedLocations = null; changed = true; }
        if (data.linkedShops) { data.linkedShops = null; changed = true; }
        
      }
      else if (newType === "location") {
        
        if (data.parentRegions) { data.parentRegions = null; changed = true; }
        if (data.linkedRegions) { data.linkedRegions = null; changed = true; }
        if (data.linkedLocations) { data.linkedLocations = null; changed = true; }
        
        
      }
      else if (newType === "group") {
        
        if (data.parentRegions) { data.parentRegions = null; changed = true; }
        if (data.linkedRegions) { data.linkedRegions = null; changed = true; }
        if (data.linkedLocations) { data.linkedLocations = null; changed = true; }
        if (data.linkedShops) { data.linkedShops = null; changed = true; }
        
      }
    }

    
    else if (oldType === "group") {
      if (["npc", "tag"].includes(newType)) {
        move("linkedNPCs", "associates");
      }
      
    }

    if (changed) {
      await convertedDoc.setFlag("campaign-codex", "data", data);
    }
  }

}