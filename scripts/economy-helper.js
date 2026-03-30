import { localize } from "./helper.js";

// ===========================================================================
// CURRENCY DEFINITIONS
// ===========================================================================
const CURRENCY_CONFIG = {
"demonlord": [
    { key: "gc", label: "Gold Crowns",     rate: 1,     path: "system.wealth.gc" },
    { key: "ss", label: "Silver Shillings", rate: 0.1,   path: "system.wealth.ss" },
    { key: "cp", label: "Copper Pennies",   rate: 0.01,  path: "system.wealth.cp" },
    { key: "bits", label: "Bits",           rate: 0.001, path: "system.wealth.bits" }
  ],    
"wfrp4e": [
    { key: "gc", label: "Gold Crown", rate: 240, path: "transaction" }, 
    { key: "ss", label: "Silver Shilling", rate: 12, path: "transaction" }, 
    { key: "bp", label: "Brass Penny", rate: 1, path: "transaction" }
  ],
  "shadowrun6-eden":[ 
    { key: "¥", label: "Nuyen",     rate: 1,    path: "system.nuyen" }
  ],
  "dnd5e": [
    { key: "pp", label: "Platinum", rate: 10,   path: "system.currency.pp" },
    { key: "gp", label: "Gold",     rate: 1,    path: "system.currency.gp" },
    { key: "ep", label: "Electrum", rate: 0.5,  path: "system.currency.ep" },
    { key: "sp", label: "Silver",   rate: 0.1,  path: "system.currency.sp" },
    { key: "cp", label: "Copper",   rate: 0.01, path: "system.currency.cp" }
  ],
  "pf1": [
    { key: "pp", label: "Platinum", rate: 10,   path: "system.currency.pp" },
    { key: "gp", label: "Gold",     rate: 1,    path: "system.currency.gp" },
    { key: "sp", label: "Silver",   rate: 0.1,  path: "system.currency.sp" },
    { key: "cp", label: "Copper",   rate: 0.01, path: "system.currency.cp" }
  ],
  "shadowdark": [
    { key: "gp", label: "Gold",     rate: 1,    path: "system.coins.gp" },
    { key: "sp", label: "Silver",   rate: 0.1,  path: "system.coins.sp" },
    { key: "cp", label: "Copper",   rate: 0.01, path: "system.coins.cp" }
  ],
  "fallout": [
    { key: "caps", label: "Caps",   rate: 1,    path: "system.currency.caps" }
  ],
  "swade": [
    { key: "currency", label: "Currency", rate: 1, path: "system.details.currency" }
  ],
  "sfrpg": [
    { key: "credit", label: "Credits", rate: 1, path: "system.currency.credit" },
    { key: "upb",    label: "UPBs",    rate: 1, path: "system.currency.upb" }
  ],
  "pf2e": [
    { key: "pp", label: "Platinum", rate: 10,   path: "pp" },
    { key: "gp", label: "Gold",     rate: 1,    path: "gp" },
    { key: "sp", label: "Silver",   rate: 0.1,  path: "sp" },
    { key: "cp", label: "Copper",   rate: 0.01, path: "cp" }
  ],
  "sdm": [
    { key: "€", label: "Cash", rate: 1, path: "actor-method" }
  ]
};

export class EconomyHelper {

  static canAddCurrency() {
    const customCurrencyPath = game.settings.get("campaign-codex", "playerCurrencyPath");
    if (customCurrencyPath) return true;
    return Boolean(CURRENCY_CONFIG[game.system.id]);
  }

  static convertCurrencyAmount(amount = 0, fromCurrency = null, toCurrency = null, systemId = game.system.id) {
    const value = Number(amount || 0);
    if (!Number.isFinite(value) || value === 0) return 0;

    const config = CURRENCY_CONFIG[systemId];
    if (!Array.isArray(config) || !config.length) return value;

    const fromKey = String(fromCurrency ?? "").toLowerCase();
    const toKey = String(toCurrency ?? "").toLowerCase();

    const fromDef = config.find((entry) => String(entry.key).toLowerCase() === fromKey)
      || config.find((entry) => entry.rate === 1)
      || config[0];
    const toDef = config.find((entry) => String(entry.key).toLowerCase() === toKey)
      || config.find((entry) => entry.rate === 1)
      || config[0];

    const fromRate = Number(fromDef?.rate || 0);
    const toRate = Number(toDef?.rate || 0);
    if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || toRate === 0) return value;

