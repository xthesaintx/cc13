import { localize } from "../helper.js";

const { DialogV2 } = foundry.applications.api;

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(value) {
    return foundry.utils.escapeHTML(String(value ?? ""));
}

function getTotalXp(rows, quantityByUuid = null) {
    return rows.reduce((sum, row) => {
        const qty = quantityByUuid
            ? Math.max(0, Math.trunc(toNumber(quantityByUuid.get(row.uuid), row.current)))
            : Math.max(0, Math.trunc(toNumber(row.current, 1)));
        return sum + (Math.max(0, toNumber(row.xp, 0)) * qty);
    }, 0);
}

function suggestQuantities(rows, targetXp) {
    const nextByUuid = new Map(rows.map((row) => [row.uuid, row.current]));
    const eligibleRows = rows.filter((row) => row.autoEligible);
    let currentXp = getTotalXp(rows, nextByUuid);

    if (!eligibleRows.length) return { nextByUuid, currentXp };

    const baseUnit = Math.min(...eligibleRows.map((row) => row.cost));
    const orderedRows = [...eligibleRows].sort((a, b) => {
        const xpDiff = a.xp - b.xp;
        if (xpDiff !== 0) return xpDiff;
        const costDiff = a.cost - b.cost;
        if (costDiff !== 0) return costDiff;
        return String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true, sensitivity: "base" });
    });

    const maxCycles = 5000;
    for (let cycle = 0; cycle < maxCycles; cycle++) {
        const distance = Math.abs(targetXp - currentXp);
        if (distance === 0) break;

        const direction = targetXp > currentXp ? 1 : -1;
        let changed = false;

        for (const row of orderedRows) {
            row.progress = toNumber(row.progress, 0) + baseUnit;
            while (row.progress + 1e-9 >= row.cost) {
                const currentQty = nextByUuid.get(row.uuid) ?? 1;
                if (direction < 0 && row.autoReduceBlocked) {
                    row.progress = row.cost - 1e-9;
                    break;
                }
                if (direction < 0 && currentQty <= 1) {
                    row.progress = row.cost - 1e-9;
                    break;
                }

                const candidateQty = currentQty + direction;
                const candidateXp = currentXp + (direction * row.xp);
                const candidateDistance = Math.abs(targetXp - candidateXp);
                if (candidateDistance > distance) break;

                nextByUuid.set(row.uuid, candidateQty);
                currentXp = candidateXp;
                row.progress -= row.cost;
                changed = true;
            }
            if (currentXp === targetXp) break;
        }

        if (!changed) break;
    }

    return { nextByUuid, currentXp };
}

export class ActorDropperBalanceDialogHelperCore {
    static async open({ rows = [], title = "", adapter } = {}) {
        if (!adapter || typeof adapter.promptSetup !== "function" || typeof adapter.prepareRows !== "function" || typeof adapter.getBudget !== "function") {
            console.error("Campaign Codex | ActorDropperBalanceDialogCore missing adapter methods.");
            return null;
        }

        const setup = await adapter.promptSetup(title);
        if (!setup || typeof setup !== "object" || Array.isArray(setup)) return null;

        const preparedRows = adapter.prepareRows(Array.isArray(rows) ? rows : [], setup) || [];
        if (!preparedRows.length) return null;

        const budget = adapter.getBudget(setup);
        const targetXp = Math.max(0, Math.trunc(toNumber(budget?.targetXp, 0)));
        const currentXp = getTotalXp(preparedRows);
        const { nextByUuid: suggestedByUuid, currentXp: suggestedXp } = suggestQuantities(preparedRows, targetXp);

        const summary = {
            targetXp,
            targetDescriptor: String(budget?.targetDescriptor || ""),
            rankColumnLabel: String(budget?.rankColumnLabel || (localize("dialog.level") || "Level")),
            currentXp,
            suggestedXp,
            overBy: Math.max(0, suggestedXp - targetXp),
            underBy: Math.max(0, targetXp - suggestedXp)
        };

        return this.#promptReview({ rows: preparedRows, suggestedByUuid, summary });
    }

