import { EconomyHelper } from "./economy-helper.js";
import { localize, format } from "./helper.js";

const XP_SYSTEM_CONFIG = {
  dnd5e: {
    path: "system.details.xp.value",
    enabled: () => {
      try {
        const levelingMode = game.settings.get("dnd5e", "levelingMode");
        if (typeof levelingMode === "string") return levelingMode !== "noxp";
      } catch (_error) {}
      try {
        return !game.settings.get("dnd5e", "disableExperienceTracking");
      } catch (_error) {
        return true;
      }
    },
  },
  sw5e: {
    path: "system.details.xp.value",
    enabled: () => {
      try {
        return !game.settings.get("sw5e", "disableExperienceTracking");
      } catch (_error) {
        return true;
      }
    },
  },
  d35e: {
    path: "system.details.xp.value",
    enabled: () => {
      try {
        return !game.settings.get("D35E", "disableExperienceTracking");
      } catch (_error) {
        return true;
      }
    },
  },
  pf1: { path: "system.details.xp.value", enabled: () => true },
  pf2e: { path: "system.details.xp.value", enabled: () => true },
  sfrpg: {
    path: "system.details.xp.value",
    enabled: () => {
      try {
        return !game.settings.get("sfrpg", "disableExperienceTracking");
      } catch (_error) {
        return true;
      }
    },
  },
  sdm: { path: "system.player_experience", enabled: () => true },
  ds4: { path: "system.progression.experiencePoints", enabled: () => true },
  ose: { path: "system.details.xp.value", enabled: () => true },
  tormenta20: { path: "system.attributes.nivel.xp.value", enabled: () => true },
};

export class QuestAwards {
  static getSupport() {
    const xpCfg = XP_SYSTEM_CONFIG[game.system.id];
    const supportsXP = Boolean(xpCfg && xpCfg.enabled());
    const supportsCurrency = EconomyHelper.canAddCurrency();
    return {
      supportsXP,
      supportsCurrency,
      canDistribute: supportsXP || supportsCurrency,
    };
  }