    const converted = value * (fromRate / toRate);
    return Number.isFinite(converted) ? converted : value;
  }

  static async addCurrency(targetActor, amount = 0, currency = null) {
    const addAmount = Number(amount || 0);
    if (!Number.isFinite(addAmount) || addAmount <= 0) return false;

    const systemId = game.system.id;
    if (systemId === "sdm") {
      return this._addSDM(targetActor, addAmount);
    }

    const customCurrencyPath = game.settings.get("campaign-codex", "playerCurrencyPath");
    if (customCurrencyPath) {
      return this._addCustomPath(targetActor, addAmount, customCurrencyPath);
    }

    const config = CURRENCY_CONFIG[systemId];
    if (!config) return false;

    if (systemId === "pf2e") {
      return this._addPF2e(targetActor, addAmount, currency, config);
    }
    if (systemId === "wfrp4e") {
      return this._addWFRP4e(targetActor, addAmount, currency);
    }

    const wantedCurrency = String(currency ?? "").toLowerCase();
    const def = config.find((c) => String(c.key).toLowerCase() === wantedCurrency)
      || config.find((c) => c.rate === 1)
      || config[0];
    if (!def?.path || def.path === "transaction") return false;

    if (config.length === 1) {
      const currentVal = Number(foundry.utils.getProperty(targetActor, def.path) || 0);
      await targetActor.update({ [def.path]: currentVal + addAmount });
      return true;
    }

    return await this._addWithWalletLogic(targetActor, addAmount, def.key, config, systemId);
  }

  static async removeCost(item, targetActor, shopItemData, markup = 1.0, quantity = 1, options = {}) {
    const addFunds = !!options?.addFunds;
    const currencyOverride = options?.currency ? String(options.currency).toLowerCase() : null;

    const systemId = game.system.id;
    if (systemId === "sdm") {
      const priceDetails = this._calculateFinalPrice(item, shopItemData, markup, quantity);
      if (!priceDetails || priceDetails.cost <= 0) return true;
      if (addFunds) return await this._addSDM(targetActor, priceDetails.cost);
      return await this._paySDM(targetActor, priceDetails.cost);
    }

    const customCurrencyPath = game.settings.get("campaign-codex", "playerCurrencyPath");
    if (customCurrencyPath) {
      const priceDetails = this._calculateFinalPrice(item, shopItemData, markup, quantity);

      if (!priceDetails || priceDetails.cost <= 0) return true;

      const payoutCurrency = currencyOverride || priceDetails.currency;
      if (addFunds) {
        return await this.addCurrency(targetActor, priceDetails.cost, payoutCurrency);
      }

      return await this._payCustomPath(targetActor, priceDetails.cost, customCurrencyPath);
    }

    const config = CURRENCY_CONFIG[systemId];


    if (!config) {
      console.warn(`Campaign Codex | System '${systemId}' is not configured for payments.`);
      return true;
    }

    const priceDetails = this._calculateFinalPrice(item, shopItemData, markup, quantity);

    if (!priceDetails || priceDetails.cost <= 0) return true; 

    const { cost } = priceDetails;
    const currency = currencyOverride || priceDetails.currency;

    if (addFunds) {
      return await this.addCurrency(targetActor, cost, currency);
    }

    try {
      if (systemId === "pf2e") {

        return await this._payPF2e(targetActor, cost, currency, config);
      }

    if (systemId === "wfrp4e") {
        return await this._payWFRP4e(targetActor, cost, currency, config);
      }

      if (config.length === 1) {
        return await this._paySimple(targetActor, cost, config[0].path);
      }

      return await this._payWithWalletLogic(targetActor, cost, currency, config);

    } catch (err) {
      console.error("Campaign Codex | Payment Error:", err);
      ui.notifications.error(localize("error.paymentFailed") || "Payment failed.");
      return false;
    }
  }