    static async #promptReview({ rows, suggestedByUuid, summary }) {
        const actorRows = rows.map((row, index) => {
            const suggested = suggestedByUuid.get(row.uuid) ?? row.current;
            const xpText = row.xp > 0 ? row.xp.toLocaleString() : "-";
            const rankText = String(row.rankText ?? "-");
            const isLocked = row.autoReduceBlocked === true;
            const minQty = isLocked ? 1 : 0;
            const manualIcon = !row.autoEligible
                ? `<i class="fa-solid fa-hand cc-actor-balance-flag" title="${escapeHtml(localize("dialog.balanceManualOnly") || "manual only")}" aria-label="${escapeHtml(localize("dialog.balanceManualOnly") || "manual only")}"></i>`
                : "";
            const lockIcon = row.autoReduceBlocked
                ? `<i class="fa-solid fa-lock cc-actor-balance-flag cc-actor-balance-flag-toggle" role="button" tabindex="0" data-lock-toggle="${index}" data-lock-icon="${index}" aria-pressed="${isLocked ? "true" : "false"}" title="${escapeHtml(localize("dialog.balanceClickToUnlock") || "Click to unlock")}" aria-label="${escapeHtml(localize("dialog.balanceClickToUnlock") || "Click to unlock")}"></i>`
                : "";

            return `
        <tr>
          <td>
            <div>${escapeHtml(row.name)} ${manualIcon}${lockIcon}</div>
          </td>
          <td style="text-align:center;">${rankText}</td>
          <td style="text-align:center;">${xpText}</td>
          <td style="text-align:center;">${row.current}</td>
          <td style="text-align:center;">
            <input type="number" name="new-${index}" value="${suggested}" min="${minQty}" step="1" style="width:60px; text-align:center;margin: 4px;">
            <input type="hidden" name="uuid-${index}" value="${escapeHtml(row.uuid)}">
            <input type="hidden" name="lock-${index}" value="${isLocked ? "1" : "0"}">
          </td>
        </tr>
      `;
        }).join("");

        const overUnderText = summary.overBy > 0
            ? `${localize("dialog.stillOverBudget") || "Still Over Budget"}: ${summary.overBy.toLocaleString()} XP`
            : (summary.underBy > 0
                ? `${localize("dialog.underBudgetBy") || "Under Budget By"}: ${summary.underBy.toLocaleString()} XP`
                : (localize("dialog.onBudget") || "On Budget"));

        const overUnderClass = summary.overBy > 0 ? "is-over" : (summary.underBy > 0 ? "is-under" : "is-even");

        const content = `
      <div class="campaign-codex cc-actor-balance-dialog">
        <div class="cc-actor-balance-summary">
          <div><strong>${localize("dialog.target") || "Target"}:</strong> ${escapeHtml(summary.targetDescriptor)} = ${summary.targetXp.toLocaleString()} XP</div>
          <div>
            <strong>${localize("dialog.currentBeforeEdits") || "Current"}:</strong> <span data-balance-suggested>${summary.suggestedXp.toLocaleString()}</span> XP
          </div>
          <div class="cc-actor-balance-status ${overUnderClass}" data-balance-status>${overUnderText}</div>
        </div>
        <table class="cc-actor-balance-table">
          <thead>
            <tr>
              <th style="min-width: 200px;">${localize("names.actor") || "Actor"}</th>
              <th style="min-width: 50px;">${escapeHtml(summary.rankColumnLabel)}</th>
              <th style="min-width: 50px;"> ${localize("ui.xpLabel") || "XP"}</th>
              <th style="min-width: 75px;">${localize("dialog.current") || "Current"}</th>
              <th style="min-width: 75px;">${localize("dialog.new") || "New"}</th>
            </tr>
          </thead>
          <tbody>${actorRows}</tbody>
        </table>
      </div>
    `;