  static getEligibleRecipients() {
    const byActorId = new Map();
    for (const user of game.users || []) {
      const role = Number(user.role ?? 0);
      if (!user.character) continue;
      if (role < CONST.USER_ROLES.PLAYER || role >= CONST.USER_ROLES.ASSISTANT) continue;
      const actor = user.character;
      const existing = byActorId.get(actor.id);
      if (existing) {
        existing.users.push(user.name);
        existing.active = existing.active || Boolean(user.active);
      } else {
        byActorId.set(actor.id, {
          actor,
          users: [user.name],
          active: Boolean(user.active),
        });
      }
    }
    return Array.from(byActorId.values())
      .map((entry) => ({
        actor: entry.actor,
        actorId: entry.actor.id,
        actorUuid: entry.actor.uuid,
        name: entry.actor.name,
        img: entry.actor.img,
        usersLabel: entry.users.join(", "),
        active: entry.active,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  static async openDistributionDialog({ quest, currencyKey = "gp" } = {}) {
    const support = QuestAwards.getSupport();
    if (!support.canDistribute) {
      ui.notifications.warn(localize("notify.awardsUnsupportedSystem"));
      return null;
    }

    const recipients = QuestAwards.getEligibleRecipients();
    if (!recipients.length) {
      ui.notifications.warn(localize("notify.noAssignedCharacters"));
      return null;
    }

    const totalXP = Math.max(0, Number(quest?.rewardXP || 0));
    const totalCurrency = Math.max(0, Number(quest?.rewardCurrency || 0));
    const canAwardXP = support.supportsXP && totalXP > 0;
    const canAwardCurrency = support.supportsCurrency && totalCurrency > 0;

    if (!canAwardXP && !canAwardCurrency) {
      ui.notifications.warn(localize("notify.noRewardsToDistribute"));
      return null;
    }

    const content = `
      <div class="campaign-codex cc-awards-dialog">
        <div class="form-group">
          <div class="cc-awards-pill-row">
            <input type="hidden" name="xpMode" value="each">
            <button type="button" class="cc-awards-mode-toggle" data-mode-target="xpMode" ${canAwardXP ? "" : "disabled"}>
              <i class="fa-solid fa-circle-half-stroke"></i>
            </button>

            <label class="cc-awards-pill ${canAwardXP ? "" : "is-disabled"}">
              <i class="fa-solid fa-swords"></i>
              <input type="checkbox" class="cc-awards-hidden-input" name="includeXP" ${canAwardXP ? "checked" : ""} ${canAwardXP ? "" : "disabled"}>
              <span>${localize("dialog.includeXP")} (${totalXP})</span>
            </label>

            <input type="hidden" name="currencyMode" value="split">
            <button type="button" class="cc-awards-mode-toggle" data-mode-target="currencyMode" ${canAwardCurrency ? "" : "disabled"} >
              <i class="fa-solid fa-circle"></i>
            </button>
            <label class="cc-awards-pill ${canAwardCurrency ? "" : "is-disabled"}">
              <i class="fa-solid fa-coins"></i>

              <input type="checkbox" class="cc-awards-hidden-input" name="includeCurrency" ${canAwardCurrency ? "checked" : ""} ${canAwardCurrency ? "" : "disabled"}>
              <span>${localize("dialog.includeCurrency")} (${totalCurrency} ${String(currencyKey || "").toUpperCase()})</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <div class="cc-awards-recipient-list">
            ${recipients.map((r) => `
              <label class="cc-awards-recipient">
                <input type="checkbox" class="cc-awards-hidden-input" name="recipient" value="${r.actorId}" checked>
                <img src="${r.img}" alt="${r.name}">
                <span>${r.name} <small>(${r.usersLabel})${r.active ? "" : ` - ${localize("dialog.offline")}`}</small></span>
              </label>
            `).join("")}
          </div>
        </div>
      </div>
    `;

    const dialogResult = await foundry.applications.api.DialogV2.prompt({
      window: { title: localize("dialog.distributeAwardsTitle") },
      content,
      ok: {
        icon: '<i class="fas fa-gift"></i>',
        label: localize("dialog.distributeAwardsTitle"),
        callback: (_event, button) => {
          const form = button.form;
          const selectedIds = Array.from(form.querySelectorAll('input[name="recipient"]:checked')).map((el) => el.value);
          if (!selectedIds.length) return null;
          const includeXP = form.elements.includeXP?.checked ?? false;
          const includeCurrency = form.elements.includeCurrency?.checked ?? false;
          const xpMode = String(form.elements.xpMode?.value || "each");
          const currencyMode = String(form.elements.currencyMode?.value || "split");
          return { selectedIds, includeXP, includeCurrency, xpMode, currencyMode };
        },
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: localize("dialog.cancel"),
      },
      render: (dialog) => {
        const form = dialog?.target?.element?.querySelector("form");
        if (!form) return;

        const modeButtons = form.querySelectorAll(".cc-awards-mode-toggle[data-mode-target]");
        const setButtonState = (button, modeValue) => {
          const icon = button.querySelector("i");
          const isSplit = modeValue === "split";
          const stateLabel = isSplit ? localize("dialog.divideAmongSelected") : localize("dialog.totalToEachSelected");
          if (icon) icon.className = isSplit ? "fa-solid fa-circle-half-stroke" : "fa-solid fa-circle";
          button.title = stateLabel;
          button.setAttribute("aria-label", stateLabel);
        };

        for (const button of modeButtons) {
          const modeFieldName = button.dataset.modeTarget;
          const modeField = form.elements[modeFieldName];
          if (!modeField) continue;
          setButtonState(button, String(modeField.value || "split"));
          button.addEventListener("click", () => {
            const next = String(modeField.value || "split") === "split" ? "each" : "split";
            modeField.value = next;
            setButtonState(button, next);
          });
        }
      },
      rejectClose: false,
    }).catch(() => null);

    if (!dialogResult) return null;

    const selectedRecipients = recipients.filter((r) => dialogResult.selectedIds.includes(r.actorId));
    if (!selectedRecipients.length) return null;

    const xpDistribution = dialogResult.includeXP
      ? QuestAwards._buildDistribution(totalXP, selectedRecipients.length, dialogResult.xpMode, { integer: true })
      : [];
    const currencyDistribution = dialogResult.includeCurrency
      ? QuestAwards._buildDistribution(totalCurrency, selectedRecipients.length, dialogResult.currencyMode, { integer: true })
      : [];

    let xpRecipients = 0;
    let currencyRecipients = 0;
    const chatLines = [];
    const currencyLabel = String(currencyKey || "").toUpperCase();

    for (let i = 0; i < selectedRecipients.length; i++) {
      const actor = selectedRecipients[i].actor;
      const xp = Number(xpDistribution[i] || 0);
      const currencyAmount = Number(currencyDistribution[i] || 0);

      if (xp > 0) {
        const ok = await QuestAwards._awardXP(actor, xp);
        if (ok) xpRecipients += 1;
      }
      if (currencyAmount > 0) {
        const ok = await EconomyHelper.addCurrency(actor, currencyAmount, currencyKey);
        if (ok) currencyRecipients += 1;
      }

      const parts = [];
      if (xp > 0) parts.push(`<span class="cc-wgtngm-doc-link">${Math.floor(xp)} XP</span>`);
      if (currencyAmount > 0) parts.push(`<span class="cc-wgtngm-doc-link">${currencyAmount} ${currencyLabel}</span>`);
      if (parts.length) {
        const actorLink = actor?.uuid ? `@UUID[${actor.uuid}]{${actor.name}}` : actor.name;
        chatLines.push(`<p class="cc-wgtngm-doc-flex"><span class="cc-wgtngm-doc-link">${actorLink}</span> ${parts.join(" ")}</p>`);
      }
    }

    if (chatLines.length) {
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker(),
        content: `<p><strong>Quest Reward Sent</strong></p>${chatLines.join("")}`,
      });
    }

    ui.notifications.info(
      format("notify.awardsDistributed", {
        count: selectedRecipients.length,
        xpCount: xpRecipients,
        currencyCount: currencyRecipients,
      }),
    );

    return {
      recipients: selectedRecipients.length,
      xpRecipients,
      currencyRecipients,
    };
  }

  static _buildDistribution(total, count, mode, { integer = false } = {}) {
    const safeTotal = Math.max(0, Number(total || 0));
    const safeCount = Math.max(1, Number(count || 1));
    if (safeTotal <= 0) return Array.from({ length: safeCount }, () => 0);

    if (mode === "each") {
      return Array.from({ length: safeCount }, () => (integer ? Math.ceil(safeTotal) : safeTotal));
    }

    if (integer) {
      const whole = Math.ceil(safeTotal);
      const base = Math.floor(whole / safeCount);
      let remainder = whole - (base * safeCount);
      return Array.from({ length: safeCount }, () => {
        if (remainder > 0) {
          remainder -= 1;
          return base + 1;
        }
        return base;
      });
    }

    const cents = Math.round(safeTotal * 100);
    const baseCents = Math.floor(cents / safeCount);
    let remainderCents = cents - (baseCents * safeCount);
    return Array.from({ length: safeCount }, () => {
      if (remainderCents > 0) {
        remainderCents -= 1;
        return (baseCents + 1) / 100;
      }
      return baseCents / 100;
    });
  }

  static async _awardXP(actor, amount) {
    const xpCfg = XP_SYSTEM_CONFIG[game.system.id];
    if (!xpCfg || !xpCfg.enabled()) return false;
    const current = Number(foundry.utils.getProperty(actor, xpCfg.path) || 0);
    await actor.update({ [xpCfg.path]: current + Math.max(0, Math.floor(Number(amount || 0))) });
    return true;
  }
}