static async _payWithWalletLogic(actor, costAmount, costCurrencyKey, config) {
    const sortedCurrencies = [...config].sort((a, b) => b.rate - a.rate);
    const baseCurrency = sortedCurrencies[sortedCurrencies.length - 1]; // Smallest unit
    
    const costDef = config.find(c => c.key === costCurrencyKey) || config.find(c => c.rate === 1) || config[0];
    
    const costInBase = Math.round(costAmount * (costDef.rate / baseCurrency.rate));

    const wallet = {};
    let totalWealthInBase = 0;
    
    for (const curr of sortedCurrencies) {
        const val = foundry.utils.getProperty(actor, curr.path) || 0;
        wallet[curr.key] = val;
        
        const coinValueBase = Math.round(curr.rate / baseCurrency.rate);
        totalWealthInBase += val * coinValueBase;
    }

    if (totalWealthInBase < costInBase) {
        const missingBase = costInBase - totalWealthInBase;
        const missingDisplay = (missingBase * baseCurrency.rate) / costDef.rate;
        ui.notifications.warn(localize("warn.notEnoughCurrency") || `Not enough funds. Missing ~${missingDisplay.toFixed(2)} ${costDef.label}.`);
        return false;
    }

    let remainingCost = costInBase;
    
    for (const curr of sortedCurrencies) {
        if (remainingCost <= 0) break;
        
        const coinValueBase = Math.round(curr.rate / baseCurrency.rate);
        const coinsOwned = wallet[curr.key];
        
        const coinsToTake = Math.min(coinsOwned, Math.floor(remainingCost / coinValueBase));
        
        if (coinsToTake > 0) {
            wallet[curr.key] -= coinsToTake;
            remainingCost -= (coinsToTake * coinValueBase);
        }
    }

    if (remainingCost > 0) {
        const lowToHigh = [...sortedCurrencies].reverse();
        
        for (const curr of lowToHigh) {
            const coinValueBase = Math.round(curr.rate / baseCurrency.rate);
            
            if (wallet[curr.key] > 0 && coinValueBase >= remainingCost) {
                wallet[curr.key] -= 1;
                remainingCost -= coinValueBase; 
                break;
            }
        }
    }

    if (remainingCost < 0) {
        let changeDue = Math.abs(remainingCost);
        
        for (const curr of sortedCurrencies) {
            if (changeDue <= 0) break;
            
            const coinValueBase = Math.round(curr.rate / baseCurrency.rate);
            const coinsToGive = Math.floor(changeDue / coinValueBase);
            
            if (coinsToGive > 0) {
                wallet[curr.key] += coinsToGive;
                changeDue -= (coinsToGive * coinValueBase);
            }
        }
    }

    const updates = {};
    for (const curr of sortedCurrencies) {
        updates[curr.path] = wallet[curr.key];
    }
    await actor.update(updates);
    return true;
  }

static _getAdditionOrder(systemId, config) {
    if (systemId === "dnd5e") {
      const preferred = ["pp", "gp", "sp", "cp", "ep"];
      const byKey = new Map(config.map((c) => [String(c.key).toLowerCase(), c]));
      const ordered = preferred.map((key) => byKey.get(key)).filter(Boolean);
      const leftovers = config.filter((c) => !ordered.includes(c)).sort((a, b) => b.rate - a.rate);
      return [...ordered, ...leftovers];
    }
    return [...config].sort((a, b) => b.rate - a.rate);
}

