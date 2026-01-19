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
  ]
};

export class EconomyHelper {

  static async removeCost(item, targetActor, shopItemData, markup = 1.0) {
    const systemId = game.system.id;
    const config = CURRENCY_CONFIG[systemId];

    if (!config) {
      console.warn(`Campaign Codex | System '${systemId}' is not configured for payments.`);
      return true;
    }

    const priceDetails = this._calculateFinalPrice(item, shopItemData, markup);
    if (!priceDetails || priceDetails.cost <= 0) return true; 

    const { cost, currency } = priceDetails;

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


static async _paySimple(actor, cost, path) {
    const currentVal = foundry.utils.getProperty(actor, path) || 0;
    if (currentVal >= cost) {
      await actor.update({ [path]: currentVal - cost });
      return true;
    }
    ui.notifications.warn(localize("warn.notEnoughCurrency") || `Not enough funds.`);
    return false;
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

    let totalCopper = Math.round(cost * (rate * 100));

    const pp = Math.floor(totalCopper / 1000);
    totalCopper %= 1000;
    const gp = Math.floor(totalCopper / 100);
    totalCopper %= 100;
    const sp = Math.floor(totalCopper / 10);
    totalCopper %= 10;
    const cp = totalCopper;
    const costObject = { pp, gp, sp, cp };
    try {
        await actor.inventory.removeCurrency(costObject);
        return true;
    } catch (e) {
        ui.notifications.warn(localize("warn.notEnoughCurrency") || `Not enough funds.`);
        return false;
    }
  }


  static _calculateFinalPrice(item, shopItemData, markup) {
    let finalPrice = 0;
    let currency = "gp"; 

    if (shopItemData?.customPrice !== null && shopItemData?.customPrice !== undefined) {
        finalPrice = Number(shopItemData.customPrice);
        currency = this._getItemCurrency(item);
    } 
    else {
        const baseInfo = this._getItemBasePrice(item);
        finalPrice = baseInfo.price * markup;
        currency = baseInfo.currency;
        const roundSetting = game.settings.get("campaign-codex", "roundFinalPrice");
        finalPrice = roundSetting ? Math.round(finalPrice) : (Math.round(finalPrice * 100) / 100);
    }
    if (finalPrice <= 0) return null;
    return { cost: finalPrice, currency };
  }

  static _getItemBasePrice(item) {
    const clean = (v) => parseFloat(String(v).replace(/[^\d.]/g, "")) || 0;
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
      return item.system.price?.denomination || "gp";
  }
}