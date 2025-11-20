import { CampaignCodexTokenPlacement } from "./token-placement.js";

export class NPCDropper {
  /**
   * Main entry point to drop NPCs to the current scene
   * @param {Array} npcs - Array of NPC objects with actor property
   * @param {Object} options - Options for the drop operation
   */
  static async dropNPCsToScene(npcs, options = {}) {
    if (!canvas.scene) {
      ui.notifications.warn("No scene is currently active!");
      return;
    }

    const npcsWithActors = [];

    for (const npc of npcs) {
      if (!npc.actor) {
        console.warn(
          `Campaign Codex | Skipping NPC ${npc.name} - no linked actor`,
        );
        continue;
      }

      const npcData = {
        ...npc,
        journal: await this._findNPCJournal(npc),
      };

      npcsWithActors.push(npcData);
    }

    if (npcsWithActors.length === 0) {
      ui.notifications.warn("No NPCs with linked actors found to drop!");
      return;
    }

    return this._showDropToMapDialog(npcsWithActors, options);
  }

  /**
   * Find the NPC journal for a given NPC object
   * @param {Object} npc - NPC object
   * @returns {Promise<JournalEntry|null>} The NPC journal or null
   */
  static async _findNPCJournal(npc) {
    if (!npc.actor) return null;

    const npcJournals = game.journal.filter((j) => {
      const npcData = j.getFlag("campaign-codex", "data");
      return (
        npcData &&
        npcData.linkedActor === npc.actor.uuid &&
        j.getFlag("campaign-codex", "type") === "npc"
      );
    });

    return npcJournals[0] || null;
  }



/**
   * Shows the NPC selection dialog
   * @param {Array} npcs - NPCs to show in dialog
   * @param {Object} options - Dialog options
   */
  static async _showDropToMapDialog(npcs, options = {}) {
    const content = `
      <div class="drop-to-map-dialog">
        <p>Select NPCs to place onto the current scene:</p>
        <div class="npc-selection" style="max-height: 300px; overflow-y: auto;">
          ${npcs
            .map(
              (npc) => `
            <label>
              <input type="checkbox" name="selected-npcs" value="${npc.uuid || npc.id}" checked style="margin-right: 8px;">
              <img src="${npc.img}" alt="${npc.name}" style="width: 32px; height: 32px; border-radius: 4px; margin-right: 8px;">
              <span style="font-weight: 600;">${npc.name}</span>
              ${npc.actor.type === "character" ? '<span style="margin-left: 8px; font-size: 8px; padding: 2px 6px;">PLAYER</span>' : ""}
              ${npc.actor.pack ? '<span style="margin-left: 8px; font-size: 8px; padding: 2px 6px;">COMPENDIUM</span>' : ""}
            </label>
          `,
            )
            .join("")}
        </div>
        ${
          options.showHiddenToggle !== false
            ? `
          <div style="margin-top: 12px;">
            <label style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" name="start-hidden">
              <span>Start tokens hidden</span>
            </label>
          </div>
        `
            : ""
        }
        <div class="cc-info">
          <ul>
            <li><strong>Rotate:</strong> Scroll wheel to rotate tokens</li>
            <li><strong>Grid Snap:</strong> Hold shift to disable snapping</li>
            <li><strong>Skip Tokens:</strong> Right-click to skip unwanted NPCs</li>
          </ul>
        </div>
      </div>
    `;

    const dialogData = await foundry.applications.api.DialogV2.wait({
      window: { title: options.title || "Drop NPCs to Map" },
      classes: ['campaign-codex npc-dropper' ],
      content,
      buttons: [
          {
              action: "drop",
              icon: '<i class="fas fa-map"></i>',
              label: "Start Placing",
              default: true,
              callback: (event, button) => {
                    const form = button.form;
                    const selectedNPCs = Array.from(form.querySelectorAll('input[name="selected-npcs"]:checked')).map(cb => cb.value);
                    const startHidden = form.querySelector('input[name="start-hidden"]')?.checked ?? false;
                    return { selectedNPCs, startHidden };
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

    const { selectedNPCs: selectedNPCIds, startHidden } = dialogData;
    if (!selectedNPCIds) return;
    if (selectedNPCIds.length > 0) {
      const selectedNPCs = npcs.filter((npc) =>
        selectedNPCIds.includes(npc.uuid || npc.id),
      );

      return this._startTokenPlacement(selectedNPCs, {
        startHidden,
        ...options,
      });
    } else {
      ui.notifications.warn("No NPCs selected!");
      return { success: 0, failed: 0, imported: 0 };
    }
}



  /**
   * Starts the token placement workflow using Foundry's TokenPlacement system
   * @param {Array} npcData - Array of NPC objects with actor and journal info
   * @param {Object} options - Placement options
   */
  static async _startTokenPlacement(npcData, options = {}) {
    const { startHidden = false } = options;

    const preparedActors = [];
    const droppedCount = { success: 0, failed: 0, imported: 0 };

    ui.notifications.info(`Preparing ${npcData.length} NPCs for placement...`);

    for (const npcInfo of npcData) {
      try {
        let actor = await this._prepareActorForDrop(npcInfo);

        if (actor) {
          preparedActors.push(actor);
        } else {
          console.warn(
            `Campaign Codex | Could not prepare actor for NPC: ${npcInfo.name}`,
          );
          droppedCount.failed++;
        }
      } catch (error) {
        console.error(
          `Campaign Codex | Error preparing actor for NPC ${npcInfo.name}:`,
          error,
        );
        droppedCount.failed++;
      }
    }

    if (preparedActors.length === 0) {
      ui.notifications.warn("No actors could be prepared for placement!");
      return droppedCount;
    }

    return this._useTokenPlacement(
      preparedActors,
      { startHidden, ...options },
      droppedCount,
    );
  }

  /**
   * Prepare an actor for dropping, handling compendium imports and tracking
   * @param {Object} npcInfo - NPC info object with actor and journal references
   * @returns {Promise<Actor|null>} The prepared actor or null if failed
   */
  static async _prepareActorForDrop(npcInfo) {
    const { actor: originalActor, journal } = npcInfo;

    if (!originalActor) {
      console.warn(`Campaign Codex | NPC ${npcInfo.name} has no linked actor`);
      return null;
    }

    if (originalActor.pack) {
      const droppedTokenUuid = journal?.getFlag?.(
        "campaign-codex",
        "droppedTokenUuid",
      );

      if (droppedTokenUuid) {
        const existingActor = await fromUuid(droppedTokenUuid);
        if (existingActor && !existingActor.pack) {
          console.log(
            `Campaign Codex | Using existing imported actor: ${existingActor.name}`,
          );
          return existingActor;
        } else {
          if (journal) {
            await journal.unsetFlag("campaign-codex", "droppedTokenUuid");
          }
        }
      }

      console.log(
        `Campaign Codex | Importing actor ${originalActor.name} from compendium`,
      );
      const importedActors = await Actor.createDocuments([
        originalActor.toObject(),
      ]);
      const importedActor = importedActors[0];

      if (journal && importedActor) {
        await journal.setFlag(
          "campaign-codex",
          "droppedTokenUuid",
          importedActor.uuid,
        );
        console.log(
          `Campaign Codex | Set droppedTokenUuid flag for ${journal.name}: ${importedActor.uuid}`,
        );
      }

      return importedActor;
    }

    return originalActor;
  }

  /**
   * Uses Foundry's TokenPlacement system for interactive placement
   * @param {Array} actors - Prepared actors to place
   * @param {Object} options - Placement options
   * @param {Object} droppedCount - Running count of results
   */
  static async _useTokenPlacement(actors, options, droppedCount) {
    const { startHidden = false } = options;

    try {
      ui.notifications.info(
        `Click on the canvas to place ${actors.length} NPCs. Drag to position, scroll to rotate, click to confirm, right-click to skip.`,
      );

      const prototypeTokens = actors.map((actor) => actor.prototypeToken);

      const placements = await CampaignCodexTokenPlacement.place({
        tokens: prototypeTokens,
      });

      if (!placements || placements.length === 0) {
        ui.notifications.info("Token placement cancelled.");
        return droppedCount;
      }

      const tokensData = [];

      for (const placement of placements) {
        try {
          const actor = placement.prototypeToken.actor;

          if (startHidden) {
            placement.hidden = true;
          }

          const appendNumber =
            !placement.prototypeToken.actorLink &&
            placement.prototypeToken.appendNumber;

          delete placement.prototypeToken;

          const tokenDocument = await actor.getTokenDocument(placement);

          if (appendNumber) {
            CampaignCodexTokenPlacement.adjustAppendedNumber(
              tokenDocument,
              placement,
            );
          }

          tokensData.push(tokenDocument.toObject());
          droppedCount.success++;
        } catch (error) {
          console.error(`Campaign Codex | Error processing placement:`, error);
          droppedCount.failed++;
        }
      }

      if (tokensData.length > 0) {
        await canvas.scene.createEmbeddedDocuments("Token", tokensData);
      }

      this._showResults(droppedCount);
      return droppedCount;
    } catch (error) {
      console.error(`Campaign Codex | Error in TokenPlacement:`, error);
      ui.notifications.error(
        "Token placement failed. Check console for details.",
      );
      droppedCount.failed += actors.length;
      return droppedCount;
    }
  }

  /**
   * Shows result notifications
   * @param {Object} droppedCount - Results object
   */
  static _showResults(droppedCount) {
    let message = `Dropped ${droppedCount.success} NPCs to scene`;
    if (droppedCount.imported > 0) {
      message += ` (imported ${droppedCount.imported} from compendiums)`;
    }
    if (droppedCount.failed > 0) {
      message += `. ${droppedCount.failed} failed.`;
    }

    if (droppedCount.success > 0) {
      ui.notifications.info(message);
    } else {
      ui.notifications.warn("No NPCs were successfully dropped to the scene.");
    }
  }

  /**
   * Quick drop method - drops all NPCs without dialog, uses placement system
   * @param {Array} npcs - Array of NPC objects
   * @param {Object} options - Drop options
   */
  static async quickDrop(npcs, options = {}) {
    if (!canvas.scene) {
      ui.notifications.warn("No scene is currently active!");
      return;
    }

    const npcsWithActors = [];

    for (const npc of npcs) {
      if (!npc.actor) {
        console.warn(
          `Campaign Codex | Skipping NPC ${npc.name} - no linked actor`,
        );
        continue;
      }

      const npcData = {
        ...npc,
        journal: await this._findNPCJournal(npc),
      };

      npcsWithActors.push(npcData);
    }

    if (npcsWithActors.length === 0) {
      ui.notifications.warn("No NPCs with linked actors found to drop!");
      return;
    }

    return this._startTokenPlacement(npcsWithActors, {
      startHidden: false,
      ...options,
    });
  }
}
