import { localize } from "../helper.js";

const { DialogV2 } = foundry.applications.api;

const XP_BUDGET_2024 = {
    1: { low: 50, moderate: 75, high: 100 },
    2: { low: 100, moderate: 150, high: 200 },
    3: { low: 150, moderate: 225, high: 400 },
    4: { low: 250, moderate: 375, high: 500 },
    5: { low: 500, moderate: 750, high: 1100 },
    6: { low: 600, moderate: 1000, high: 1400 },
    7: { low: 750, moderate: 1300, high: 1700 },
    8: { low: 1000, moderate: 1700, high: 2100 },
    9: { low: 1300, moderate: 2000, high: 2600 },
    10: { low: 1600, moderate: 2300, high: 3100 },
    11: { low: 1900, moderate: 2900, high: 4100 },
    12: { low: 2200, moderate: 3700, high: 4700 },
    13: { low: 2600, moderate: 4200, high: 5400 },
    14: { low: 2900, moderate: 4900, high: 6200 },
    15: { low: 3300, moderate: 5400, high: 7800 },
    16: { low: 3800, moderate: 6100, high: 9800 },
    17: { low: 4500, moderate: 7200, high: 11700 },
    18: { low: 5000, moderate: 8700, high: 14200 },
    19: { low: 5500, moderate: 10700, high: 17200 },
    20: { low: 6400, moderate: 13200, high: 22000 },
};

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(value) {
    return foundry.utils.escapeHTML(String(value ?? ""));
}

