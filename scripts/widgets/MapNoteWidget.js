import { CampaignCodexWidget } from "./CampaignCodexWidget.js";
import { gameSystemClass } from "../helper.js";
import { localize, format, renderTemplate, isThemed, journalSystemClass } from "../helper.js";


const { DialogV2 } = foundry.applications.api;

class CodexMapNoteEditorDialog extends DialogV2 {
    _onConfigurePlugins(event) {
        event.plugins.highlightDocumentMatches = ProseMirror.ProseMirrorHighlightMatchesPlugin.build(
            ProseMirror.defaultSchema
        );
    }

    _attachFrameListeners() {
        super._attachFrameListeners();
        this.element.addEventListener("plugins", this._onConfigurePlugins.bind(this));
    }
}

export class MapNoteWidget extends CampaignCodexWidget {

    constructor(widgetId, widgetData, document) {
        super(widgetId, widgetData, document);
        this.notes = widgetData.notes || [];
    }

    async _prepareContext() {
        const savedData = (await this.getData()) || {};
        const notes = savedData.notes || [];
        const isGM = game.user.isGM;

        const enrichedNotes = notes
            .filter(n => isGM || n.visible)
            .map(n => ({
                ...n,
                title: n.title || "New Note",
                mapId: n.mapId || "",
                visible: n.visible ?? false,
                visibilityIcon: n.visible ? "fa-eye" : "fa-eye-slash",
                visibilityTitle: n.visible ? "Player Visible" : "Player Hidden",
                isGM: isGM 
            }));

        return {
            id: this.widgetId,
            notes: enrichedNotes,
            isGM: isGM,
            entryId: this.document.id,
            entryUuid: this.document.uuid
        };
    }
    async render() {
        const context = await this._prepareContext();
        return await renderTemplate("modules/campaign-codex/templates/widgets/map-notes.hbs", context);
    }

    async _updateNoteData(id, updates) {
        if (updates.mapId) {
            updates.mapId = updates.mapId.replace(/[^a-zA-Z0-9]/g, "").substring(0, 4);
        }

        const savedData = (await this.getData()) || {};
        const notes = [...(savedData.notes || [])]; 
        const index = notes.findIndex(n => n.id === id);
        
        if (index === -1) return;

        notes[index] = { ...notes[index], ...updates };
        await this.saveData({ notes });
        this._updateNoteCardMeta(id, notes[index]);

        if (canvas.ready && (updates.mapId !== undefined || updates.title !== undefined)) {
            const noteUpdates = canvas.notes.placeables
                .filter(n => n.document.getFlag("campaign-codex", "noteid") === id)
                .map(n => ({
                    _id: n.document.id,
                    text: updates.title ?? n.document.text,
                    "flags.campaign-codex.markerid": updates.mapId ?? n.document.getFlag("campaign-codex", "markerid")
                }));

            if (noteUpdates.length > 0) {
                await canvas.scene.updateEmbeddedDocuments("Note", noteUpdates);
            }
        }
    }

    async activateListeners(htmlElement) {
        if (htmlElement.dataset.ccBound === "true") return;
        htmlElement.dataset.ccBound = "true";

        htmlElement.addEventListener('click', async (e) => {
            const addBtn = e.target.closest('[data-action="add"]');
            if (addBtn) {
                e.preventDefault();
                this._createNote();
                return;
            }

            const deleteBtn = e.target.closest('[data-action="delete"]');
            if (deleteBtn) {
                e.preventDefault();
                e.stopPropagation();
                await this._deleteNote(deleteBtn.dataset.id);
                return;
            }

            const editBtn = e.target.closest('[data-action="edit"]');
            if (editBtn) {
                e.preventDefault();
                e.stopPropagation();
                this._viewNote(editBtn.dataset.id, true);
                return;
            }

            const visibilityBtn = e.target.closest('[data-action="toggle-visibility"]');
            if (visibilityBtn) {
                e.preventDefault();
                e.stopPropagation();
                await this._toggleVisibility(visibilityBtn.dataset.id);
                return;
            }

            const noteCard = e.target.closest('.note-card[data-action="view"]');
            if (!noteCard) return;
            if (e.target.closest('.note-actions')) return;
            if (e.target.closest('input')) return;
            if (noteCard.classList.contains('dragging')) return;

            e.preventDefault();
            this._viewNote(noteCard.dataset.id, false);
        });

        htmlElement.addEventListener('input', (e) => {
            const mapInput = e.target.closest('.note-mapId-input');
            if (!mapInput) return;
            mapInput.value = mapInput.value.replace(/[^a-zA-Z0-9]/g, "");
        });

        htmlElement.addEventListener('change', async (e) => {
            const titleInput = e.target.closest('.note-title-input');
            if (titleInput) {
                e.preventDefault();
                e.stopPropagation();
                await this._updateNoteData(titleInput.dataset.id, { title: titleInput.value });
                return;
            }

            const mapInput = e.target.closest('.note-mapId-input');
            if (mapInput) {
                e.preventDefault();
                e.stopPropagation();
                await this._updateNoteData(mapInput.dataset.id, { mapId: mapInput.value });
            }
        });

        htmlElement.addEventListener('keydown', (e) => {
            const input = e.target.closest('.note-title-input, .note-mapId-input');
            if (!input) return;
            if (e.key === 'Enter') input.blur();
        });

        htmlElement.addEventListener('dragstart', (e) => {
            if (!e.target.closest('.note-card[data-drag="true"]')) return;
            this._onDragStart(e);
        });
    }


async _toggleVisibility(id) {
        const savedData = (await this.getData()) || {};
        const notes = savedData.notes || [];
        const index = notes.findIndex(n => n.id === id);
        
        if (index !== -1) {
            const currentState = notes[index].visible ?? false;
            notes[index] = { ...notes[index], visible: !currentState };
            
            await this.saveData({ notes });
            this._updateNoteCardVisibility(id, notes[index].visible);
        }
    }

