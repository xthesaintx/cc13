const MODULE_NAME = "campaign-codex";
const { NumberField } = foundry.data.fields;
var ApplicationV2 = foundry.applications.api.ApplicationV2;
var HandlebarsApplicationMixin = foundry.applications.api.HandlebarsApplicationMixin;
const CoreSettingsSubmenuApp = HandlebarsApplicationMixin((ApplicationV2));

const GENERAL_SETTING_KEYS = [
    "sortCardsAlpha",
    "useOrganizedFolders",
    "maxRegionDepth",
    "showStats",
    "showActorDropperDialog",
    "useStyledTocButton"
];

const ECONOMY_SETTING_KEYS = [
    "playerCurrencyPath",
    "itemPricePath",
    "itemDenominationPath",
    "itemDenominationOverride",
    "allowPlayerPurchasing",
    "allowPlayerLooting",
    "addPurchaseFundsToInventoryCash",
    "enableTransactionLogging",
    "roundFinalPrice"
];

const PERMISSION_SETTING_KEYS = [
    "allowPlayerNotes",
    "hideCCbutton",
    "hideByPermission",
    "hideInventoryByPermission"
];

const MAP_MARKER_SETTING_KEYS = [
    "mapMarkers",
    "mapMarkersHoverDelay",
    "mapMarkersHover",
    "mapMarkerColor",
    "mapMarkerOverride"
];

const MENU_SETTINGS_BY_ID = {
    "campaign-codex-core-general-settings": GENERAL_SETTING_KEYS,
    "campaign-codex-core-economy-settings": ECONOMY_SETTING_KEYS,
    "campaign-codex-core-permission-settings": PERMISSION_SETTING_KEYS,
    "campaign-codex-core-map-marker-settings": MAP_MARKER_SETTING_KEYS
};

class CampaignCodexCoreSettingsMenu extends CoreSettingsSubmenuApp {
    static settingKeys = [];
    static menuId = "campaign-codex-core-settings-menu";
    static menuTitle = "Campaign Codex Settings";
    static menuDescription = "";
    static menuIcon = "fa-solid fa-sliders";

    static get DEFAULT_OPTIONS() {
        return {
            tag: "form",
            id: this.menuId,
            classes: ["campaign-codex", "campaign-codex-settings-submenu"],
            window: {
                icon: this.menuIcon,
                title: this.menuTitle,
                contentClasses: ["standard-form"],
                resizable: true
            },
            position: { width: 620, height: "auto" },
            form: {
                handler: function (event, form, formData) {
                    return CampaignCodexCoreSettingsMenu.onSubmitForm.call(this, event, form, formData);
                },
                closeOnSubmit: true,
                submitOnChange: false
            },
            actions: {
                cancel: function (event) {
                    event.preventDefault();
                    this.close();
                }
            }
        };
    }

    static PARTS = {
        form: {
            template: "modules/campaign-codex/templates/settings-submenu.hbs"
        },
        footer: {
            template: "templates/generic/form-footer.hbs"
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const settings = this.constructor.settingKeys
            .map((key) => this.#prepareSettingContext(key))
            .filter(Boolean);

        context.description = this.constructor.menuDescription;
        context.settings = settings;
        context.hasSettings = settings.length > 0;
        context.buttons = this.#getButtons();
        return context;
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        const root = this.element;
        if (!root) return;

        const sliders = root.querySelectorAll("input[type='range'][data-range-output]");
        for (const slider of sliders) {
            const output = root.querySelector(`#${slider.dataset.rangeOutput}`);
            if (!output) continue;
            const sync = () => {
                output.textContent = slider.value;
            };
            slider.addEventListener("input", sync);
            sync();
        }
    }

    #prepareSettingContext(key) {
        const setting = game.settings.settings.get(`${MODULE_NAME}.${key}`);
        if (!setting) return null;

        const id = `${MODULE_NAME}-${key}`.replace(/[^a-zA-Z0-9_-]/g, "-");
        const choices = typeof setting.choices === "function" ? setting.choices() : setting.choices;
        const numberData = this.#getNumberBounds(setting);
        const isBoolean = setting.type === Boolean;
        const isSelect = !isBoolean && !!choices;
        const hasImplicitRange = !setting.range && setting.type instanceof NumberField && numberData.hasMin && numberData.hasMax;
        const isRange = !isBoolean && !isSelect && (Boolean(setting.range) || hasImplicitRange);
        const isNumber = !isBoolean && !isSelect && !isRange && this.#isNumberSetting(setting);
        const value = game.settings.get(MODULE_NAME, key);

        return {
            id,
            key,
            name: setting.name,
            hint: setting.hint,
            value,
            isBoolean,
            isSelect,
            isRange,
            isNumber,
            isText: !isBoolean && !isSelect && !isRange && !isNumber,
            choices: isSelect
                ? Object.entries(choices).map(([choiceValue, label]) => ({
                    value: choiceValue,
                    label,
                    selected: String(choiceValue) === String(value)
                }))
                : [],
            number: {
                min: numberData.min,
                hasMin: numberData.hasMin,
                max: numberData.max,
                hasMax: numberData.hasMax,
                step: numberData.step,
                hasStep: numberData.hasStep
            },
            range: isRange
                ? {
                    min: numberData.hasMin ? numberData.min : 0,
                    max: numberData.hasMax ? numberData.max : 100,
                    step: numberData.hasStep ? numberData.step : 1,
                    outputId: `${id}-value`
                }
                : null
        };
    }

    #isNumberSetting(setting) {
        return setting.type === Number || setting.type instanceof NumberField;
    }

