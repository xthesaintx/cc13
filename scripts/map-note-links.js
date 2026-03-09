import { localize } from "./helper.js";
import { displayCodexNote } from "./widgets/viewMapNote.js";

const MAP_NOTE_LINK_CLASS = "cc-map-note-link";
const MAP_NOTE_TOKEN_PATTERN = /@CCMAPNOTE\[([^\]]+)\](?:\{([^}]+)\})?/gi;

let enricherRegistered = false;
let clickHandlerRegistered = false;

function parseMapNoteRef(ref = "") {
    const [entryId, widgetId, noteId] = ref.split("|");
    if (!entryId || !widgetId || !noteId) return null;
    return { entryId, widgetId, noteId };
}

function getMapNote(entryId, widgetId, noteId) {
    const journal = game.journal.get(entryId);
    const widgetData = journal?.getFlag("campaign-codex", `data.widgets.mapnote.${widgetId}`);
    const noteData = widgetData?.notes?.find?.((note) => note.id === noteId);
    return { journal, noteData };
}

export function buildMapNoteToken({ entryId, widgetId, noteId, label }) {
    if (!entryId || !widgetId || !noteId) return "";
    const ref = `${entryId}|${widgetId}|${noteId}`;
    const safeLabel = String(label ?? localize("dialog.newNote")).replace(/[{}]/g, "");
    return `@CCMAPNOTE[${ref}]{${safeLabel}}`;
}

export function registerMapNoteTextEnricher() {
    if (enricherRegistered) return;
    CONFIG.TextEditor.enrichers ??= [];

    CONFIG.TextEditor.enrichers.push({
        pattern: MAP_NOTE_TOKEN_PATTERN,
        enricher: async (match) => {
            const ref = parseMapNoteRef(match[1]);
            if (!ref) return match[0];

            const { entryId, widgetId, noteId } = ref;
            const { journal, noteData } = getMapNote(entryId, widgetId, noteId);
            if (!journal || !noteData) return match[0];

            const defaultLabel = `${noteData.title || localize("dialog.newNote")}${noteData.mapId ? ` (${noteData.mapId})` : ""}`;
            const label = match[2] || defaultLabel;
            const link = document.createElement("a");
            link.classList.add("content-link", MAP_NOTE_LINK_CLASS);
            link.dataset.ccMapNote = "true";
            link.dataset.entryId = entryId;
            link.dataset.widgetId = widgetId;
            link.dataset.noteId = noteId;
            link.draggable = true;
            link.innerHTML = `<i class="fa-solid fa-map-pin"></i> ${foundry.utils.escapeHTML(label)}`;
            return link;
        }
    });

    enricherRegistered = true;
}

export function registerMapNoteLinkClickHandler() {
    if (clickHandlerRegistered) return;

    document.addEventListener("click", (event) => {
        const link = event.target.closest(`a.${MAP_NOTE_LINK_CLASS}[data-cc-map-note="true"]`);
        if (!link) return;

        event.preventDefault();
        event.stopPropagation();

        const { entryId, widgetId, noteId } = link.dataset;
        if (!entryId || !widgetId || !noteId) return;

        displayCodexNote(entryId, widgetId, noteId);
    });

    clickHandlerRegistered = true;
}