    async _onDragStart(event) {
        const el = event.currentTarget?.classList?.contains('note-card')
            ? event.currentTarget
            : event.target.closest('.note-card[data-drag="true"]');
        if (!el) return;
        if ('link' in event.target.dataset) return;
        let journalID = el.dataset.entryId || event.target.dataset.entryId;
        let journalData = game.journal.get(journalID);
        if (!journalData) return;
        let dragDataB = journalData.toDragData();

        const noteTitle = el.dataset.title || "New Note";
        const noteId = el.dataset.id; 
        const mapId = el.dataset.mapId || ""; 
        const widgetId = this.widgetId; 

        game.user._tempNoteDrop = {
            uuid: journalData.uuid,
            label: noteTitle,
        
            flags: {
                "campaign-codex": {
                    noteid: noteId,
                    widgetid: widgetId,
                    markerid: mapId
                }
            }
        };


        dragDataB.noteLabel = noteTitle;
        if (!dragDataB) return;
        event.dataTransfer.setData('text/plain', JSON.stringify(dragDataB));
    }

    async _deleteNote(id) {
        const confirm = await this.confirmationDialog("Are you sure you want to delete this note?");
        if (!confirm) return;

        const savedData = (await this.getData()) || {};
        let notes = savedData.notes || [];
        notes = notes.filter(n => n.id !== id);

        await this.saveData({ notes });
        this._refreshWidget();
    }


    async _createNote() {
        const newId = foundry.utils.randomID();
        const newNote = {
            id: newId,
            content: "",
            title: "New Note",
            mapId: "",
            visible: false
        };
        await this._viewNote(newId, true, newNote);
    }


      _onClickImage(event) {
        if (!event.target.matches("img:not(.nopopout)")) return;
        const target = event.target;
        const page = this.document._id;
        const title = this.document.name;
        const ip = new foundry.applications.apps.ImagePopout({
          src: target.getAttribute("src"),
          window: { title },
        });

        ip.render({ force: true });
      }


/**
     * Opens the note editor.
     * @param {string} noteId 
     * @param {boolean} editMode 
     * @param {object|null} newNoteData - If present, this is a new unsaved note from _createNote.
     */
    async _viewNote(noteId, editMode = false, newNoteData = null) {
        
        
        let note = newNoteData;

        if (!note) {
            const savedData = (await this.getData()) || {};
            const notes = savedData.notes || [];
            note = notes.find(n => n.id === noteId);
        }
        
        
        if (!note) return;

        const isOwner = this.document.isOwner;
        const canEdit = isOwner && editMode;

        const enrichedContent = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            note.content, 
            { async: true, secrets: isOwner }
        );

        const systemClass = gameSystemClass(game.system.id);
        const journalClass = journalSystemClass(game.system.id);
        let contentHtml = "";