    #getNumberBounds(setting) {
        const bounds = setting.range ?? setting.type?.options ?? {};
        const min = bounds?.min;
        const max = bounds?.max;
        const step = bounds?.step;

        return {
            min,
            hasMin: Number.isFinite(min),
            max,
            hasMax: Number.isFinite(max),
            step,
            hasStep: Number.isFinite(step)
        };
    }

    #getButtons() {
        return [
            {
                type: "button",
                action: "cancel",
                icon: "fa-solid fa-xmark",
                label: game.i18n.localize("Cancel")
            },
            {
                type: "submit",
                icon: "fa-solid fa-floppy-disk",
                label: game.i18n.localize("SETTINGS.Save")
            }
        ];
    }

    static async onSubmitForm(event, form, formData) {
        event.preventDefault();

        const app = this;
        const submitted = formData.object ?? {};
        const formElement = CampaignCodexCoreSettingsMenu.resolveFormElement(event, form, app);
        const formId = formElement?.id ?? app?.id ?? app?.options?.id ?? "";
        const settingKeys =
            MENU_SETTINGS_BY_ID[formId] ??
            CampaignCodexCoreSettingsMenu.resolveSettingKeysFromForm(formElement);
        let requiresReload = false;
        let requiresWorldReload = false;
        let changedCount = 0;

        for (const key of settingKeys) {
            const setting = game.settings.settings.get(`${MODULE_NAME}.${key}`);
            if (!setting) continue;

            let value = CampaignCodexCoreSettingsMenu.readFormValue(formElement, key, setting, submitted);
            const nextValue = CampaignCodexCoreSettingsMenu.coerceValue(setting, value);
            const currentValue = game.settings.get(MODULE_NAME, key);
            if (Object.is(currentValue, nextValue)) continue;

            await game.settings.set(MODULE_NAME, key, nextValue);
            changedCount += 1;
            if (setting.requiresReload) {
                requiresReload = true;
                if (setting.scope === "world") requiresWorldReload = true;
            }
        }

        if (changedCount > 0) {
            ui.notifications.info("Campaign Codex settings saved.");
        } else {
            ui.notifications.info("No Campaign Codex setting changes detected.");
        }
        if (requiresReload) {
            foundry.applications.settings.SettingsConfig.reloadConfirm({ world: requiresWorldReload });
        }
    }

    static resolveFormElement(event, form, app) {
        if (form instanceof HTMLFormElement) return form;
        if (form?.form instanceof HTMLFormElement) return form.form;
        if (app?.form instanceof HTMLFormElement) return app.form;
        if (event?.currentTarget instanceof HTMLFormElement) return event.currentTarget;
        if (event?.target?.form instanceof HTMLFormElement) return event.target.form;
        if (typeof event?.target?.closest === "function") return event.target.closest("form");
        return null;
    }

    static resolveSettingKeysFromForm(formElement) {
        const keys = new Set();
        const elements = formElement?.querySelectorAll?.("[name]") ?? [];
        for (const element of elements) {
            const key = element?.name;
            if (!key) continue;
            if (!game.settings.settings.has(`${MODULE_NAME}.${key}`)) continue;
            keys.add(key);
        }
        return [...keys];
    }

    static readFormValue(form, key, setting, submitted) {
        const input = form?.querySelector?.(`[name="${key}"]`);
        if (input) {
            if (input.type === "checkbox") return Boolean(input.checked);
            return input.value;
        }

        if (setting.type === Boolean) return key in submitted ? Boolean(submitted[key]) : false;
        return submitted[key];
    }

    static coerceValue(setting, rawValue) {
        if (setting.type === Boolean) return Boolean(rawValue);

        const isNumber = setting.type === Number || setting.type instanceof NumberField || !!setting.range;
        if (isNumber) {
            const numeric = Number(rawValue);
            return Number.isNaN(numeric) ? setting.default : numeric;
        }

        if (rawValue === undefined || rawValue === null) return setting.default;
        return rawValue;
    }
}

export class CoreGeneralSettingsMenu extends CampaignCodexCoreSettingsMenu {
    static menuId = "campaign-codex-core-general-settings";
    static menuTitle = "Campaign Codex: General Settings";
    static menuDescription = "Core behavior, UI toggles, and general gameplay options.";
    static menuIcon = "fa-solid fa-sliders";
    static settingKeys = GENERAL_SETTING_KEYS;
}

export class CoreEconomySettingsMenu extends CampaignCodexCoreSettingsMenu {
    static menuId = "campaign-codex-core-economy-settings";
    static menuTitle = "Campaign Codex: Economy Settings";
    static menuDescription = "Currency paths, purchasing behavior, and inventory controls.";
    static menuIcon = "fa-solid fa-coins";
    static settingKeys = ECONOMY_SETTING_KEYS;
}

export class CorePermissionSettingsMenu extends CampaignCodexCoreSettingsMenu {
    static menuId = "campaign-codex-core-permission-settings";
    static menuTitle = "Campaign Codex: Player Visibility Settings";
    static menuDescription = "Permission controls.";
    static menuIcon = "fa-solid fa-eye";
    static settingKeys = PERMISSION_SETTING_KEYS;
}



export class CoreMapMarkerSettingsMenu extends CampaignCodexCoreSettingsMenu {
    static menuId = "campaign-codex-core-map-marker-settings";
    static menuTitle = "Campaign Codex: Map Marker Settings";
    static menuDescription = "Map marker visibility, hover behavior, and color controls.";
    static menuIcon = "fa-solid fa-map-marker-alt";
    static settingKeys = MAP_MARKER_SETTING_KEYS;
}