function parseCr(raw) {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
        const value = raw.trim();
        if (!value) return 0;
        if (value.includes("/")) {
            const [a, b] = value.split("/").map((part) => Number(part.trim()));
            if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b;
            return 0;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (raw && typeof raw === "object") {
        return parseCr(raw.value ?? raw.cr ?? raw.base ?? raw.total ?? 0);
    }
    return 0;
}

function formatCr(cr) {
    if (!Number.isFinite(cr) || cr <= 0) return "0";
    if (cr === 0.125) return "1/8";
    if (cr === 0.25) return "1/4";
    if (cr === 0.5) return "1/2";
    if (Number.isInteger(cr)) return String(cr);
    return String(Math.round(cr * 100) / 100);
}

function getTotalXp(rows, quantityByUuid = null) {
    return rows.reduce((sum, row) => {
        const qty = quantityByUuid
            ? Math.max(1, Math.trunc(toNumber(quantityByUuid.get(row.uuid), row.current)))
            : Math.max(1, Math.trunc(toNumber(row.current, 1)));
        return sum + (Math.max(0, toNumber(row.xp, 0)) * qty);
    }, 0);
}

function getTargetBudget({ level, players, difficulty }) {
    const clampedLevel = Math.max(1, Math.min(20, Math.trunc(toNumber(level, 1))));
    const clampedPlayers = Math.max(1, Math.min(20, Math.trunc(toNumber(players, 4))));
    const normalizedDifficulty = ["low", "moderate", "high"].includes(String(difficulty))
        ? String(difficulty)
        : "moderate";
    const perCharacterBudget = XP_BUDGET_2024[clampedLevel][normalizedDifficulty];
    return {
        level: clampedLevel,
        players: clampedPlayers,
        difficulty: normalizedDifficulty,
        perCharacterBudget,
        targetXp: perCharacterBudget * clampedPlayers
    };
}

function prepareRows(rawRows) {
    const rows = rawRows.map((row) => {
        const current = Math.max(1, Math.trunc(toNumber(row.current, 1)));
        const xp = Math.max(0, toNumber(row.xp, 0));
        const cr = parseCr(row.cr);
        const effectiveCr = cr > 0 ? cr : 1;
        const cost = xp > 0 ? xp / effectiveCr : Infinity;
        return {
            uuid: String(row.uuid || ""),
            name: String(row.name || "Unknown Actor"),
            current,
            xp,
            cr,
            cost,
            autoEligible: Number.isFinite(cost) && cost > 0,
            autoReduceBlocked: false,
            progress: 0
        };
    }).filter((row) => !!row.uuid);

    const reducibleRows = rows.filter((row) => row.autoEligible && Number.isFinite(row.cr));
    const maxCr = reducibleRows.length ? Math.max(...reducibleRows.map((row) => row.cr)) : 0;
    if (maxCr > 0) {
        for (const row of rows) {
            if (row.cr === maxCr) row.autoReduceBlocked = true;
        }
    }
    return rows;
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
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });

    const maxCycles = 5000;
    for (let cycle = 0; cycle < maxCycles; cycle++) {
        const distance = Math.abs(targetXp - currentXp);
        if (distance === 0) break;

        const direction = targetXp > currentXp ? 1 : -1;
        let changed = false;

        for (const row of orderedRows) {
            row.progress += baseUnit;
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

export class ActorDropperBalanceDialogHelper {
    static async open({ rows = [], title = "" } = {}) {
        const preparedRows = prepareRows(Array.isArray(rows) ? rows : []);
        if (!preparedRows.length) return null;

        const setup = await this.#promptSetup(title);
        if (!setup) return null;

        const budget = getTargetBudget(setup);
        const currentXp = getTotalXp(preparedRows);
        const { nextByUuid: suggestedByUuid, currentXp: suggestedXp } = suggestQuantities(preparedRows, budget.targetXp);
        const overBy = Math.max(0, suggestedXp - budget.targetXp);
        const underBy = Math.max(0, budget.targetXp - suggestedXp);
        const difficultyLabel = budget.difficulty.charAt(0).toUpperCase() + budget.difficulty.slice(1);

        return this.#promptReview({
            rows: preparedRows,
            suggestedByUuid,
            summary: {
                ...budget,
                difficultyLabel,
                currentXp,
                suggestedXp,
                overBy,
                underBy
            }
        });
    }

    static async #promptSetup(title) {
        const defaultPlayers = Math.max(
            1,
            game.actors.filter((a) => a?.type === "character" && a.hasPlayerOwner).length || 4
        );
        const levelOptions = Array.from({ length: 20 }, (_, i) => {
            const level = i + 1;
            const selected = level === 5 ? " selected" : "";
            return `<option value="${level}"${selected}>${level}</option>`;
        }).join("");

        const content = `
      <div class="campaign-codex cc-actor-balance-dialog">
        <div class="form-group">
          <label>${localize("dialog.targetPartyLevel") || "Target Party Level"}</label>
          <select name="level">${levelOptions}</select>
        </div>
        <div class="form-group">
          <label>${localize("dialog.numberOfPlayers") || "Number of Players"}</label>
          <input type="number" name="players" value="${defaultPlayers}" min="1" max="20" step="1">
        </div>
        <div class="form-group">
          <label>${localize("dialog.difficulty") || "Difficulty"}</label>
          <select name="difficulty">
            <option value="low">${localize("dialog.difficultyLow") || "Low"}</option>
            <option value="moderate" selected>${localize("dialog.difficultyModerate") || "Moderate"}</option>
            <option value="high">${localize("dialog.difficultyHigh") || "High"}</option>
          </select>
        </div>
        <p class="notes">
          ${localize("dialog.balanceEncounterBudgetNote") || "XP budget per character x players (2024 DMG)."}
        </p>
      </div>
    `;

        return DialogV2.wait({
            window: { title: title ? `${localize("dialog.balanceEncounter") || "Balance Encounter"} - ${title}` : (localize("dialog.balanceEncounter") || "Balance Encounter") },
            content,
            modal: true,
            rejectClose: false,
            buttons: [
                { action: "cancel", label: localize("dialog.cancel") || "Cancel", callback: () => null },
                {
                    action: "continue",
                    label: localize("dialog.confirm") || "Confirm",
                    default: true,
                    callback: (_event, button) => {
                        const form = button.form;
                        return {
                            level: Math.trunc(toNumber(form.elements.level.value, 5)),
                            players: Math.trunc(toNumber(form.elements.players.value, 4)),
                            difficulty: String(form.elements.difficulty.value || "moderate").toLowerCase(),
                        };
                    }
                }
            ]
        });
    }

    static async #promptReview({ rows, suggestedByUuid, summary }) {
        const actorRows = rows.map((row, index) => {
            const suggested = suggestedByUuid.get(row.uuid) ?? row.current;
            const xpText = row.xp > 0 ? row.xp.toLocaleString() : "-";
            const isLocked = row.autoReduceBlocked === true;
            const minQty = isLocked ? row.current : 0;
            const manualIcon = !row.autoEligible
                ? `<i class="fa-solid fa-hand cc-actor-balance-flag" title="${escapeHtml(localize("dialog.balanceManualOnly") || "manual only")}" aria-label="${escapeHtml(localize("dialog.balanceManualOnly") || "manual only")}"></i>`
                : "";
            const lockIcon = row.autoReduceBlocked
                ? `<i class="fa-solid fa-lock cc-actor-balance-flag cc-actor-balance-flag-toggle" role="button" tabindex="0" data-lock-toggle="${index}" data-lock-icon="${index}" aria-pressed="${isLocked ? "true" : "false"}" title="${escapeHtml(localize("dialog.balanceClickToUnlock") || "Click to unlock")}" aria-label="${escapeHtml(localize("dialog.balanceClickToUnlock") || "Click to unlock")}"></i>`
                : "";
            const flagsHtml = `${manualIcon}${lockIcon}`;

            return `
        <tr>
          <td>
            <div>${escapeHtml(row.name)} ${flagsHtml}</div>
          </td>
          <td style="text-align:center;">${formatCr(row.cr)}</td>
          <td style="text-align:right;">${xpText}</td>
          <td style="text-align:center;">${row.current}</td>
          <td style="text-align:center;">
            <input type="number" name="new-${index}" value="${suggested}" min="${minQty}" data-min-qty="${minQty}" step="1" style="width:72px; text-align:center;">
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
          <div><strong>${localize("dialog.target") || "Target"}:</strong> L${summary.level} ${summary.difficultyLabel} x ${summary.players} = ${summary.targetXp.toLocaleString()} XP</div>
          <div>
            <strong>${localize("dialog.current") || "Current"}:</strong> ${summary.currentXp.toLocaleString()} XP
            |
            <strong>${localize("dialog.suggested") || "Suggested"}:</strong>
            <span data-balance-suggested>${summary.suggestedXp.toLocaleString()}</span> XP
          </div>
          <div class="cc-actor-balance-status ${overUnderClass}" data-balance-status>${overUnderText}</div>
        </div>
        <table class="cc-actor-balance-table">
          <thead>
            <tr>
              <th>${localize("names.actor") || "Actor"}</th>
              <th>${localize("ui.cr") || "CR"}</th>
              <th>${localize("ui.xpLabel") || "XP"}</th>
              <th>${localize("dialog.current") || "Current"}</th>
              <th>${localize("dialog.new") || "New"}</th>
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
                        const form = button.form;
                        const updatedByUuid = {};
                        for (let i = 0; i < rows.length; i++) {
                            const uuid = String(form.elements[`uuid-${i}`]?.value || "");
                            if (!uuid) continue;
                            const fallback = suggestedByUuid.get(uuid) ?? rows[i].current;
                            const isLocked = String(form.elements[`lock-${i}`]?.value || "0") === "1";
                            const minQty = isLocked ? rows[i].current : 0;
                            updatedByUuid[uuid] = Math.max(minQty, Math.trunc(toNumber(form.elements[`new-${i}`]?.value, fallback)));
                        }
                        return updatedByUuid;
                    }
                }
            ],
            render: (dialog) => {
                const form = dialog?.target?.element?.querySelector("form");
                if (!form) return;

                const suggestedEl = form.querySelector("[data-balance-suggested]");
                const statusEl = form.querySelector("[data-balance-status]");
                if (!suggestedEl || !statusEl) return;

                const updateSummary = () => {
                    let adjustedXp = 0;
                    for (let i = 0; i < rows.length; i++) {
                        const input = form.elements[`new-${i}`];
                        const isLocked = String(form.elements[`lock-${i}`]?.value || "0") === "1";
                        const minQty = isLocked ? rows[i].current : 0;
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

                    suggestedEl.textContent = adjustedXp.toLocaleString();
                    statusEl.textContent = text;
                    statusEl.classList.remove("is-over", "is-under", "is-even");
                    statusEl.classList.add(cls);
                };

                const qtyInputs = form.querySelectorAll('input[name^="new-"]');
                qtyInputs.forEach((input) => {
                    input.addEventListener("input", updateSummary);
                    input.addEventListener("change", updateSummary);
                });

                const lockButtons = form.querySelectorAll("[data-lock-toggle]");
                lockButtons.forEach((button) => {
                    button.addEventListener("click", () => {
                        const index = Number(button.dataset.lockToggle);
                        if (!Number.isFinite(index)) return;
                        const lockField = form.elements[`lock-${index}`];
                        const qtyInput = form.elements[`new-${index}`];
                        const lockIcon = form.querySelector(`[data-lock-icon="${index}"]`);
                        if (!lockField || !qtyInput || !lockIcon) return;

                        const currentlyLocked = String(lockField.value || "0") === "1";
                        const nextLocked = !currentlyLocked;
                        lockField.value = nextLocked ? "1" : "0";

                        const minQty = nextLocked ? rows[index].current : 0;
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