        return DialogV2.wait({
            window: { title: localize("dialog.reviewEncounterQuantities") || "Review Encounter Quantities" },
            content,
            modal: true,
            rejectClose: false,
            buttons: [
                { action: "cancel", label: localize("dialog.cancel") || "Cancel", callback: () => null },
                {
                    action: "save",
                    label: localize("dialog.save") || "Save",
                    default: true,
                    callback: (_event, button) => {
                        const form = button.form ?? button.closest("form");
                        if (!form) return {};
                        const updatedByUuid = {};
                        for (let i = 0; i < rows.length; i++) {
                            const uuid = String(form.elements[`uuid-${i}`]?.value || "");
                            if (!uuid) continue;
                            const fallback = suggestedByUuid.get(uuid) ?? rows[i].current;
                            const isLocked = String(form.elements[`lock-${i}`]?.value || "0") === "1";
                            const minQty = isLocked ? 1 : 0;
                            updatedByUuid[uuid] = Math.max(minQty, Math.trunc(toNumber(form.elements[`new-${i}`]?.value, fallback)));
                        }
                        return updatedByUuid;
                    }
                }
            ],
            render: (dialog) => {
                const root = dialog?.target?.element;
                const form = root?.querySelector("form");
                const scope = form ?? root;
                if (!scope) return;

                const suggestedEl = scope.querySelector("[data-balance-suggested]");
                const statusEl = scope.querySelector("[data-balance-status]");
                if (!statusEl) return;

                const getField = (name) => form?.elements?.[name] ?? scope.querySelector(`[name="${name}"]`);

                const updateSummary = () => {
                    let adjustedXp = 0;
                    for (let i = 0; i < rows.length; i++) {
                        const input = getField(`new-${i}`);
                        const isLocked = String(getField(`lock-${i}`)?.value || "0") === "1";
                        const minQty = isLocked ? 1 : 0;
                        const qty = Math.max(minQty, Math.trunc(toNumber(input?.value, rows[i].current)));
                        if (input && String(input.value) !== String(qty)) input.value = String(qty);
                        adjustedXp += qty * Math.max(0, toNumber(rows[i].xp, 0));
                    }

                    const overBy = Math.max(0, adjustedXp - summary.targetXp);
                    const underBy = Math.max(0, summary.targetXp - adjustedXp);
                    const text = overBy > 0
                        ? `${localize("dialog.stillOverBudget") || "Still Over Budget"}: ${overBy.toLocaleString()} XP`
                        : (underBy > 0
                            ? `${localize("dialog.underBudgetBy") || "Under Budget By"}: ${underBy.toLocaleString()} XP`
                            : (localize("dialog.onBudget") || "On Budget"));
                    const cls = overBy > 0 ? "is-over" : (underBy > 0 ? "is-under" : "is-even");

                    if (suggestedEl) suggestedEl.textContent = adjustedXp.toLocaleString();
                    statusEl.textContent = text;
                    statusEl.classList.remove("is-over", "is-under", "is-even");
                    statusEl.classList.add(cls);
                };

                const qtyInputs = scope.querySelectorAll('input[name^="new-"]');
                qtyInputs.forEach((input) => {
                    input.addEventListener("input", updateSummary);
                    input.addEventListener("change", updateSummary);
                });

                const lockButtons = scope.querySelectorAll("[data-lock-toggle]");
                lockButtons.forEach((button) => {
                    button.addEventListener("click", () => {
                        const index = Number(button.dataset.lockToggle);
                        if (!Number.isFinite(index)) return;
                        const lockField = getField(`lock-${index}`);
                        const qtyInput = getField(`new-${index}`);
                        const lockIcon = scope.querySelector(`[data-lock-icon="${index}"]`);
                        if (!lockField || !qtyInput || !lockIcon) return;

                        const currentlyLocked = String(lockField.value || "0") === "1";
                        const nextLocked = !currentlyLocked;
                        lockField.value = nextLocked ? "1" : "0";

                        const minQty = nextLocked ? 1 : 0;
                        qtyInput.min = String(minQty);
                        if (Math.trunc(toNumber(qtyInput.value, minQty)) < minQty) qtyInput.value = String(minQty);

                        lockIcon.classList.remove("fa-lock", "fa-lock-open");
                        lockIcon.classList.add(nextLocked ? "fa-lock" : "fa-lock-open");
                        button.setAttribute("aria-pressed", nextLocked ? "true" : "false");
                        const label = nextLocked
                            ? (localize("dialog.balanceClickToUnlock") || "Click to unlock")
                            : (localize("dialog.balanceClickToLock") || "Click to lock");
                        button.setAttribute("title", label);
                        button.setAttribute("aria-label", label);

                        updateSummary();
                    });
                    button.addEventListener("keydown", (event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        button.click();
                    });
                });

                updateSummary();
            }
        });
    }
}
