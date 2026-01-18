import { CampaignCodexLinkers } from "./sheets/linkers.js";

export class CampaignCodexJournalConverter {
  /**
   * Export a Campaign Codex journal to a standard Foundry journal
   * @param {JournalEntry} sourceJournal - The Campaign Codex journal to export
   * @param {Object} options - Export options
   * @returns {Promise<JournalEntry>} The created standard journal
   */
static async exportToStandardJournal(sourceJournal, options = {}) {
    try {
      const ccType = sourceJournal.getFlag("campaign-codex", "type");
      if (!ccType) {
        ui.notifications.warn("This journal is not a Campaign Codex document");
        return null;
      }

      const ccData = sourceJournal.getFlag("campaign-codex", "data") || {};
      const customImage = sourceJournal.getFlag("campaign-codex", "image");

      const pages = await this._generateStandardContent(
        sourceJournal,
        ccType,
        ccData,
      );

      const standardJournalData = {
        name: options.customName || sourceJournal.name,
        img: customImage || sourceJournal.img,
        pages: pages,
        flags: {
          "campaign-codex": {
            exportedFrom: {
              originalUuid: sourceJournal.uuid,
              originalName: sourceJournal.name,
              originalType: ccType,
              exportedAt: Date.now(),
            },
          },
        },
      };

      if (options.folderId === null) {
        standardJournalData.folder = null;
      } else if (options.folderId) {
        standardJournalData.folder = options.folderId;
      } else if (sourceJournal.folder) {
        standardJournalData.folder = sourceJournal.folder.id;
      }

      const newJournal = await JournalEntry.create(standardJournalData);

      ui.notifications.info(
        `Exported "${sourceJournal.name}" to standard journal`,
      );

      if (options.openAfterExport !== false) {
        newJournal.sheet.render(true);
      }

      return newJournal;
    } catch (error) {
      console.error("Campaign Codex | Export failed:", error);
      ui.notifications.error("Failed to export journal");
      return null;
    }
  }

static async _generateAdditionalContext(data, type) {
  if (!type) return null;

  let uuid;
  if (type === "location") {
    uuid = data.parentRegion;
  } else if (type === "shop") {
    uuid = data.linkedLocation;
  } else if ((["npc"].includes(type) && data.tagMode) || (["tag"].includes(type))) {
    return `Tag<hr>`;
  }

  if (uuid) {
    const uuidNameArray = await CampaignCodexLinkers.getNameFromUuids([uuid]);
    const uuidName = uuidNameArray[0] || "";
    return `@UUID[${uuid}]{${uuidName}}\n<hr>`;
  }

  return null;
}

static async _generateQuestsPage(data) {
    if (!data.quests || data.quests.length === 0) return null;

    let content = ``;
    for (const quest of data.quests) {
        content += `<h3>${quest.title}</h3>\n`;
        content += `${quest.description}\n`;
      if (quest.inventory && quest.inventory.length > 0) {
        const itemUuids = quest.inventory.map(item => item.itemUuid);
        const questInventory = await CampaignCodexLinkers.getNameFromUuids(itemUuids || []);
        content += `<h4>Rewards</h4>\n<ul>\n`;
        for (const questItem of questInventory) {
          content += `<li>${questItem}</li>\n`;
        }
        content += `</ul>\n`;
        }
        if (quest.objectives && quest.objectives.length > 0) {
        content += `<h4>Objectives</h4>\n<ul>\n`;
        for (const objective of quest.objectives) {
          content += `<li>${objective.completed ? "[x]" : "[ ]"} ${objective.text}</li>\n`;
          if (objective.objectives && objective.objectives.length > 0) {
            content += `<ul>`;
            for (const subobjective of objective.objectives) {
              content += `<li>${subobjective.completed ? "[x]" : "[ ]"} ${subobjective.text}</li>\n`;
            }
            content += `</ul>\n`;
          }
        }
        content += `</ul>\n`;
      }
    }
    content += `\n`;
    return {
        name: "Quests",
        type: "text",
        text: { content: content, format: 1 },
    };
}


static async _generateStandardContent(journal, type, data) {
    const pages = [];
    let mainContent = '';
    const additionalContext = await this._generateAdditionalContext(data, type);
    if (additionalContext) {
      mainContent += additionalContext;
    }
    if (data.description) {
        mainContent += `<br><hr><br>${data.description}`;
    }
    pages.push({
        name: "Overview",
        type: "text",
        text: { content: mainContent, format: 1 },
    });

    const contentGenerators = {
        location: this._generateLocationContent,
        shop: this._generateShopContent,
        npc: this._generateNPCContent,
        region: this._generateRegionContent,
        default: this._generateGenericContent,
    };
    
    const additionalPages = await (contentGenerators[type] || contentGenerators.default).bind(this)(data);
    pages.push(...additionalPages);

    return pages;
}


static async _generateLinkListPage(title, uuids) {
    if (!uuids || uuids.length === 0) return null;

    let content = ``;
    const docs = (await Promise.all(uuids.map((uuid) => fromUuid(uuid)))).filter(Boolean);

    for (const doc of docs) {
        const tagged = doc.getFlag("campaign-codex", "data");
        const type = doc.getFlag("campaign-codex", "type");
        let taggedText = '';
        if (tagged && ((tagged.tagMode && ["npc"].includes(type)) || ["tag"].includes(type))) {
            taggedText = ' [TAG]';
        }
        content += `<li>@UUID[${doc.uuid}]{${doc.name}}${taggedText}</li>\n`;
    }
    content += `</ul>\n\n`;

    return {
        name: title,
        type: "text",
        text: { content: content, format: 1 },
    };
}

