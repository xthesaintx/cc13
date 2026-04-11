import { ActorDropperBalanceDialogHelperCore } from "./ActorDropperBalanceDialogCore.js";
import { localize } from "../helper.js";

const { DialogV2 } = foundry.applications.api;

const PF2E_CREATURE_XP_DIFF = new Map([
    [-4, 10], [-3, 15], [-2, 20], [-1, 30], [0, 40],
    [1, 60], [2, 80], [3, 120], [4, 160]
]);

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function getDefaultPartyData() {
    const pcs = game.actors.filter((a) => a?.type === "character" && a.hasPlayerOwner);
    const partySize = Math.max(1, pcs.length || 4);
    const levels = pcs
        .map((a) => Number(a.system?.details?.level?.value ?? a.level))
        .filter((lvl) => Number.isFinite(lvl));
    const partyLevel = levels.length
        ? Math.max(1, Math.min(20, Math.round(levels.reduce((sum, lvl) => sum + lvl, 0) / levels.length)))
        : 1;
    return { partyLevel, partySize };
}

function getXPFromMap(partyLevel, creatureLevel, values) {
    const difference = Math.trunc(toNumber(creatureLevel, 0)) - Math.trunc(toNumber(partyLevel, 0));
    const range = Math.floor(values.size / 2);
    const bounded = Math.max(-range, Math.min(range, difference));
    return values.get(bounded) ?? 0;
}

function calculateCreatureXP(partyLevel, creatureLevel) {
    return getXPFromMap(partyLevel, creatureLevel, PF2E_CREATURE_XP_DIFF);
}

function generateEncounterBudgets(partySize) {
    const base = Math.max(1, Math.trunc(toNumber(partySize, 4))) * 20;
    return {
        trivial: Math.floor(base * 0.5),
        low: Math.floor(base * 0.75),
        moderate: base,
        severe: Math.floor(base * 1.5),
        extreme: Math.floor(base * 2)
    };
}

const PF2E_ADAPTER = {
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
          <label>${localize("dialog.partyLevel") || "Party Level"}</label>
          <select name="partyLevel">${levelOptions}</select>
        </div>
        <div class="form-group">
          <label>${localize("dialog.numberOfPlayers") || "Number of Players"}</label>
          <input type="number" name="partySize" value="${defaults.partySize}" min="1" max="20" step="1">
        </div>
        <div class="form-group">
          <label>${localize("dialog.threat") || "Threat"}</label>
          <select name="threat">
            <option value="trivial">${localize("dialog.threatTrivial") || "Trivial"}</option>
            <option value="low">${localize("dialog.threatLow") || "Low"}</option>
            <option value="moderate" selected>${localize("dialog.threatModerate") || "Moderate"}</option>
            <option value="severe">${localize("dialog.threatSevere") || "Severe"}</option>
            <option value="extreme">${localize("dialog.threatExtreme") || "Extreme"}</option>
          </select>
        </div>
        <p class="notes">${localize("dialog.balanceEncounterPf2eNote") || "PF2e XP uses creature level versus party level, with threat budgets based on party size."}</p>
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
                            partyLevel: Math.trunc(toNumber(form.elements.partyLevel.value, defaults.partyLevel)),
                            partySize: Math.trunc(toNumber(form.elements.partySize.value, defaults.partySize)),
                            threat: String(form.elements.threat.value || "moderate").toLowerCase()
                        };
                    }
                }
            ]
        });
    },

    prepareRows(rawRows, setup) {
        const partyLevel = Math.max(1, Math.min(20, Math.trunc(toNumber(setup.partyLevel, 1))));
        const rows = (Array.isArray(rawRows) ? rawRows : []).map((row) => {
            const current = Math.max(1, Math.trunc(toNumber(row.current, 1)));
            const level = Math.trunc(toNumber(row.level ?? row.cr, 0));
            const xp = Math.max(0, calculateCreatureXP(partyLevel, level));
            const cost = xp > 0 ? xp : Infinity;
            return {
                uuid: String(row.uuid || ""),
                name: String(row.name || "Unknown Actor"),
                current,
                level,
                xp,
                rankText: String(level),
                cost,
                autoEligible: Number.isFinite(cost) && cost > 0,
                autoReduceBlocked: false,
                progress: 0
            };
        }).filter((row) => !!row.uuid);

        const reducibleRows = rows.filter((row) => row.autoEligible && Number.isFinite(row.level));
        const maxLevel = reducibleRows.length ? Math.max(...reducibleRows.map((row) => row.level)) : 0;
        if (reducibleRows.length) {
            for (const row of rows) {
                if (row.level === maxLevel) row.autoReduceBlocked = true;
            }
        }

        return rows;
    },

    getBudget(setup) {
        const partyLevel = Math.max(1, Math.min(20, Math.trunc(toNumber(setup.partyLevel, 1))));
        const partySize = Math.max(1, Math.min(20, Math.trunc(toNumber(setup.partySize, 4))));
        const threat = ["trivial", "low", "moderate", "severe", "extreme"].includes(String(setup.threat))
            ? String(setup.threat)
            : "moderate";
        const budgets = generateEncounterBudgets(partySize);
        const targetXp = budgets[threat];
        const threatLabel = threat.charAt(0).toUpperCase() + threat.slice(1);

        return {
            targetXp,
            targetDescriptor: `${localize("dialog.partyLevel") || "Party Level"} ${partyLevel} x ${partySize} - ${threatLabel}`,
            rankColumnLabel: localize("dialog.level") || "Level"
        };
    }
};

export class ActorDropperBalanceDialogHelperPf2e {
    static async open({ rows = [], title = "" } = {}) {
        return ActorDropperBalanceDialogHelperCore.open({ rows, title, adapter: PF2E_ADAPTER });
    }
}
