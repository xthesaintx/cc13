export const MODULE_NAME = "campaign-codex";
export default async function campaigncodexSettings() {

game.settings.register("campaign-codex", "itemPricePath", {
  name: "Override Item Price Path",
  hint: "Path to item price value (e.g., 'system.price.value' for D&D5e). Leave blank to use detected system.",
  scope: "world",
  config: true,
    requiresReload: true,
  type: String,
  default: ""
});
game.settings.register("campaign-codex", "itemDenominationPath", {
  name: "Override Item Currency Path", 
  hint: "Path to item currency denomination (e.g., 'system.price.denomination' for D&D5e). Leave blank to use detected system.",
  scope: "world",
  config: true,
    requiresReload: true,
  type: String,
  default: ""
});
game.settings.register("campaign-codex", "itemDenominationOverride", {
  name: "Override Denomination", 
  hint: "Currency Denomination (e.g., credits, gp, units). Leave blank to use Item Currency Path or detected system. Campaign Codex will automatically detect the value and denomination for items based on the active game system (e.g., Dungeons and Dragons 5e, Pathfinder 2e, Starfinder, Savage Worlds Adventure Edition, Pathfinder 1e, Old-School Essentials and Daggerheart).",
  scope: "world",
  config: true,
    requiresReload: true,
  type: String,
  default: ""
});
game.settings.register("campaign-codex", "hideBaseCost", {
    name: "Hide the Base cost column",
    hint: "If you don't want the base cost visible, or the system doesn't have a price path you can set this to hide the column in the inventory tab. Close and reopen sheets to update.",
    scope: "world",
    config: true,
    // requiresReload: true,
    type: Boolean,
    default: false
  });
game.settings.register("campaign-codex", "runonlyonce", { 
    name: "Welcome Message - Disabled",                  
    hint: "If On, you won't see the Welcome message",
    scope: "world",                                 
    config: true,   
      requiresReload: true,                                
    type: Boolean,
    default: false,                                 
  });
  game.settings.register("campaign-codex", "useOrganizedFolders", {
    name: "Organise in Folders",
    hint: "Automatically create and organise Campaign Codex journals in folders",
    scope: "world",
    config: true,
      requiresReload: true,
    type: Boolean,
    default: true
  });
game.settings.register("campaign-codex", "resetItemPathsButton", {
  name: "Reset Item Paths to Defaults",
  hint: "Enable this option and save to reset item price and currency paths to D&D5e defaults (system.price.value and system.price.denomination)",
  scope: "world",
  config: true,
  requiresReload: true,
  type: Boolean,
  default: false,
  onChange: async (value) => {
    if (value) {
      await game.settings.set("campaign-codex", "itemPricePath", "");
      await game.settings.set("campaign-codex", "itemDenominationPath", "");
      await game.settings.set("campaign-codex", "itemDenominationOverride", "");      
      await game.settings.set("campaign-codex", "resetItemPathsButton", false);
      
      ui.notifications.info("Item price paths reset to D&D5e defaults");
    }
  }
});


}