  static async _generateLocationContent(data) {
    const pages = [];
    pages.push(await this._generateLinkListPage("NPCs", data.linkedNPCs));
    pages.push(await this._generateLinkListPage("Shops", data.linkedShops));
    pages.push(await this._generateQuestsPage(data));
    if (data.notes) {
        pages.push({
            name: "GM Notes",
            type: "text",
            text: { content: `${data.notes}\n\n`, format: 1 },
        });
    }
    return pages.filter(Boolean);
  }

 static async _generateShopContent(data) {
    const pages = [];
    pages.push(await this._generateLinkListPage("NPCs", data.linkedNPCs));
    pages.push(await this._generateQuestsPage(data));

    if (data.inventory && data.inventory.length > 0) {
        let content = ``;
        content += `<p><strong>Markup:</strong> ${data.markup || 1.0}x base price</p>\n`;
        content += `<table style="width: 100%; border-collapse: collapse;">\n`;
        content += `<tr style="background: #f0f0f0;"><th style="border: 1px solid #ccc; padding: 8px;">Item</th><th style="border: 1px solid #ccc; padding: 8px;">Quantity</th><th style="border: 1px solid #ccc; padding: 8px;">Price</th></tr>\n`;

        const itemPromises = data.inventory.map((itemData) => fromUuid(itemData.itemUuid));
        const items = (await Promise.all(itemPromises)).filter(Boolean);

        for (const item of items) {
            const itemData = data.inventory.find((i) => i.itemUuid === item.uuid);
            const basePrice = item.system.price?.value || 0;
            const currency = item.system.price?.denomination || "gp";
            const finalPrice = itemData.customPrice ?? basePrice * (data.markup || 1.0);

            content += `<tr>`;
            content += `<td style="border: 1px solid #ccc; padding: 8px;">@UUID[${item.uuid}]{${item.name}}</td>`;
            content += `<td style="border: 1px solid #ccc; padding: 8px;">${itemData.quantity || 1}</td>`;
            content += `<td style="border: 1px solid #ccc; padding: 8px;">${finalPrice.toFixed(2)} ${currency}</td>`;
            content += `</tr>\n`;
        }
        content += `</table>\n\n`;
        pages.push({
            name: "Inventory",
            type: "text",
            text: { content: content, format: 1 },
        });
    }

    if (data.notes) {
        pages.push({
            name: "GM Notes",
            type: "text",
            text: { content: `${data.notes}\n\n`, format: 1 },
        });
    }
    return pages.filter(Boolean);
  }

  static async _generateNPCContent(data) {
    const pages = [];
    pages.push(await this._generateLinkListPage("Locations", data.linkedLocations));
    pages.push(await this._generateLinkListPage("Associated Shops", data.linkedShops));
    pages.push(await this._generateLinkListPage("Associates & Contacts", data.associates));
    pages.push(await this._generateQuestsPage(data));

    if (data.notes) {
        pages.push({
            name: "GM Notes",
            type: "text",
            text: { content: `${data.notes}\n\n`, format: 1 },
        });
    }
    return pages.filter(Boolean);
  }