        if (canEdit) {
            const rawContent = foundry.utils.escapeHTML(note.content || "");
            
            contentHtml = `
              <article class="cc-enriched ${isThemed() ? 'themed':''} ${isThemed()} ${systemClass}">
                <section class="journal-entry-content">
                  <prose-mirror name="flags.campaign-codex.data.${note.id}" value="${rawContent}" compact="true" class="journal-page-content cc-prosemirror ${journalClass} ${isThemed() ? 'themed':''} ${isThemed()}">
                    ${enrichedContent}
                  </prose-mirror>
                </section>
              </article>
            `;
        } else {
            contentHtml = `
                <article class="cc-enriched ${isThemed() ? 'themed':''} ${journalClass} ${isThemed()} ${systemClass}">
                  <section class="journal-entry-content cc-non-owner-view">
                    ${enrichedContent}
                  </section>
                </article>                
            `;
        }
        const themeOverride = isThemed();
        const ccEditMode = editMode ? "edit-mode" : "read-mode";
        const { DialogV2 } = foundry.applications.api;
        const baseTitle = note.title || "Note";
        const windowTitle = `${baseTitle}${note.mapId ? ` [${note.mapId}]` : ""}`;

        const dialog = new CodexMapNoteEditorDialog({
            window: { title: windowTitle || "Note", resizable: true },
            id: noteId,
            modal: false,
            classes: ["cc-map-widget", "campaign-codex", "note-dialog", ccEditMode, themeOverride, "themed"],
            content: contentHtml,
            onClose: (dialog) => {dialog.element.style.display = "none";},
            buttons: [
                {
                    action: "close",
                    label: "Close",
                    icon: "fas fa-times"
                }
            ],
            position: { width: 550, height: "auto" }
        });

        const rendered = await dialog.render(true);
        const html = rendered.element;
        html.addEventListener("click", (event) => {
          const clickedImage = event.target.closest("img:not(.nopopout)");
          if (!clickedImage) {
            return;
          }
          const inEditor = clickedImage.closest("div.editor-content.ProseMirror");
          if (inEditor) {
            return;
          }
          event.stopPropagation();
          this._onClickImage.call(this, event);
        });

        if (canEdit) {
            const proseMirror = html.querySelector('prose-mirror');

            if (proseMirror && !proseMirror.dataset.listenerAttached) {
                proseMirror.dataset.listenerAttached = "true";
                
                proseMirror.addEventListener('save', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    if (proseMirror.dataset.saving === "true") return;
                    proseMirror.dataset.saving = "true";
                    try {
                        const target = event.currentTarget;
                        let valueToSave = Array.isArray(target.value) ? target.value[0] : target.value;
                        
                        if (newNoteData) {
                            const currentData = (await this.getData()) || {};
                            const currentNotes = currentData.notes || [];

                            const existingIndex = currentNotes.findIndex(n => n.id === noteId);

                            if (existingIndex > -1) {
                                currentNotes[existingIndex].content = valueToSave;
                            } else {
                                const noteToSave = { 
                                    ...newNoteData, 
                                    content: valueToSave 
                                };
                                currentNotes.push(noteToSave);
                            }

                            await this.saveData({ notes: currentNotes });

                        } else {
                            await this._updateNoteData(noteId, { content: valueToSave });
                        }
                    } finally {
                        proseMirror.dataset.saving = "false"; 
                    }
                    dialog.close();
                    this._refreshWidget();
                });
            }
        }
    }

    async _refreshWidget() {
        const htmlElement = document.getElementById(`widget-${this.widgetId}`);
        if (htmlElement && htmlElement.parentElement) {
            const container = htmlElement.parentElement;
            const newHtml = await this.render();
            container.innerHTML = newHtml;
            this.activateListeners(container);
        }
    }

    _updateNoteCardVisibility(id, visible) {
        const card = document.querySelector(`#widget-${this.widgetId} .note-card[data-id="${id}"]`);
        if (!card) return;

        const icon = card.querySelector('[data-action="toggle-visibility"] i');
        if (icon) {
            icon.classList.toggle("fa-eye", visible);
            icon.classList.toggle("fa-eye-slash", !visible);
        }

        const btn = card.querySelector('[data-action="toggle-visibility"]');
        if (btn) {
            btn.title = visible ? "Player Visible" : "Player Hidden";
        }
    }

    _updateNoteCardMeta(id, note) {
        const card = document.querySelector(`#widget-${this.widgetId} .note-card[data-id="${id}"]`);
        if (!card) return;

        const title = note.title || "New Note";
        const mapId = note.mapId || "";
        card.dataset.title = title;
        card.dataset.mapId = mapId;

        const titleInput = card.querySelector('.note-title-input');
        if (titleInput && titleInput.value !== title) {
            titleInput.value = title;
        }

        const mapIdInput = card.querySelector('.note-mapId-input');
        if (mapIdInput && mapIdInput.value !== mapId) {
            mapIdInput.value = mapId;
        }
    }
}
