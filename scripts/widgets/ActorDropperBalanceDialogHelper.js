import { ActorDropperBalanceDialogHelperDnd5e } from "./ActorDropperBalanceDialogHelperDnd5e.js";
import { ActorDropperBalanceDialogHelperPf2e } from "./ActorDropperBalanceDialogHelperPf2e.js";

export class ActorDropperBalanceDialogHelper {
    static async open({ systemId = game.system.id, ...rest } = {}) {
        const normalized = String(systemId || game.system.id || "").toLowerCase();
        if (normalized === "pf2e") {
            return ActorDropperBalanceDialogHelperPf2e.open(rest);
        }
        return ActorDropperBalanceDialogHelperDnd5e.open(rest);
    }
}