static async _addWithWalletLogic(actor, addAmount, addCurrencyKey, config, systemId = game.system.id) {
    const addableCurrencies = config.filter((curr) => curr?.path && curr.path !== "transaction");
    if (!addableCurrencies.length) return false;

    const sortedByRate = [...addableCurrencies].sort((a, b) => b.rate - a.rate);
    const baseCurrency = sortedByRate[sortedByRate.length - 1];
    const addDef = addableCurrencies.find((curr) => String(curr.key).toLowerCase() === String(addCurrencyKey).toLowerCase())
      || addableCurrencies.find((curr) => curr.rate === 1)
      || addableCurrencies[0];

    const addInBase = Math.max(0, Math.round(addAmount * (addDef.rate / baseCurrency.rate)));
    const addWholeInDef = Math.max(0, Math.trunc(addAmount));
    const defUnitInBase = Math.max(1, Math.round(addDef.rate / baseCurrency.rate));
    const wholeInBase = addWholeInDef * defUnitInBase;

    let remainingToDistribute = Math.max(0, addInBase - wholeInBase);

    const wallet = {};
    for (const curr of addableCurrencies) {
      const existing = Number(foundry.utils.getProperty(actor, curr.path) || 0);
      wallet[curr.key] = Number.isFinite(existing) ? existing : 0;
    }

    if (addWholeInDef > 0) {
      wallet[addDef.key] = (wallet[addDef.key] || 0) + addWholeInDef;
    }

    const ordered = this._getAdditionOrder(systemId, addableCurrencies);
    const lowerDenominations = ordered.filter((curr) => curr.key !== addDef.key && curr.rate < addDef.rate);

    for (const curr of lowerDenominations) {
      if (remainingToDistribute <= 0) break;
      const valueInBase = Math.max(1, Math.round(curr.rate / baseCurrency.rate));
      const qty = Math.floor(remainingToDistribute / valueInBase);
      if (qty <= 0) continue;
      wallet[curr.key] = (wallet[curr.key] || 0) + qty;
      remainingToDistribute -= qty * valueInBase;
    }

    if (remainingToDistribute > 0) {
      wallet[baseCurrency.key] = (wallet[baseCurrency.key] || 0) + remainingToDistribute;
      remainingToDistribute = 0;
    }

    const updates = {};
    for (const curr of addableCurrencies) {
      updates[curr.path] = Math.max(0, Math.floor(Number(wallet[curr.key] || 0)));
    }
    await actor.update(updates);
    return true;
}


static async _paySimple(actor, cost, path) {
    const currentVal = foundry.utils.getProperty(actor, path) || 0;
    if (currentVal >= cost) {
      await actor.update({ [path]: currentVal - cost });
      return true;
    }
    ui.notifications.warn(localize("warn.notEnoughCurrency") || `Not enough funds.`);
    return false;
}

static async _addCustomPath(actor, amount, path) {
    const currentVal = Number(foundry.utils.getProperty(actor, path) || 0);
    await actor.update({ [path]: currentVal + amount });
    return true;
}

static async _addPF2e(actor, amount, currency, config) {
    const wantedCurrency = String(currency ?? "").toLowerCase();
    const currencyInfo = config.find(c => String(c.key).toLowerCase() === wantedCurrency) || config.find(c => c.key === "gp");
    const rate = Number(currencyInfo?.rate || 1);
    const copperTotal = Math.round(amount * rate * 100);
    let remaining = copperTotal;
    const pp = Math.floor(remaining / 1000); remaining %= 1000;
    const gp = Math.floor(remaining / 100); remaining %= 100;
    const sp = Math.floor(remaining / 10); remaining %= 10;
    const cp = remaining;
    const addCoins = { pp, gp, sp, cp };

    if (actor?.inventory?.addCurrency) {
      const result = await actor.inventory.addCurrency(addCoins);
      if (result === false || result?.ok === false || result?.success === false) return false;
      return true;
    }

    const updates = {};
    for (const [k, v] of Object.entries(addCoins)) {
      if (!v) continue;
      const basePath = `system.currency.${k}`;
      const currentRaw = foundry.utils.getProperty(actor, basePath);
      if (currentRaw && typeof currentRaw === "object" && "value" in currentRaw) {
        updates[`${basePath}.value`] = Number(currentRaw.value || 0) + v;
      } else {
        updates[basePath] = Number(currentRaw || 0) + v;
      }
    }
    if (Object.keys(updates).length > 0) {
      await actor.update(updates);
    }
    return true;
}

