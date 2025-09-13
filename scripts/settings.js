export const MODULE_NAME = "campaign-codex";

export default async function campaigncodexSettings() {
    const localize = (key) => game.i18n.localize(`CAMPAIGN_CODEX.settings.${key}`);

    game.settings.register("campaign-codex", "itemPricePath", {
        name: localize("itemPricePath.name"),
        hint: localize("itemPricePath.hint"),
        scope: "world",
        config: true,
        type: String,
        default: "",
    });

    game.settings.register("campaign-codex", "itemDenominationPath", {
        name: localize("itemDenominationPath.name"),
        hint: localize("itemDenominationPath.hint"),
        scope: "world",
        config: true,
        type: String,
        default: "",
    });

    game.settings.register("campaign-codex", "itemDenominationOverride", {
        name: localize("itemDenominationOverride.name"),
        hint: localize("itemDenominationOverride.hint"),
        scope: "world",
        config: true,
        type: String,
        default: "",
    });

    game.settings.register("campaign-codex", "hideBaseCost", {
        name: localize("hideBaseCost.name"),
        hint: localize("hideBaseCost.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
    });

    game.settings.register("campaign-codex", "sortCardsAlpha", {
        name: localize("sortCardsAlpha.name"),
        hint: localize("sortCardsAlpha.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
    });

    game.settings.register("campaign-codex", "runonlyonce", {
        name: localize("runonlyonce.name"),
        hint: localize("runonlyonce.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: false,
    });

    game.settings.register("campaign-codex", "useOrganizedFolders", {
        name: localize("useOrganizedFolders.name"),
        hint: localize("useOrganizedFolders.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: true,
    });

    game.settings.register("campaign-codex", "hideByPermission", {
        name: localize("hideByPermission.name"),
        hint: localize("hideByPermission.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: false,
    });
    game.settings.register("campaign-codex", "hideInventoryByPermission", {
        name: localize("hideInventoryByPermission.name"),
        hint: localize("hideInventoryByPermission.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: false,
    });
    game.settings.register("campaign-codex", "resetItemPathsButton", {
        name: localize("resetItemPathsButton.name"),
        hint: localize("resetItemPathsButton.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: false,
        onChange: async (value) => {
            if (value) {
                await game.settings.set("campaign-codex", "itemPricePath", "");
                await game.settings.set("campaign-codex", "itemDenominationPath", "");
                await game.settings.set(
                    "campaign-codex",
                    "itemDenominationOverride",
                    "",
                );
                await game.settings.set(
                    "campaign-codex",
                    "resetItemPathsButton",
                    false,
                );

                ui.notifications.info(game.i18n.localize("CAMPAIGN_CODEX.notifications.itemPricePathsReset"));
            }
        },
    });
}

