import { CampaignCodexLinkers } from "./sheets/linkers.js";
import { localize } from "./helper.js";

export async function buildQuestCompletionChatContent({ quest = {}, questDoc = null, fallbackTitle = "" } = {}) {
  const title = String(fallbackTitle || quest?.title || localize("names.quest"));
  const currencyLabel = String(CampaignCodexLinkers.getCurrency() || "gp").toUpperCase();
  const data = questDoc?.getFlag("campaign-codex", "data") || {};
  const rewardInventorySource = Array.isArray(data.inventory) ? data.inventory : [];
  const rewardItems = questDoc ? await CampaignCodexLinkers.getInventory(questDoc, rewardInventorySource) : [];

  const rewardLines = [];
  if (Number(quest?.rewardXP || 0) > 0) rewardLines.push(`<li><strong>XP:</strong> ${Number(quest.rewardXP || 0)}</li>`);
  if (Number(quest?.rewardCurrency || 0) > 0) rewardLines.push(`<li><strong>${currencyLabel}:</strong> ${Number(quest.rewardCurrency || 0)}</li>`);
  if (Number(quest?.rewardReputation || 0) > 0) rewardLines.push(`<li><strong>${localize("quest.reputation")}:</strong> ${Number(quest.rewardReputation || 0)}</li>`);

  const linkedDocs = [];
  for (const item of rewardItems) {
    const itemUuid = item.itemUuid || item.uuid;
    if (!itemUuid) continue;
    const qty = Math.max(1, Number(item.quantity || 1));
    const safeName = foundry.utils.escapeHTML(String(item.name || localize("names.item")));
    const qtyLabel = qty > 1 ? ` x${qty}` : "";
    linkedDocs.push(`<span class="wgtngm-doc-link cc-wgtngm-doc-link">@UUID[${itemUuid}]{${safeName}}</span>${qtyLabel}`);
  }

  const macroButtons = [];
  const linkedMacros = Array.isArray(quest?.linkedMacros) ? quest.linkedMacros : [];
  for (const macroUuid of linkedMacros) {
    const macro = await fromUuid(macroUuid).catch(() => null);
    if (!macro || macro.documentName !== "Macro") continue;
    const safeMacroName = foundry.utils.escapeHTML(macro.name || "Macro");
    const attrId = macro.id ? ` data-macro-id="${macro.id}"` : "";
    const attrUuid = macro.uuid ? ` data-macro-uuid="${macro.uuid}"` : "";
    macroButtons.push(`<button type="button" class="wgtngm-execute-macro cc-wgtngm-execute-macro cc-chat-macro-btn" data-campaign-codex-handler="campaign-codex|executeMacro|${macro.uuid}"${attrId}${attrUuid}><i class="fas fa-play"></i> Execute: ${safeMacroName}</button>`);
  }




  const safeTitle = foundry.utils.escapeHTML(title);

  const questUuid = questDoc?.uuid ? String(questDoc.uuid) : "";
  const linkedTitle = questUuid ? `@UUID[${questUuid}]{${safeTitle}}` : safeTitle;
  
  let content = `<h4><span class="cc-service-link-name">${linkedTitle}</span> - ${localize("quest.completed")}</h4>`;
  if (rewardLines.length) {
    content += `<p><strong>${localize("quest.rewards")}</strong></p><ul>${rewardLines.join("")}</ul>`;
  }
  if (linkedDocs.length) {
    content += `<div class="wgtngm-linked-docs cc-wgtngm-linked-docs">${linkedDocs.join(" ")}</div>`;
  }
  if (macroButtons.length) {
    content += `<div class="wgtngm-macro-buttons cc-wgtngm-macro-buttons">${macroButtons.join("")}</div>`;
  }
  return content;
}