static async _addWFRP4e(actor, amount, currency) {
    const currencyKey = String(currency ?? "gc").toLowerCase();
    let addBP = 0;
    if (currencyKey === "gc") addBP = Math.round(amount * 240);
    else if (currencyKey === "ss") addBP = Math.round(amount * 12);
    else addBP = Math.round(amount);

    const moneyItems = actor.itemTags?.money;
    if (!moneyItems || moneyItems.length === 0) return false;

    let totalActorBP = 0;
    let gcItem; let ssItem; let bpItem;
    for (const item of moneyItems) {
      const val = Number(item.system.coinValue?.value || 0);
      const quantity = Number(item.system.quantity?.value || 0);
      totalActorBP += val * quantity;
      if (val === 240) gcItem = item;
      else if (val === 12) ssItem = item;
      else if (val === 1) bpItem = item;
    }

    let remainingBP = totalActorBP + addBP;
    const newGC = Math.floor(remainingBP / 240);
    remainingBP %= 240;
    const newSS = Math.floor(remainingBP / 12);
    const newBP = remainingBP % 12;

    const updates = [];
    if (gcItem) updates.push({ _id: gcItem.id, "system.quantity.value": newGC });
    if (ssItem) updates.push({ _id: ssItem.id, "system.quantity.value": newSS });
    if (bpItem) updates.push({ _id: bpItem.id, "system.quantity.value": newBP });
    if (!updates.length) return false;

    await actor.updateEmbeddedDocuments("Item", updates);
    return true;
}

static async _addSDM(actor, amount) {
    return await this._changeSDMCash(actor, amount, "add");
}

static _getSDMCashTotal(actor) {
    if (!actor || typeof actor.getTotalCash !== "function") return 0;
    const total = Number(actor.getTotalCash() || 0);
    return Number.isFinite(total) ? total : 0;
}

static async _changeSDMCash(actor, amount, operation) {
    const op = operation === "remove" ? "remove" : "add";
    const normalizedAmount = Number.parseInt(String(amount ?? 0), 10);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) return true;
    if (!actor || typeof actor.getTotalCash !== "function") {
      console.warn("Campaign Codex | SDM actor does not support getTotalCash.");
      return false;
    }
    if (op === "add" && typeof actor.addCash !== "function") {
      console.warn("Campaign Codex | SDM actor does not support addCash.");
      return false;
    }
    if (op === "remove" && typeof actor.removeCash !== "function") {
      console.warn("Campaign Codex | SDM actor does not support removeCash.");
      return false;
    }

    const before = this._getSDMCashTotal(actor);

    try {
      if (op === "add") {
        await actor.addCash(normalizedAmount);
      } else {
        await actor.removeCash(normalizedAmount);
      }
    } catch (error) {
      console.error(`Campaign Codex | Error during SDM cash '${op}':`, error);
      return false;
    }

    const refreshed = game.actors?.get(actor.id) ?? actor;
    const after = this._getSDMCashTotal(refreshed);
    return op === "add" ? after > before : after < before;
}

static async _payCustomPath(actor, cost, path) {
    try {
      const currentVal = foundry.utils.getProperty(actor, path);
      if (currentVal === undefined || currentVal === null) {
        console.warn(`Campaign Codex | Custom currency path '${path}' not found on actor '${actor.name}'.`);
        return false;
      }
      const numericCurrent = Number(currentVal);
      if (isNaN(numericCurrent)) {
        console.warn(`Campaign Codex | Value at '${path}' is not a valid number on actor '${actor.name}'.`);
        return false;
      }
      if (numericCurrent >= cost) {
        await actor.update({ [path]: numericCurrent - cost });
        return true;
      } else {
        ui.notifications.warn(localize("warn.notEnoughCurrency") || "Not enough funds.");
        return false;
      }
    } catch (error) {
      console.error("Campaign Codex | Error processing custom currency deduction:", error);
      return false;
    }
  }