  static async _generateRegionContent(data) {
    const pages = [];
    pages.push(await this._generateLinkListPage("Locations", data.linkedLocations));
    pages.push(await this._generateLinkListPage("Associated Shops", data.linkedShops));
    pages.push(await this._generateLinkListPage("Regions", data.linkedRegions));
    pages.push(await this._generateLinkListPage("NPCs", data.linkedNPCs));
    pages.push(await this._generateQuestsPage(data));
    if (data.notes) {
        pages.push({
            name: "GM Notes",
            type: "text",
            text: { content: `${data.notes}\n\n`, format: 1 },
        });
    }
    return pages.filter(Boolean);
  }


static async _generateGenericContent(data) {
    const pages = [];
    pages.push(await this._generateQuestsPage(data));
    if (data.notes) {
        pages.push({
            name: "Notes",
            type: "text",
            text: { content: `${data.notes}\n\n`, format: 1 },
        });
    }
    return pages.filter(Boolean);
  }

static async showExportDialog(sourceJournal) {
    const ccType = sourceJournal.getFlag("campaign-codex", "type");
    if (!ccType) {
        ui.notifications.warn("This journal is not a Campaign Codex document");
        return;
    }

    const folders = game.folders.filter((f) => f.type === "JournalEntry");
    const folderOptions = folders
        .map((f) => `<option value="${f.id}">${f.name}</option>`)
        .join("");

    const content = `
        <div class="form-group">
            <label>Export Name:</label>
            <input type="text" name="exportName" value="${sourceJournal.name} (Exported)" style="width: 100%;" />
        </div>
        <div class="form-group">
            <label>Target Folder:</label>
            <select name="folderId" style="width: 100%;">
                <option value="">-- Same as Original --</option>
                <option value="root">-- Root Directory --</option>
                ${folderOptions}
            </select>
        </div>
        <div class="form-group">
            <label>
                <input type="checkbox" name="openAfterExport" checked />
                Open exported journal after creation
            </label>
        </div>
        <div class="form-group">
            <p style="font-size: 12px; color: #666; margin: 8px 0;">
                <i class="fas fa-info-circle"></i> 
                This will create a standard Foundry journal with all Campaign Codex data formatted as HTML content.
            </p>
        </div>
    `;

    const dialogData = await foundry.applications.api.DialogV2.wait({
        window: { title: "Export to Standard Journal" },
        content,
        buttons: [
            {
                action: "export",
                icon: '<i class="fas fa-book"></i>',
                label: "Export",
                default: true,
                callback: (event, button) => {
                    return Object.fromEntries(new FormData(button.form));
                }
            },
            {
                action: "cancel",
                icon: '<i class="fas fa-times"></i>',
                label: "Cancel",
                callback: () => null
            }
        ],
        rejectClose: true
    }).catch(() => null);

    if (!dialogData) return null;
    const options = {
        namePrefix: "",
        openAfterExport: dialogData.openAfterExport === 'on',
    };

    if (dialogData.folderId === "root") {
        options.folderId = null;
    } else if (dialogData.folderId && dialogData.folderId !== "") {
        options.folderId = dialogData.folderId;
    }

    let customName = null;
    if (dialogData.exportName && dialogData.exportName.trim() !== "") {
        customName = dialogData.exportName.trim();
        options.namePrefix = "";
    }
    
    // Call the final export function and return its result.
    return await this.exportToStandardJournal(sourceJournal, {
        ...options,
        customName: customName,
    });
}

  static async batchExport(journals, options = {}) {
    const ccJournals = journals.filter((j) =>
      j.getFlag("campaign-codex", "type"),
    );

    if (ccJournals.length === 0) {
      ui.notifications.warn("No Campaign Codex journals selected");
      return [];
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    ui.notifications.info(
      `Exporting ${ccJournals.length} Campaign Codex journals...`,
    );

    for (const journal of ccJournals) {
      try {
        const exported = await this.exportToStandardJournal(journal, {
          ...options,
          openAfterExport: false,
        });

        if (exported) {
          results.push(exported);
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Failed to export ${journal.name}:`, error);
        errorCount++;
      }
    }

    if (errorCount === 0) {
      ui.notifications.info(`Successfully exported ${successCount} journals`);
    } else {
      ui.notifications.warn(
        `Exported ${successCount} journals with ${errorCount} errors`,
      );
    }

    return results;
  }
}
