import { ActorDropperBalanceDialogHelperCore } from "./ActorDropperBalanceDialogCore.js";
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

function getDefaultPartyData() {
    const pcs = game.actors.filter((a) => a?.type === "character" && a.hasPlayerOwner);
    const partySize = Math.max(1, pcs.length || 4);
    const levels = pcs
        .map((a) => Number(a.system?.details?.level?.value ?? a.level))
        .filter((lvl) => Number.isFinite(lvl));
    const partyLevel = levels.length
        ? Math.max(1, Math.min(20, Math.round(levels.reduce((sum, lvl) => sum + lvl, 0) / levels.length)))
        : 5;
    return { partyLevel, partySize };
}

const DND5E_ADAPTER = {
    async promptSetup(title) {
        const defaults = getDefaultPartyData();
        const levelOptions = Array.from({ length: 20 }, (_, i) => {
            const level = i + 1;
            const selected = level === defaults.partyLevel ? " selected" : "";
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
          <input type="number" name="players" value="${defaults.partySize}" min="1" max="20" step="1">
        </div>
        <div class="form-group">
          <label>${localize("dialog.difficulty") || "Difficulty"}</label>
          <select name="difficulty">
            <option value="low">${localize("dialog.difficultyLow") || "Low"}</option>
            <option value="moderate" selected>${localize("dialog.difficultyModerate") || "Moderate"}</option>
            <option value="high">${localize("dialog.difficultyHigh") || "High"}</option>
          </select>
        </div>
        <p class="notes">${localize("dialog.balanceEncounterBudgetNote") || "XP budget per character multiplied by player count (2024 DMG)."}</p>
      </div>
    `;

        return DialogV2.wait({
            window: { title: title ? `${localize("dialog.balanceEncounter") || "Balance Encounter"} - ${title}` : (localize("dialog.balanceEncounter") || "Balance Encounter") },
            content,
            position: {
              width: 400,
              height: "auto",
            },
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
                            level: Math.trunc(toNumber(form.elements.level.value, defaults.partyLevel)),
                            players: Math.trunc(toNumber(form.elements.players.value, defaults.partySize)),
                            difficulty: String(form.elements.difficulty.value || "moderate").toLowerCase(),
                        };
                    }
                }
            ]
        });
    },

    prepareRows(rawRows) {
        const rows = (Array.isArray(rawRows) ? rawRows : []).map((row) => {
            const current = Math.max(1, Math.trunc(toNumber(row.current, 1)));
            const xp = Math.max(0, Math.trunc(toNumber(row.xp, 0)));
            const cr = parseCr(row.cr);
            const effectiveCr = cr > 0 ? cr : 1;
            const cost = xp > 0 ? (xp / effectiveCr) : Infinity;
            return {
                uuid: String(row.uuid || ""),
                name: String(row.name || "Unknown Actor"),
                current,
                xp,
                cr,
                rankText: formatCr(cr),
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
    },

    getBudget(setup) {
        const level = Math.max(1, Math.min(20, Math.trunc(toNumber(setup.level, 1))));
        const players = Math.max(1, Math.min(20, Math.trunc(toNumber(setup.players, 4))));
        const difficulty = ["low", "moderate", "high"].includes(String(setup.difficulty))
            ? String(setup.difficulty)
            : "moderate";
        const perCharacterBudget = XP_BUDGET_2024[level][difficulty];
        const targetXp = perCharacterBudget * players;
        const difficultyLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

        return {
            targetXp,
            targetDescriptor: `L${level} ${difficultyLabel} x ${players}`,
            rankColumnLabel: localize("ui.cr") || "CR"
        };
    }
};

export class ActorDropperBalanceDialogHelperDnd5e {
    static async open({ rows = [], title = "" } = {}) {
        return ActorDropperBalanceDialogHelperCore.open({ rows, title, adapter: DND5E_ADAPTER });
    }
}