static async _paySDM(actor, cost) {
    return await this._changeSDMCash(actor, cost, "remove");
  }


static async _payWFRP4e(actor, cost, currency, config) {
    let costBP = 0;
    if (currency === "gc") costBP = Math.round(cost * 240);
    else if (currency === "ss") costBP = Math.round(cost * 12);
    else costBP = Math.round(cost);

    const moneyItems = actor.itemTags["money"];
    if (!moneyItems || moneyItems.length === 0) {
      ui.notifications.warn(localize("warn.notEnoughCurrency") || "No money items found.");
      return false;
    }

    let totalActorBP = 0;
    let gcItem, ssItem, bpItem;

    for (const item of moneyItems) {
      const val = item.system.coinValue?.value;
      const quantity = item.system.quantity?.value || 0;
      
      if (typeof val === "number") {
        totalActorBP += val * quantity;
        
        if (val === 240) gcItem = item;
        else if (val === 12) ssItem = item;
        else if (val === 1) bpItem = item;
      }
    }

    if (totalActorBP < costBP) {
      ui.notifications.warn(localize("warn.notEnoughCurrency") || "Not enough funds.");
      return false;
    }

    let remainingBP = totalActorBP - costBP;

    const newGC = Math.floor(remainingBP / 240);
    remainingBP %= 240;
    const newSS = Math.floor(remainingBP / 12);
    const newBP = remainingBP % 12;

    const updates = [];
    if (gcItem) updates.push({ _id: gcItem.id, "system.quantity.value": newGC });
    if (ssItem) updates.push({ _id: ssItem.id, "system.quantity.value": newSS });
    if (bpItem) updates.push({ _id: bpItem.id, "system.quantity.value": newBP });

    if (updates.length > 0) {
      await actor.updateEmbeddedDocuments("Item", updates);
    }
    return true;
  }



