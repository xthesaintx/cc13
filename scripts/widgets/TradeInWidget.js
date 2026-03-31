import { CampaignCodexWidget } from "./CampaignCodexWidget.js";
import { CampaignCodexLinkers } from "../sheets/linkers.js";
import { EconomyHelper } from "../economy-helper.js";
import { localize, getItemQuantityPath } from "../helper.js";
import { appendTransaction } from "../transaction-log.js";

export const TRADE_IN_SOCKET_ACTION = "tradeInWidgetTransaction";



const FLAG_OPERATORS = [
    { value: "eq", label: "=" },
    { value: "contains", label: "contains" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
];

const ITEM_SYSTEM_PATH_DICTIONARY_FILES = {
    dnd5e: "item-system-paths-by-type-dnd5e.json",
    pf2e: "item-system-paths-by-type-pf2e.json",
    fallout: "item-system-paths-by-type-fallout.json",
    daggerheart: "item-system-paths-by-type-daggerheart.json",
    sfrpg: "item-system-paths-by-type-sfrpg.json",
};

const EPSILON = 0.000001;
const EMPTY_OBJECT = Object.freeze({});
const ITEM_SYSTEM_PATHS_BY_SYSTEM_CACHE = new Map();
const ITEM_SYSTEM_PATHS_BY_SYSTEM_PROMISES = new Map();

function clampNumber(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.min(max, Math.max(min, numeric));
}

function toSafeString(value) {
    return String(value ?? "").trim();
}

function toNumberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function formatAmount(amount) {
    const rounded = Math.round(Number(amount || 0) * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function roundFundsAmount(amount) {
    const numeric = Number(amount || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric * 10000) / 10000;
}

function normalizeOperator(value) {
    const op = String(value || "eq").toLowerCase();
    return FLAG_OPERATORS.some((entry) => entry.value === op) ? op : "eq";
}

function humanizeTypeLabel(type) {
    const cleaned = String(type || "").replace(/[-_.]+/g, " ").trim();
    if (!cleaned) return "Unknown";
    return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getItemTypeOptions() {
    const baseTypes = foundry.documents?.BaseItem?.TYPES;
    let types = [];

    if (Array.isArray(baseTypes)) {
        types = baseTypes.map((entry) => String(entry));
    } else if (baseTypes instanceof Set) {
        types = [...baseTypes].map((entry) => String(entry));
    } else if (baseTypes && typeof baseTypes === "object") {
        types = Object.keys(baseTypes);
    }

    if (!types.length) {
        types = Object.keys(CONFIG?.Item?.typeLabels || {});
    }

    const unique = [...new Set(types.filter(Boolean))];

    return unique
        .map((type) => ({ value: type, label: humanizeTypeLabel(type) }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
}


function normalizeLookupKey(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
}

function normalizeBracketSegments(path) {
    const cleanPath = toSafeString(path);
    if (!cleanPath) return "";
    return cleanPath.replace(/\[[^\]]*\]/g, "[]");
}

function applyInputBracketSegments(templatePath, inputPath) {
    const template = toSafeString(templatePath);
    if (!template || !template.includes("[]")) return template;

    const bracketTokens = toSafeString(inputPath).match(/\[[^\]]*\]/g) || [];
    let tokenIndex = 0;

    return template.replace(/\[\]/g, () => {
        const token = bracketTokens[tokenIndex];
        tokenIndex += 1;
        return token || "[]";
    });
}

function getPathSuggestionsForInput(paths, inputPath) {
    const normalizedInput = normalizeBracketSegments(inputPath).toLowerCase();
    const hasInput = !!normalizedInput;

    const matched = (Array.isArray(paths) ? paths : []).filter((path) => {
        if (!hasInput) return true;
        return normalizeBracketSegments(path).toLowerCase().includes(normalizedInput);
    });

    return uniqueSortedPaths(matched.map((path) => applyInputBracketSegments(path, inputPath)));
}

function uniqueSortedPaths(paths) {
    if (!Array.isArray(paths)) return [];
    const unique = [...new Set(paths.map((path) => toSafeString(path)).filter(Boolean))];
    return unique.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

function normalizePathDictionary(rawDictionary) {
    if (!rawDictionary || typeof rawDictionary !== "object") return {};

    const normalized = {};
    for (const [typeKey, rawPaths] of Object.entries(rawDictionary)) {
        const cleanKey = toSafeString(typeKey);
        if (!cleanKey || !Array.isArray(rawPaths)) continue;
        normalized[cleanKey] = uniqueSortedPaths(rawPaths);
    }
    return normalized;
}


function getTypeLookupCandidates(type) {
    const itemType = toSafeString(type);
    if (!itemType) return [];

    const typeLabelKey = CONFIG?.Item?.typeLabels?.[itemType] || "";
    const localizedTypeLabel = typeLabelKey ? game.i18n.localize(typeLabelKey) : "";
    return [...new Set([
        itemType,
        humanizeTypeLabel(itemType),
        localizedTypeLabel,
        typeLabelKey,
    ].map((entry) => toSafeString(entry)).filter(Boolean))];
}

function collectTypePathsFromDictionary(itemType, dictionary) {
    if (!itemType || !dictionary || typeof dictionary !== "object") return [];

    const candidates = getTypeLookupCandidates(itemType);
    if (!candidates.length) return [];

    const exactCandidateSet = new Set(candidates);
    const normalizedCandidateSet = new Set(candidates.map(normalizeLookupKey).filter(Boolean));

    const paths = [];
    for (const [rawKey, rawPaths] of Object.entries(dictionary)) {
        if (!Array.isArray(rawPaths) || !rawPaths.length) continue;

        const key = toSafeString(rawKey);
        if (!key) continue;

        const directMatch = exactCandidateSet.has(key);
        const normalizedMatch = normalizedCandidateSet.has(normalizeLookupKey(key));
        if (directMatch || normalizedMatch) {
            paths.push(...rawPaths);
        }
    }

    return uniqueSortedPaths(paths);
}


async function loadSystemItemPathDictionary(systemId = game.system?.id) {
    const cleanSystemId = toSafeString(systemId).toLowerCase();
    if (!cleanSystemId) return EMPTY_OBJECT;

    if (ITEM_SYSTEM_PATHS_BY_SYSTEM_CACHE.has(cleanSystemId)) {
        return ITEM_SYSTEM_PATHS_BY_SYSTEM_CACHE.get(cleanSystemId);
    }
    if (ITEM_SYSTEM_PATHS_BY_SYSTEM_PROMISES.has(cleanSystemId)) {
        return ITEM_SYSTEM_PATHS_BY_SYSTEM_PROMISES.get(cleanSystemId);
    }

    const promise = (async () => {
        const dictionaryFile = ITEM_SYSTEM_PATH_DICTIONARY_FILES[cleanSystemId];
        if (!dictionaryFile) {
            ITEM_SYSTEM_PATHS_BY_SYSTEM_CACHE.set(cleanSystemId, EMPTY_OBJECT);
            return EMPTY_OBJECT;
        }

        const modulePath = game.modules?.get?.("campaign-codex")?.path || "modules/campaign-codex";
        const dictionaryUrl = `${modulePath}/data/${dictionaryFile}`;

        try {
            const response = await fetch(dictionaryUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const json = await response.json();
            const normalized = normalizePathDictionary(json);
            ITEM_SYSTEM_PATHS_BY_SYSTEM_CACHE.set(cleanSystemId, normalized);
            return normalized;
        } catch (error) {
            console.warn(`Campaign Codex | Failed to load item path dictionary for ${cleanSystemId}:`, error);
            ITEM_SYSTEM_PATHS_BY_SYSTEM_CACHE.set(cleanSystemId, EMPTY_OBJECT);
            return EMPTY_OBJECT;
        } finally {
            ITEM_SYSTEM_PATHS_BY_SYSTEM_PROMISES.delete(cleanSystemId);
        }
    })();

    ITEM_SYSTEM_PATHS_BY_SYSTEM_PROMISES.set(cleanSystemId, promise);
    return promise;
}

function collectAllPathsFromDictionary(dictionary) {
    if (!dictionary || typeof dictionary !== "object") return [];
    const all = [];
    for (const paths of Object.values(dictionary)) {
        if (Array.isArray(paths) && paths.length) {
            all.push(...paths);
        }
    }
    return uniqueSortedPaths(all);
}

async function getFlagPathSuggestionsByType(itemTypes = []) {
    const systemDictionary = await loadSystemItemPathDictionary();
    const mergedDictionary = systemDictionary;

    const typeSet = new Set(itemTypes.map((type) => toSafeString(type)).filter(Boolean));
    const byType = {};

    for (const type of typeSet) {
        byType[type] = collectTypePathsFromDictionary(type, mergedDictionary);
    }

    return {
        byType,
        all: collectAllPathsFromDictionary(mergedDictionary),
    };
}

function getFlagPathSuggestionsForType(pathSuggestions, itemType = "") {
    const cleanType = toSafeString(itemType);
    if (!cleanType) return pathSuggestions?.all || [];

    if (Array.isArray(pathSuggestions?.byType?.[cleanType])) {
        return pathSuggestions.byType[cleanType];
    }

    const normalizedType = normalizeLookupKey(cleanType);
    if (!normalizedType) return pathSuggestions?.all || [];

    for (const [key, paths] of Object.entries(pathSuggestions?.byType || {})) {
        if (normalizeLookupKey(key) === normalizedType) {
            return Array.isArray(paths) ? paths : [];
        }
    }

    return pathSuggestions?.all || [];
}

function makeFlagPathDatalistId(widgetId, filterId) {
    const safeWidgetId = String(widgetId || "tradein").replace(/[^a-z0-9_-]+/gi, "-");
    const safeFilterId = String(filterId || "filter").replace(/[^a-z0-9_-]+/gi, "-");
    return `ti-flag-path-list-${safeWidgetId}-${safeFilterId}`;
}


function normalizeFlagFilters(rawFilters) {
    if (!Array.isArray(rawFilters)) return [];

    return rawFilters
        .map((entry) => ({
            id: toSafeString(entry?.id) || foundry.utils.randomID(),
            path: toSafeString(entry?.path),
            itemType: toSafeString(entry?.itemType),
            operator: normalizeOperator(entry?.operator),
            value: toSafeString(entry?.value),
        }))
        .slice(0, 20);
}

function getActiveFlagFilters(flagFilters) {
    return normalizeFlagFilters(flagFilters).filter((entry) => entry.path && entry.value);
}

function getTradeInSettings(doc, widgetId) {
    const widgetData = doc?.getFlag("campaign-codex", `data.widgets.tradein.${widgetId}`) || {};

    const payoutMultiplier = clampNumber(widgetData.payoutMultiplier ?? 1, 0, 1000);
    const unlimitedFunds = !!widgetData.unlimitedFunds;

    const allowedTypes = Array.isArray(widgetData.allowedTypes)
        ? [...new Set(widgetData.allowedTypes.map((type) => String(type).trim()).filter(Boolean))]
        : [];
    const nameFilter = toSafeString(widgetData.nameFilter);

    const maxBaseValueRaw = toSafeString(widgetData.maxBaseValue);
    const maxBaseValueParsed = maxBaseValueRaw === "" ? null : toNumberOrNull(maxBaseValueRaw);
    const maxBaseValue = maxBaseValueParsed !== null ? Math.max(0, maxBaseValueParsed) : null;

    const flagFilters = normalizeFlagFilters(widgetData.flagFilters || []);

    return {
        payoutMultiplier,
        unlimitedFunds,
        allowedTypes,
        nameFilter,
        maxBaseValue,
        flagFilters,
        activeFlagFilters: getActiveFlagFilters(flagFilters),
    };
}

function getQuantityPath(systemId = game.system?.id) {
    return getItemQuantityPath(systemId);
}

function getItemQuantityInfo(item) {
    const quantityPath = getQuantityPath();
    const directValue = foundry.utils.getProperty(item, quantityPath);

    if (typeof directValue === "number") {
        return { path: quantityPath, value: directValue };
    }

    if (directValue && typeof directValue === "object" && Number.isFinite(Number(directValue.value))) {
        return { path: `${quantityPath}.value`, value: Number(directValue.value) };
    }

    const nestedPath = `${quantityPath}.value`;
    const nestedValue = foundry.utils.getProperty(item, nestedPath);
    if (Number.isFinite(Number(nestedValue))) {
        return { path: nestedPath, value: Number(nestedValue) };
    }

    return null;
}

async function removeSingleItemFromActor(item) {
    if (!item || item.documentName !== "Item" || item.parent?.documentName !== "Actor") {
        return false;
    }

    const qtyInfo = getItemQuantityInfo(item);
    if (!qtyInfo) {
        await item.delete();
        return true;
    }

    const currentQty = Math.floor(Number(qtyInfo.value || 0));
    if (!Number.isFinite(currentQty) || currentQty <= 0) return false;

    if (currentQty === 1) {
        await item.delete();
        return true;
    }

    await item.update({ [qtyInfo.path]: currentQty - 1 });
    return true;
}

function normalizeItemDataForTradeIn(rawData) {
    const itemData = foundry.utils.deepClone(rawData || {});
    delete itemData._id;

    const quantityPath = getQuantityPath();
    const directValue = foundry.utils.getProperty(itemData, quantityPath);
    const nestedPath = `${quantityPath}.value`;

    if (typeof directValue === "number") {
        foundry.utils.setProperty(itemData, quantityPath, 1);
    } else if (directValue && typeof directValue === "object" && ("value" in directValue || Number.isFinite(Number(directValue.value)))) {
        foundry.utils.setProperty(itemData, nestedPath, 1);
    } else if (foundry.utils.hasProperty(itemData, nestedPath)) {
        foundry.utils.setProperty(itemData, nestedPath, 1);
    }

    if (itemData._stats && typeof itemData._stats === "object") {
        delete itemData._stats.createdTime;
        delete itemData._stats.modifiedTime;
        delete itemData._stats.lastModifiedBy;
    }

    return itemData;
}

function getCompendiumSourceUuid(item) {
    if (!item || item.documentName !== "Item") return "";
    const sourceCandidate =
        foundry.utils.getProperty(item, "_stats.compendiumSource") ||
        foundry.utils.getProperty(item, "flags.core._stats.compendiumSource") ||
        (typeof item.getFlag === "function" ? item.getFlag("core", "_stats.compendiumSource") : null) ||
        "";
    return typeof sourceCandidate === "string" ? sourceCandidate.trim() : "";
}

async function findMatchingInventoryIndex(item, inventory, sourceUuid = "") {
    if (!Array.isArray(inventory) || !inventory.length) return -1;

    for (let i = 0; i < inventory.length; i++) {
        const entry = inventory[i];
        if (!entry?.itemUuid) continue;

        const invDoc = await fromUuid(entry.itemUuid).catch(() => null);
        if (!invDoc || invDoc.documentName !== "Item") continue;

        const sameNameTypeImg =
            invDoc.name === item.name &&
            invDoc.type === item.type &&
            invDoc.img === item.img;

        if (sourceUuid) {
            const invSourceUuid = getCompendiumSourceUuid(invDoc);
            if (
                sameNameTypeImg &&
                (
                    invSourceUuid === sourceUuid ||
                    invDoc.uuid === sourceUuid ||
                    entry.itemUuid === sourceUuid
                )
            ) {
                return i;
            }
        }

        if (sameNameTypeImg) {
            return i;
        }
    }

    return -1;
}

function buildSaleKey(item) {
    const safeName = String(item?.name || "").trim().toLowerCase();
    const safeType = String(item?.type || "").trim().toLowerCase();
    const safeImg = String(item?.img || "").trim().toLowerCase();
    return `${safeName}::${safeType}::${safeImg}`;
}


function resolvePathFilterValues(source, path) {
    const cleanPath = normalizeBracketSegments(path);
    if (!cleanPath) return [];

    if (!cleanPath.includes("[]")) {
        const direct = foundry.utils.getProperty(source, cleanPath);
        return direct === undefined ? [] : [direct];
    }

    const segments = cleanPath.split(".").map((segment) => toSafeString(segment)).filter(Boolean);
    let currentValues = [source];

    for (const segment of segments) {
        const wildcardOnly = segment === "[]";
        const wildcardSuffix = segment.endsWith("[]");
        const propertyKey = wildcardOnly ? "" : (wildcardSuffix ? segment.slice(0, -2) : segment);
        const nextValues = [];

        for (const value of currentValues) {
            if (value === null || value === undefined) continue;

            let currentValue = value;
            if (propertyKey) {
                if (typeof currentValue !== "object") continue;
                currentValue = currentValue[propertyKey];
            }

            if (currentValue === undefined) continue;

            if (wildcardOnly || wildcardSuffix) {
                if (Array.isArray(currentValue)) {
                    nextValues.push(...currentValue);
                } else if (currentValue && typeof currentValue === "object") {
                    nextValues.push(...Object.values(currentValue));
                } else {
                    nextValues.push(currentValue);
                }
                continue;
            }

            nextValues.push(currentValue);
        }

        currentValues = nextValues;
        if (!currentValues.length) break;
    }

    return currentValues;
}

function evaluateFlagFilterValue(itemValue, filter) {
    const compareRaw = filter.value;

    if (filter.operator === "contains") {
        const left = String(itemValue ?? "").toLowerCase();
        const right = String(compareRaw).toLowerCase();
        return left.includes(right);
    }

    if (filter.operator === "gt" || filter.operator === "lt") {
        const left = Number(itemValue);
        const right = Number(compareRaw);
        if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
        return filter.operator === "gt" ? left > right : left < right;
    }

    const leftNumber = Number(itemValue);
    const rightNumber = Number(compareRaw);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return Math.abs(leftNumber - rightNumber) <= EPSILON;
    }

    return String(itemValue ?? "").toLowerCase() === String(compareRaw).toLowerCase();
}

function evaluateFlagFilter(item, filter) {
    const itemValues = resolvePathFilterValues(item, filter.path);
    if (!itemValues.length) return false;
    return itemValues.some((itemValue) => evaluateFlagFilterValue(itemValue, filter));
}

function getOperatorLabel(operator) {
    const entry = FLAG_OPERATORS.find((item) => item.value === operator);
    return entry?.label || "=";
}

function evaluateItemAgainstFilters(item, settings) {
    if (!item || item.documentName !== "Item") {
        return { ok: false, message: "Only items can be sold." };
    }

    const nameNeedle = String(settings.nameFilter || "").trim().toLowerCase();
    if (nameNeedle) {
        const itemName = String(item.name || "").toLowerCase();
        if (!itemName.includes(nameNeedle)) {
            return { ok: false, message: `Item name must contain "${settings.nameFilter}".` };
        }
    }

    const baseInfo = EconomyHelper._getItemBasePrice(item);
    const baseValue = Math.max(Number(baseInfo?.price || 0), 0);

    if (settings.maxBaseValue !== null && settings.maxBaseValue !== undefined) {
        if (baseValue > Number(settings.maxBaseValue) + EPSILON) {
            return {
                ok: false,
                message: `This shop will not buy items over ${formatAmount(settings.maxBaseValue)} value.`,
            };
        }
    }

    const allowedTypes = Array.isArray(settings.allowedTypes) ? settings.allowedTypes : [];
    const hasAllowedTypeLimit = allowedTypes.length > 0;
    const isTypeAllowedByPills = !hasAllowedTypeLimit || allowedTypes.includes(item.type);

    const scopedFilters = (settings.activeFlagFilters || []).filter((filter) => toSafeString(filter.itemType) === item.type);
    const globalFilters = (settings.activeFlagFilters || []).filter((filter) => !toSafeString(filter.itemType));
    const applicableFilters = [
        ...scopedFilters,
        ...(isTypeAllowedByPills ? globalFilters : []),
    ];

    if (applicableFilters.length > 0) {
        const firstPassed = applicableFilters.find((filter) => evaluateFlagFilter(item, filter));
        if (!firstPassed) {
            const firstFilter = applicableFilters[0];
            const opLabel = getOperatorLabel(firstFilter.operator);
            return {
                ok: false,
                message: `Item failed filter: ${firstFilter.path} ${opLabel} ${firstFilter.value}`,
            };
        }
    } else {
        if (hasAllowedTypeLimit && !allowedTypes.includes(item.type)) {
            return { ok: false, message: `This shop does not accept ${item.type} items.` };
        }
    }

    return {
        ok: true,
        baseInfo: {
            price: baseValue,
            currency: baseInfo?.currency || CampaignCodexLinkers.getCurrency(),
        },
    };
}

function calculateOffer(item, settings, availableFunds, baseInfoOverride = null) {
    const baseInfo = baseInfoOverride || EconomyHelper._getItemBasePrice(item);
    const baseValue = Math.max(Number(baseInfo?.price || 0), 0);
    const inventoryCurrency = CampaignCodexLinkers.getCurrency();
    const offerCurrency = baseInfo?.currency || inventoryCurrency;
    const multiplier = clampNumber(settings?.payoutMultiplier ?? 1, 0, 1000);
    let offer = baseValue * multiplier;

    const roundFinalPrice = game.settings.get("campaign-codex", "roundFinalPrice");
    if (roundFinalPrice) {
        offer = Math.round(offer);
    } else {
        offer = Math.round(offer * 100) / 100;
    }

    const cappedFunds = Math.max(
        EconomyHelper.convertCurrencyAmount(
            Number(availableFunds || 0),
            inventoryCurrency,
            offerCurrency,
        ),
        0,
    );
    const wasCapped = !settings?.unlimitedFunds && offer > cappedFunds;
    if (!settings?.unlimitedFunds) {
        offer = Math.min(offer, cappedFunds);
    }

    const normalizedOffer = Math.max(offer, 0);

    return {
        offer: normalizedOffer,
        baseValue,
        wasCapped,
        currency: offerCurrency,
        offerInInventoryCurrency: roundFundsAmount(
            EconomyHelper.convertCurrencyAmount(
                normalizedOffer,
                offerCurrency,
                inventoryCurrency,
            ),
        ),
    };
}

async function resolveInventoryTarget(item, inventory) {
    const saleKey = buildSaleKey(item);
    const sourceUuid = getCompendiumSourceUuid(item);
    const existingIndex = await findMatchingInventoryIndex(item, inventory, sourceUuid);

    if (existingIndex >= 0 && inventory[existingIndex]?.itemUuid) {
        return {
            existingIndex,
            itemUuid: inventory[existingIndex]?.itemUuid,
            saleKey,
            createdItemUuid: null,
        };
    }

    const itemData = normalizeItemDataForTradeIn(item.toObject());

    const created = await Item.create(itemData, { renderSheet: false });
    return {
        existingIndex: -1,
        itemUuid: created?.uuid || null,
        saleKey,
        createdItemUuid: created?.uuid || null,
    };
}

function buildResult(ok, message, extra = {}) {
    return {
        ok,
        message,
        ...extra,
    };
}

export async function processTradeInSocketRequest(data = {}) {
    const docUuid = String(data.docUuid || "").trim();
    const actorUuid = String(data.actorUuid || "").trim();
    const itemUuid = String(data.itemUuid || "").trim();
    const widgetId = String(data.widgetId || "").trim();
    const userId = String(data.userId || "").trim();

    if (!docUuid || !actorUuid || !itemUuid || !widgetId) {
        return buildResult(false, "Invalid trade-in request.");
    }

    const doc = await fromUuid(docUuid).catch(() => null);
    if (!doc) return buildResult(false, localize("notify.sourceDocNotFound"));

    const actor = await fromUuid(actorUuid).catch(() => null);
    if (!actor || actor.documentName !== "Actor") {
        return buildResult(false, localize("notify.actorNotFound"));
    }

    const item = await fromUuid(itemUuid).catch(() => null);
    if (!item || item.documentName !== "Item") {
        return buildResult(false, localize("notify.itemNotFound"));
    }

    if (item.parent?.uuid !== actor.uuid) {
        return buildResult(false, "You can only sell items from the selected actor.");
    }

    const requester = userId ? game.users.get(userId) : null;
    if (requester && !requester.isGM && requester.character?.uuid !== actor.uuid) {
        return buildResult(false, "You can only sell items from your assigned character.");
    }

    if (!EconomyHelper.canAddCurrency()) {
        return buildResult(false, "Currency payout is not configured for this system.");
    }

    const currentData = doc.getFlag("campaign-codex", "data") || {};
    const settings = getTradeInSettings(doc, widgetId);

    const filterCheck = evaluateItemAgainstFilters(item, settings);
    if (!filterCheck.ok) {
        return buildResult(false, filterCheck.message || "This item does not match trade-in filters.");
    }

    const availableFunds = Number(currentData.inventoryCash || 0);
    const offerData = calculateOffer(item, settings, availableFunds, filterCheck.baseInfo);
    if (offerData.offer <= 0) {
        return buildResult(false, "No funds available to buy this item.");
    }

    const inventory = foundry.utils.deepClone(currentData.inventory || []);
    const target = await resolveInventoryTarget(item, inventory);
    if (!target.itemUuid) {
        return buildResult(false, "Failed to prepare the sold item for storage.");
    }

    const addCurrencyOk = await EconomyHelper.removeCost(
        item,
        actor,
        { customPrice: offerData.offer },
        1,
        1,
        { addFunds: true, currency: offerData.currency },
    );
    if (!addCurrencyOk) {
        if (target.createdItemUuid) {
            const createdDoc = await fromUuid(target.createdItemUuid).catch(() => null);
            await createdDoc?.delete?.();
        }
        return buildResult(false, "Failed to add funds to actor.");
    }

    const removed = await removeSingleItemFromActor(item);
    if (!removed) {
        await EconomyHelper.removeCost(item, actor, { customPrice: offerData.offer }, 1, 1).catch(() => null);
        if (target.createdItemUuid) {
            const createdDoc = await fromUuid(target.createdItemUuid).catch(() => null);
            await createdDoc?.delete?.();
        }
        return buildResult(false, "Failed to remove item from actor inventory.");
    }

    if (target.existingIndex >= 0) {
        const existing = inventory[target.existingIndex];
        existing.quantity = Math.max(0, Number(existing.quantity || 0)) + 1;
        if (!existing.saleKey && target.saleKey) {
            existing.saleKey = target.saleKey;
        }
    } else {
        inventory.push({
            itemUuid: target.itemUuid,
            quantity: 1,
            customPrice: null,
            saleKey: target.saleKey,
        });
    }

    const updateData = {
        "flags.campaign-codex.data.inventory": inventory,
    };

    if (!settings.unlimitedFunds) {
        const offerInInventoryCurrency = Number(offerData.offerInInventoryCurrency || 0);
        updateData["flags.campaign-codex.data.inventoryCash"] = Math.max(
            0,
            roundFundsAmount(availableFunds - offerInInventoryCurrency),
        );
    }

    try {
        await doc.update(updateData);
    } catch (error) {
        console.error("Campaign Codex | Trade-in update failed:", error);
        if (target.createdItemUuid) {
            const createdDoc = await fromUuid(target.createdItemUuid).catch(() => null);
            await createdDoc?.delete?.();
        }
        return buildResult(false, "Sale completed, but the shop inventory failed to update. Please check manually.");
    }

    const currencyLabel = offerData.currency || CampaignCodexLinkers.getCurrency();
    const amountLabel = formatAmount(offerData.offer);

    await appendTransaction(doc, {
        type: "sell",
        itemName: item.name,
        amount: offerData.offer,
        currency: currencyLabel,
        actorName: actor.name,
        actorUuid: actor.uuid,
        userId: requester?.id || userId || null,
        userName: requester?.name || "",
        source: "Trade-In Counter",
        sourceUuid: doc.uuid,
    }).catch((error) => {
        console.warn("Campaign Codex | Failed to append transaction record:", error);
    });

    const sellerName = requester?.name || actor.name;
    const activeGMId = game.users.activeGM?.id;
    const chatPayload = {
        content: `<p><strong>${sellerName}</strong> sold <strong>1x ${item.name}</strong> to ${doc.name} for <strong>${amountLabel} ${currencyLabel}</strong>.</p>`,
    };
    if (activeGMId) chatPayload.whisper = [activeGMId];
    await ChatMessage.create(chatPayload).catch((error) => {
        console.warn("Campaign Codex | Failed to create sell chat message:", error);
    });

    return buildResult(true, `Sold 1x ${item.name} for ${amountLabel} ${currencyLabel}.`, {
        amount: offerData.offer,
        currency: currencyLabel,
        itemName: item.name,
    });
}

export class TradeInWidget extends CampaignCodexWidget {
    _normalizeMultiplier(value) {
        return clampNumber(value ?? 1, 0, 1000);
    }

    _nextTypeFilterState(state) {
        return state === "include" ? "any" : "include";

    }

    _blankFlagFilter() {
        return {
            id: foundry.utils.randomID(),
            itemType: "",
            path: "",
            operator: "eq",
            value: "",
        };
    }

    _collectConfigFromElement(htmlElement) {
        const payoutMultiplier = this._normalizeMultiplier(htmlElement.querySelector(".ti-multiplier")?.value ?? 1);
        const unlimitedToggle = htmlElement.querySelector(".ti-unlimited-toggle");
        const unlimitedFunds = unlimitedToggle
            ? (
                unlimitedToggle.dataset.enabled === "true" ||
                unlimitedToggle.classList.contains("active") ||
                unlimitedToggle.getAttribute("aria-pressed") === "true"
            )
            : !!htmlElement.querySelector(".ti-unlimited")?.checked;
        const nameFilter = toSafeString(htmlElement.querySelector(".ti-name-filter")?.value || "");

        const maxBaseRaw = toSafeString(htmlElement.querySelector(".ti-max-value")?.value || "");
        const parsedMaxBase = maxBaseRaw === "" ? null : toNumberOrNull(maxBaseRaw);
        const maxBaseValue = parsedMaxBase === null ? null : Math.max(0, parsedMaxBase);

        const allowedTypes = [];
        htmlElement.querySelectorAll(".ti-type-pill").forEach((pill) => {
            const type = toSafeString(pill.dataset.type);
            const state = toSafeString(pill.dataset.state || "any").toLowerCase();
            if (!type) return;
            if (state === "include") allowedTypes.push(type);
        });

        const flagFilters = Array.from(htmlElement.querySelectorAll(".ti-flag-row")).map((row) => ({
            id: toSafeString(row.dataset.filterId) || foundry.utils.randomID(),
            itemType: toSafeString(row.querySelector(".ti-flag-item-type")?.value || ""),
            path: toSafeString(row.querySelector(".ti-flag-path")?.value || ""),
            operator: normalizeOperator(row.querySelector(".ti-flag-op")?.value || "eq"),
            value: toSafeString(row.querySelector(".ti-flag-value")?.value || ""),
        }));

        return {
            payoutMultiplier,
            unlimitedFunds,
            allowedTypes,
            excludedTypes: [],
            nameFilter,
            maxBaseValue,
            flagFilters,
        };
    }

    async _saveConfigFromElement(htmlElement) {
        const savedData = (await this.getData()) || {};
        const nextConfig = this._collectConfigFromElement(htmlElement);
        await this.saveData({ ...savedData, ...nextConfig });
    }

    async _prepareContext() {
        const settings = getTradeInSettings(this.document, this.widgetId);
        const sheetData = this.document.getFlag("campaign-codex", "data") || {};
        const funds = Math.max(Number(sheetData.inventoryCash || 0), 0);
        const currency = CampaignCodexLinkers.getCurrency();

        const typeOptions = getItemTypeOptions().map((type) => ({
            ...type,
            state: settings.allowedTypes.includes(type.value) ? "include" : "any",
        }));

        const flagFilters = settings.flagFilters.length ? settings.flagFilters : [this._blankFlagFilter()];
        const suggestionItemTypes = [
            ...typeOptions.map((type) => type.value),
            ...flagFilters.map((filter) => filter.itemType),
        ];
        const pathSuggestions = await getFlagPathSuggestionsByType(suggestionItemTypes);

        return {
            id: this.widgetId,
            isGM: this.isGM,
            hasCharacter: !!game.user?.character,
            payoutMultiplier: settings.payoutMultiplier,
            unlimitedFunds: settings.unlimitedFunds,
            funds,
            fundsLabel: `${formatAmount(funds)} ${currency}`,
            currency,
            typeOptions,
            nameFilter: settings.nameFilter,
            maxBaseValue: settings.maxBaseValue,
            flagFilters,
            pathSuggestions,
            operatorOptions: FLAG_OPERATORS,
        };
    }

    _renderFlagFilterRows(context) {
        return context.flagFilters.map((filter) => {
            const opOptions = context.operatorOptions
                .map((op) => `<option value="${op.value}" ${filter.operator === op.value ? "selected" : ""}>${op.label}</option>`)
                .join("");
            const typeOptions = [
                `<option value="" ${!filter.itemType ? "selected" : ""}>-</option>`,
                ...context.typeOptions.map((type) => `
                    <option value="${foundry.utils.escapeHTML(type.value)}" ${filter.itemType === type.value ? "selected" : ""}>
                        ${foundry.utils.escapeHTML(type.label)}
                    </option>
                `),
            ].join("");
            const basePathSuggestions = getFlagPathSuggestionsForType(context.pathSuggestions, filter.itemType);
            const pathSuggestions = getPathSuggestionsForInput(basePathSuggestions, filter.path);
            const pathSuggestionOptions = pathSuggestions
                .map((path) => `<option value="${foundry.utils.escapeHTML(path)}"></option>`)
                .join("");
            const pathDatalistId = makeFlagPathDatalistId(context.id, filter.id);
            return `
                <div class="ti-flag-row" data-filter-id="${filter.id}">
                    <select class="ti-flag-item-type ti-config-input">${typeOptions}</select>

                    <input
                        type="text"
                        class="ti-flag-path ti-config-input"
                        list="${pathDatalistId}"
                        placeholder="Path (e.g. system.rarity)"
                        value="${foundry.utils.escapeHTML(filter.path)}"
                    >
                    <datalist id="${pathDatalistId}">${pathSuggestionOptions}</datalist>

                    <select class="ti-flag-op ti-config-input">${opOptions}</select>

                    <input type="text" class="ti-flag-value ti-config-input" placeholder="Value" value="${foundry.utils.escapeHTML(filter.value)}">
                    <button type="button" class="ti-remove-flag" data-filter-id="${filter.id}" title="Remove filter"><i class="fas fa-times"></i></button>
                </div>
            `;
        }).join("");

    }

    _renderTypePills(context) {
        return context.typeOptions.map((type) => `
            <button
                type="button"
                class="ti-type-pill ti-type-pill-${type.state}"
                data-type="${foundry.utils.escapeHTML(type.value)}"
                data-state="${type.state}"
                title="Click to toggle include"
            >
                <span class="ti-type-pill-label">${foundry.utils.escapeHTML(type.label)}</span>
            </button>
        `).join("");
    }

    async render() {
        const context = await this._prepareContext();

        if (context.isGM) {
            const maxValueDisplay = context.maxBaseValue === null || context.maxBaseValue === undefined
                ? ""
                : formatAmount(context.maxBaseValue);

            return `
                <div class="cc-widget-trade-in" id="widget-${context.id}">
                    <div class="ti-admin-panel">
                        <div class="ti-settings">
                            <label class="ti-setting">
                                <span>Payout Multiplier</span>
                                <input type="number" class="ti-multiplier ti-config-input" min="0" max="1000" step="0.1" value="${context.payoutMultiplier}">
                            </label>
                            <label class="ti-setting">
                                <span>Max Item Value</span>
                                <input type="number" class="ti-max-value ti-config-input" min="0" step="0.01" placeholder="-" value="${maxValueDisplay}">
                            </label>
                            <div class="ti-funds-wrap">
                                <button
                                    type="button"
                                    class="ti-unlimited-toggle ${context.unlimitedFunds ? "active" : ""}"
                                    data-enabled="${context.unlimitedFunds ? "true" : "false"}"
                                    aria-pressed="${context.unlimitedFunds ? "true" : "false"}"
                                    title="Toggle unlimited funds"
                                >
                                    <i class="fas fa-infinity"></i>
                                </button>
                                <div class="ti-funds" title="Current available funds from inventory cash">
                                    <i class="fas fa-coins"></i>
                                    <span>${context.fundsLabel}</span>
                                </div>
                            </div>
                        </div>

                        <div class="ti-filter-group">
                            <h5>Accepted Item Types</h5>
                            <div class="ti-type-pills">${this._renderTypePills(context)}</div>
                        </div>

                        <div class="ti-filter-group ti-filter-grid">
                            <label class="ti-setting vertical">
                                <span>Name Contains</span>
                                <input type="text" class="ti-name-filter ti-config-input" placeholder="e.g. gem" value="${foundry.utils.escapeHTML(context.nameFilter)}">
                            </label>
                        </div>

                        <div class="ti-filter-group">
                            <div class="ti-filter-header-row">
                                <h5>Flag/Path Filters</h5>
                                <button type="button" class="ti-add-flag"><i class="fas fa-plus"></i> Add</button>
                            </div>
                            <div class="ti-flag-list">${this._renderFlagFilterRows(context)}</div>
                        </div>
                    </div>
                </div>
            `;
        }

        const disabledClass = !context.hasCharacter ? "is-disabled" : "";
        const subtitle = !context.hasCharacter
            ? "Assign a player character to use this widget."
            : "Drag an item from a character sheet to sell it.";

        return `
            <div class="cc-widget-trade-in" id="widget-${context.id}">
                <div class="ti-drop-zone ${disabledClass}" data-action="trade-in-drop">
                    <i class="fas fa-hand-holding-dollar"></i>
                    <div class="ti-drop-title">Sell Item</div>
                    <div class="ti-drop-subtitle">${subtitle}</div>
                </div>
            </div>
        `;
    }

    async activateListeners(htmlElement) {
        if (this.isGM) {
            const onConfigChanged = async () => {
                await this._saveConfigFromElement(htmlElement);
                await this._refreshWidget(htmlElement);
            };
            const suggestionItemTypes = [
                ...Array.from(htmlElement.querySelectorAll(".ti-type-pill"), (pill) => toSafeString(pill.dataset.type)),
                ...Array.from(htmlElement.querySelectorAll(".ti-flag-item-type"), (select) => toSafeString(select.value)),
            ];
            const pathSuggestions = await getFlagPathSuggestionsByType(suggestionItemTypes);

            const refreshPathSuggestionsForRow = (row) => {
                if (!row) return;

                const input = row.querySelector(".ti-flag-path");
                const itemType = toSafeString(row.querySelector(".ti-flag-item-type")?.value || "");
                const listId = toSafeString(input?.getAttribute("list"));
                if (!input || !listId) return;

                const datalist = htmlElement.querySelector(`#${listId}`);
                if (!datalist) return;

                const baseSuggestions = getFlagPathSuggestionsForType(pathSuggestions, itemType);
                const displaySuggestions = getPathSuggestionsForInput(baseSuggestions, input.value);
                datalist.innerHTML = displaySuggestions
                    .map((path) => `<option value="${foundry.utils.escapeHTML(path)}"></option>`)
                    .join("");
            };

            htmlElement.querySelectorAll(".ti-flag-row").forEach((row) => refreshPathSuggestionsForRow(row));

            htmlElement.querySelectorAll(".ti-config-input").forEach((input) => {
                input.addEventListener("change", onConfigChanged);
            });

            htmlElement.querySelectorAll(".ti-name-filter, .ti-max-value, .ti-flag-path, .ti-flag-value").forEach((input) => {
                input.addEventListener("blur", onConfigChanged);
            });

            htmlElement.querySelectorAll(".ti-flag-path").forEach((input) => {
                input.addEventListener("input", (event) => {
                    const row = event.currentTarget.closest(".ti-flag-row");
                    refreshPathSuggestionsForRow(row);
                });
            });

            htmlElement.querySelectorAll(".ti-flag-item-type").forEach((select) => {
                select.addEventListener("change", (event) => {
                    const row = event.currentTarget.closest(".ti-flag-row");
                    refreshPathSuggestionsForRow(row);
                });
            });
            

            htmlElement.querySelector(".ti-unlimited-toggle")?.addEventListener("click", async (event) => {
                event.preventDefault();
                const button = event.currentTarget;
                const enabled = !(button.dataset.enabled === "true");
                button.dataset.enabled = enabled ? "true" : "false";
                button.classList.toggle("active", enabled);
                button.setAttribute("aria-pressed", enabled ? "true" : "false");
                await onConfigChanged();
            });

            htmlElement.querySelectorAll(".ti-type-pill").forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const pill = event.currentTarget;
                    const currentState = String(pill.dataset.state || "any").toLowerCase();
                    const nextState = this._nextTypeFilterState(currentState);
                    pill.dataset.state = nextState;
                    pill.classList.remove("ti-type-pill-any", "ti-type-pill-include", "ti-type-pill-exclude");
                    pill.classList.add(`ti-type-pill-${nextState}`);
                    await onConfigChanged();
                });
            });

            htmlElement.querySelector(".ti-add-flag")?.addEventListener("click", async (event) => {
                event.preventDefault();
                const current = this._collectConfigFromElement(htmlElement);
                current.flagFilters = [...(current.flagFilters || []), this._blankFlagFilter()];
                const savedData = (await this.getData()) || {};
                await this.saveData({ ...savedData, ...current });
                await this._refreshWidget(htmlElement);
            });

            htmlElement.querySelectorAll(".ti-remove-flag").forEach((button) => {
                button.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const filterId = String(event.currentTarget.dataset.filterId || "");
                    const current = this._collectConfigFromElement(htmlElement);
                    current.flagFilters = (current.flagFilters || []).filter((entry) => entry.id !== filterId);
                    if (!current.flagFilters.length) current.flagFilters = [this._blankFlagFilter()];
                    const savedData = (await this.getData()) || {};
                    await this.saveData({ ...savedData, ...current });
                    await this._refreshWidget(htmlElement);
                });
            });

            return;
        }

        const dropZone = htmlElement.querySelector(".ti-drop-zone");
        if (!dropZone) return;

        dropZone.addEventListener("dragover", (event) => {
            if (dropZone.classList.contains("is-disabled")) return;
            event.preventDefault();
            dropZone.classList.add("is-hover");
        });

        dropZone.addEventListener("dragleave", () => {
            dropZone.classList.remove("is-hover");
        });

        dropZone.addEventListener("drop", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            dropZone.classList.remove("is-hover");

            if (dropZone.classList.contains("is-disabled")) return;

            let dragData = null;
            try {
                dragData = JSON.parse(event.dataTransfer?.getData("text/plain") || "{}");
            } catch (error) {
                dragData = null;
            }

            if (
              game.system.id === "starwarsffg" &&
              dragData?.nativeData?.type === "Item" &&
              typeof dragData?.nativeData?.uuid === "string" &&
              dragData.nativeData.uuid.trim()
            ) {
              dragData.uuid = dragData.nativeData.uuid;
              dragData.type = dragData.nativeData.type;
            }

            if (!dragData?.uuid || dragData.type !== "Item") {
                ui.notifications.warn(localize("notify.itemNotFoundToAdd"));
                return;
            }

            const item = await fromUuid(dragData.uuid).catch(() => null);
            if (!item || item.documentName !== "Item") {
                ui.notifications.warn(localize("notify.itemNotFound"));
                return;
            }

            const actor = item.parent;
            if (!actor || actor.documentName !== "Actor") {
                ui.notifications.warn("Only character-owned items can be sold.");
                return;
            }

            const myActorUuid = game.user?.character?.uuid;
            if (!myActorUuid || actor.uuid !== myActorUuid) {
                ui.notifications.warn("You can only sell items from your assigned character.");
                return;
            }

            await this._confirmAndProcessSale(item, actor);
        });
    }

    async _confirmAndProcessSale(item, actor) {
        const settings = getTradeInSettings(this.document, this.widgetId);
        const filterCheck = evaluateItemAgainstFilters(item, settings);

        if (!filterCheck.ok) {
            ui.notifications.warn(filterCheck.message || "This item does not match trade-in filters.");
            return;
        }

        const sheetData = this.document.getFlag("campaign-codex", "data") || {};
        const availableFunds = Number(sheetData.inventoryCash || 0);
        const offerData = calculateOffer(item, settings, availableFunds, filterCheck.baseInfo);
        
        if (offerData.offer <= 0) {
            ui.notifications.warn("No funds available to buy this item.");
            return;
        }

        const offerLabel = formatAmount(offerData.offer);
        const currency = offerData.currency || CampaignCodexLinkers.getCurrency();
        const cappedLine = offerData.wasCapped
            ? `<p style="margin: 0.5em 0 0 0; color: var(--cc-text-muted);">Offer capped by available shop funds.</p>`
            : "";

        const accept = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Sell Item" },
            content: `
                <p>Sell <strong>${foundry.utils.escapeHTML(item.name)}</strong> for <strong>${offerLabel} ${currency}</strong>?</p>
                ${cappedLine}
            `,
            modal: true,
            rejectClose: false,
        }).catch(() => false);

        if (!accept) return;

        const payload = {
            docUuid: this.document.uuid,
            actorUuid: actor.uuid,
            itemUuid: item.uuid,
            widgetId: this.widgetId,
            userId: game.user.id,
        };

        const activeGM = game.users.activeGM;
        if (!activeGM) {
            ui.notifications.warn("No active GM is available to process this sale.");
            return;
        }

        game.socket.emit("module.campaign-codex", {
            action: TRADE_IN_SOCKET_ACTION,
            data: payload,
        });
    }

    async _refreshWidget(htmlElement) {
        if (!htmlElement) return;
        const freshHtml = await this.render();
                const host = document.createElement("div");
        host.innerHTML = freshHtml.trim();
        const nextRoot = host.firstElementChild;

        if (nextRoot && htmlElement.parentElement) {
            htmlElement.replaceWith(nextRoot);
            await this.activateListeners(nextRoot);
            return;
        }
        htmlElement.innerHTML = freshHtml;
        await this.activateListeners(htmlElement);
    }
}
