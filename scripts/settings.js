export const MODULE_NAME = "campaign-codex";
export default async function campaigncodexSettings() {
  game.settings.register("campaign-codex", "useOrganizedFolders", {
    name: "Organise in Folders",
    hint: "Automatically create and organise Campaign Codex journals in folders",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
game.settings.register("campaign-codex", "itemPricePath", {
  name: "Item Price Path",
  hint: "Path to item price value (e.g., 'system.price.value' for D&D5e)",
  scope: "world",
  config: true,
  type: String,
  default: "system.price.value"
});

game.settings.register("campaign-codex", "itemDenominationPath", {
  name: "Item Currency Path", 
  hint: "Path to item currency denomination (e.g., 'system.price.denomination' for D&D5e)",
  scope: "world",
  config: true,
  type: String,
  default: "system.price.denomination"
});
game.settings.register("campaign-codex", "runonlyonce", { 
    name: "Welcome Message - Disabled",                  
    hint: "If On, you won't see the Welcome message",
    scope: "world",                                 
    config: true,                                   
    type: Boolean,
    default: false,                                 
  });
game.settings.register("campaign-codex", "resetItemPathsButton", {
  name: "Reset Item Paths to Defaults",
  hint: "Enable this option and save to reset item price and currency paths to D&D5e defaults (system.price.value and system.price.denomination)",
  scope: "world",
  config: true,
  type: Boolean,
  default: false,
  onChange: async (value) => {
    if (value) {
      await game.settings.set("campaign-codex", "itemPricePath", "system.price.value");
      await game.settings.set("campaign-codex", "itemDenominationPath", "system.price.denomination");
      
      await game.settings.set("campaign-codex", "resetItemPathsButton", false);
      
      ui.notifications.info("Item price paths reset to D&D5e defaults");
    }
  }
});
}