static async _payPF2e(actor, cost, currency, config) {
    const currencyInfo = config.find(c => c.key === currency) || config.find(c => c.key === "gp");
    const rate = currencyInfo.rate; 

    const requiredCopper = Math.round(cost * (rate * 100));

    let totalCopper = requiredCopper;
    const pp = Math.floor(totalCopper / 1000);
    totalCopper %= 1000;
    const gp = Math.floor(totalCopper / 100);
    totalCopper %= 100;
    const sp = Math.floor(totalCopper / 10);
    totalCopper %= 10;
    const cp = totalCopper;
    const costObject = { pp, gp, sp, cp };

    const toNum = (v) => Number(v?.value ?? v ?? 0) || 0;
    const coins = actor?.inventory?.coins || {};
    const actorPP = toNum(coins.pp ?? foundry.utils.getProperty(actor, "system.currency.pp"));
    const actorGP = toNum(coins.gp ?? foundry.utils.getProperty(actor, "system.currency.gp"));
    const actorSP = toNum(coins.sp ?? foundry.utils.getProperty(actor, "system.currency.sp"));
    const actorCP = toNum(coins.cp ?? foundry.utils.getProperty(actor, "system.currency.cp"));
    const availableCopper = (actorPP * 1000) + (actorGP * 100) + (actorSP * 10) + actorCP;




    if (availableCopper < requiredCopper) {
      ui.notifications.warn(localize("warn.notEnoughCurrency") || "Not enough funds.");
      return false;
    }



    try {
        const result = await actor.inventory.removeCurrency(costObject);
        if (result === false || result?.ok === false || result?.success === false) {
          ui.notifications.warn(localize("warn.notEnoughCurrency") || "Not enough funds.");
          return false;
        }
        return true;
    } catch (e) {
        ui.notifications.warn(localize("warn.notEnoughCurrency") || `Not enough funds.`);
        return false;
    }
  }


  static _calculateFinalPrice(item, shopItemData, markup, quantity = 1) {
    let finalPrice = 0;
    let currency = "gp"; 
    const qty = Math.max(1, Number(quantity || 1));

    if (shopItemData?.customPrice !== null && shopItemData?.customPrice !== undefined) {
        finalPrice = Number(shopItemData.customPrice);
        currency = this._getItemCurrency(item);
    } 
    else {
        const baseInfo = this._getItemBasePrice(item);
        finalPrice = baseInfo.price * markup;
        currency = baseInfo.currency;
        const roundSetting = game.settings.get("campaign-codex", "roundFinalPrice");
        if (roundSetting === false || roundSetting === "false") {
         (Math.round(finalPrice * 100) / 100);
        }else{
        Math.round(finalPrice);
        }
    }
    finalPrice *= qty;

    if (finalPrice <= 0) return null;
    return { cost: finalPrice, currency };
  }

  static _getItemBasePrice(item) {
    const clean = (v) => parseFloat(String(v).replace(/[^\d.]/g, "")) || 0;
    
    const customPricePath = game.settings.get("campaign-codex", "itemPricePath");
    const customDenominationPath = game.settings.get("campaign-codex", "itemDenominationPath");
    const denominationOverride = game.settings.get("campaign-codex", "itemDenominationOverride");

    if (customPricePath) {
        const val = foundry.utils.getProperty(item, customPricePath);
        let denom = "gp";
        if (denominationOverride) {
            denom = denominationOverride;
        } else if (customDenominationPath) {
            denom = foundry.utils.getProperty(item, customDenominationPath) || "gp";
        }
        return { price: clean(val), currency: denom };
    }


    const sys = game.system.id;

    if (sys === "shadowrun6-eden") {
        const p = item.system.priceDef || 0;
        if (p){
           return { price: p, currency: "¥" };
        }
    }

    if (sys === "pf2e") {
        const p = item.system.price?.value || 0;
        if (p){
          const goldValue = p.goldValue;
           return { price: goldValue, currency: "gp" };
        }
    }
    if (sys === "demonlord") {
        const valStr = String(item.system.value || "0");
        const match = valStr.match(/([\d\.]+)\s*(gc|ss|cp|bits)?/i);
        if (!match) return { price: 0, currency: "gc" };
        return { price: parseFloat(match[1]), currency: (match[2] || "gc").toLowerCase() };
    }

    if (sys === "wfrp4e") {
        const cost = item.system.price || {};
        if (cost.gc) return { price: (cost.gc || 0) + (cost.ss || 0)/20 + (cost.bp || 0)/240, currency: "gc" };
        if (cost.ss) return { price: (cost.ss || 0) + (cost.bp || 0)/12, currency: "ss" };
        return { price: cost.bp || 0, currency: "bp" };
    }

    if (sys === "shadowdark") {
        const cost = item.system.cost || {};
        if (cost.gp) return { price: cost.gp + (cost.sp||0)/10 + (cost.cp||0)/100, currency: "gp" };
        if (cost.sp) return { price: cost.sp + (cost.cp||0)/10, currency: "sp" };
        return { price: cost.cp || 0, currency: "cp" };
    }

    if (sys === "fallout") {
        return { price: clean(item.system.cost), currency: "caps" };
    }
    if (sys === "sdm") {
        return { price: clean(item.system.cost), currency: "cash" };
    }    
    const val = item.system.price?.value ?? item.system.price ?? 0;
    let denom = item.system.price?.denomination || "gp";
    
    if (sys === "swade") denom = "currency";


    return { price: clean(val), currency: denom };
  }

  static _getItemCurrency(item) {
      const sys = game.system.id;
     if (sys === "demonlord") {
           const valStr = String(item.system.value || "");
           const match = valStr.match(/[a-zA-Z]+/);
           return match ? match[0].toLowerCase() : "gc";
      }      
      if (sys === "wfrp4e") return "gc";
      if (sys === "shadowrun6-eden") return "¥";
      if (sys === "pf2e") return "gp";
      if (sys === "sfrpg") return "credit";
      if (sys === "fallout") return "caps";
      if (sys === "swade") return "currency";
      if (sys === "sdm") return "€";
      return item.system.price?.denomination || "gp";
  }
}
