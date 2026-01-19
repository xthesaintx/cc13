import { CampaignCodexWidget } from "./CampaignCodexWidget.js";

export class CalendarTimelineWidget extends CampaignCodexWidget {
    constructor(widgetId, widgetData, document) {
        super(widgetId, widgetData, document);
        this.moduleId = "wgtgm-mini-calendar";
        this.journalName = "Calendar Events - Mini Calendar";
        
        // Settings
        this.pxPerDay = 20; 
        this.minZoom = 0.5;
        this.maxZoom = 45;
        this.offset = 50;
        this.initialOffset = 30;

        // State
        this._cachedEvents = null;
        this._lastWorldTime = 0;
        this.panOffset = null;
        this._saveTimeout = null;
        this._renderTimeout = null; 
        this._intialised = false; 

        this.filters = {
            showPast: true,
            showRecurring: true,
            hiddenIcons: []
        };        

        this._ctx = {
            minTs: 0,
            secondsPerDay: 1,
            todayTs: 0,
            domOffset: 0
        };
        
        this._lastViewportWidth = 1200; 
    }

    /**
     * Prepare data. Calculates Canvas Width so the DOM exists physically.
     */
    async _prepareContext() {
        const calendar = game.time.calendar;
        if (!calendar) return { error: "Calendar system not ready." };

        const savedData = (await this.getData()) || {};
        if (savedData.filters) {
            this.filters = { ...this.filters, ...savedData.filters };
        }

        if (this.panOffset === null && savedData.view) {
            if (savedData.view.pxPerDay) this.pxPerDay = savedData.view.pxPerDay;
            if (savedData.view.panOffset !== undefined) this.panOffset = savedData.view.panOffset;
        }

        if (game.time.worldTime !== this._lastWorldTime) {
            this._cachedEvents = null;
            this._lastWorldTime = game.time.worldTime;
        }

        if (!this._cachedEvents) {
            const result = await this._fetchRawEvents(calendar);
            if (result.error) return result;
            this._cachedEvents = result.events;
            this._todayTimestamp = result.todayTimestamp;
        }

        const allEvents = this._cachedEvents;
        const todayTs = this._todayTimestamp;
        const secondsPerDay = calendar.days.hoursPerDay * calendar.days.minutesPerHour * calendar.days.secondsPerMinute;
        const uniqueIcons = [...new Set(allEvents.map(e => e.icon))].sort();

        let minTs = todayTs;
        let maxTs = todayTs;
        
        if (allEvents.length > 0) {
            minTs = Math.min(minTs, allEvents[0].timestamp);
            maxTs = Math.max(maxTs, allEvents[allEvents.length - 1].timestamp);
        }

        const visibleEvents = allEvents.filter(e => {
            if (!this.filters.showRecurring && e.isRecurring) return false;
            if (!this.filters.showPast && e.timestamp < todayTs) return false;
            if (this.filters.hiddenIcons.includes(e.icon)) return false;
            return true;
        });

        const eventsToMeasure = visibleEvents.length > 0 ? visibleEvents : allEvents;
        if (eventsToMeasure.length > 0) {
            minTs = Math.min(minTs, eventsToMeasure[0].timestamp);
            maxTs = Math.max(maxTs, eventsToMeasure[eventsToMeasure.length - 1].timestamp);
        }

        const paddingSeconds = 30 * secondsPerDay;
        minTs -= paddingSeconds;
        maxTs += paddingSeconds;

        this._ctx = { minTs, maxTs, secondsPerDay, todayTs };

        const totalDays = (maxTs - minTs) / secondsPerDay;
        const originOffsetDays = (todayTs - minTs) / secondsPerDay;
        const originX = originOffsetDays * this.pxPerDay;

        const bufferPx = 3000; 
        let renderMinX, renderMaxX;

        if (this.panOffset !== null) {
            renderMinX = (-this.panOffset) - bufferPx;
            renderMaxX = (-this.panOffset) + this._lastViewportWidth + bufferPx;
        } else {
            renderMinX = originX - (this._lastViewportWidth/2) - bufferPx;
            renderMaxX = originX + (this._lastViewportWidth/2) + bufferPx;
        }
        
        const canvasWidth = renderMaxX - renderMinX;
        this._ctx = { minTs, maxTs, secondsPerDay, todayTs, domOffset: renderMinX };

        const axisLabels = this._generateAxisLabels(minTs, maxTs, todayTs, secondsPerDay, calendar, originX, renderMinX, renderMaxX);
        const layoutEvents = this._layoutEvents(allEvents, todayTs, secondsPerDay, originX, renderMinX, renderMaxX);

        const now = calendar.timeToComponents(game.time.worldTime);
        const todayLabel = this._formatDate(calendar, now.year, now.month, now.dayOfMonth);

        return {
            id: this.widgetId,
            events: layoutEvents,
            axisLabels: axisLabels,
            canvasWidth: canvasWidth, 
            originX: originX,           
            hasEvents: layoutEvents.length > 0,
            isGM: this.isGM,
            todayLabel: todayLabel,
            filters: this.filters,
            uniqueIcons: uniqueIcons,
            todayTs: todayTs
        };
    }

    async _fetchRawEvents(calendar) {
        // 1. Get Mini Calendar Instance
        const miniCal = game.wgtngmMiniCalender?.calendarInstance || game.wgtngmMiniCalender;
        if (!miniCal) return { error: "Mini Calendar not active.", events: [] };

        const journal = game.journal.getName(this.journalName);
        if (!journal) return { error: `Journal "${this.journalName}" not found.`, events: [] };

        const nowComponents = calendar.timeToComponents(game.time.worldTime);
        const todayTimestamp = this._getTimestamp(nowComponents, calendar);

        let rawEvents = [];

        journal.pages.forEach(page => {
            const match = page.name.match(/^(\d+)-(\d+)-(\d+)$/);
            if (!match) return;

            const year = parseInt(match[1]);
            const month = parseInt(match[2]) - 1; 
            const day = parseInt(match[3]) - 1;    

            if (!calendar.months.values[month]) return;

            const ts = this._getTimestamp({year, month, day}, calendar);
            const notes = page.getFlag(this.moduleId, "notes") || [];
            
            notes.forEach(note => {
                if (!this.isGM && !note.playerVisible) return;
                rawEvents.push({
                    ...note,
                    timestamp: ts,
                    displayDate: this._formatDate(calendar, year, month, day),
                    isRecurring: false,
                    content: note.content || ""
                });
            });
        });

        const recurringPage = journal.pages.getName("0000-Recurring");
        if (recurringPage) {
            const recurringNotes = recurringPage.getFlag(this.moduleId, "notes") || [];
            if (recurringNotes.length > 0) {
                const lookaheadDays = 365;
                const secondsPerDay = calendar.days.hoursPerDay * calendar.days.minutesPerHour * calendar.days.secondsPerMinute;
                
                let cursorDate = { ...nowComponents };
                
                for(let i = 0; i < lookaheadDays; i++) {
                    const ts = todayTimestamp + (i * secondsPerDay);
                    cursorDate = calendar.timeToComponents(ts);
                    const checkDate = {
                        year: cursorDate.year,
                        month: cursorDate.month,
                        day: cursorDate.day || cursorDate.dayOfMonth || 0
                    };

                    recurringNotes.forEach(note => {
                        if (!this.isGM && !note.playerVisible) return;
                        
                        if (miniCal._checkRecurrence(note, checkDate)) {
                            rawEvents.push({
                                ...note,
                                timestamp: ts,
                                displayDate: this._formatDate(calendar, checkDate.year, checkDate.month, checkDate.day),
                                isRecurring: true,
                                content: note.content || ""
                            });
                        }
                    });
                }
            }
        }

        rawEvents.sort((a, b) => a.timestamp - b.timestamp);
        return { events: rawEvents, todayTimestamp };
    }

    _getTimestamp(dateObj, calendar) {
        if (!calendar.months.values[dateObj.month]) return 0;
        return calendar.componentsToTime({
            year: dateObj.year,
            month: dateObj.month,
            day: dateObj.day || dateObj.dayOfMonth || 0,
            hour: 0, minute: 0, second: 0
        });
    }

    _formatDate(calendar, y, m, d) {
        const month = calendar.months.values[m];
        return `${month ? month.abbreviation : "???"} ${d + 1}, ${y}`;
    }

    async render() {
        const data = await this._prepareContext();
        if (data.error) return `<div class="cc-widget-error">${data.error}</div>`;

        const axisHtml = data.axisLabels.map(l => `
            <div class="axis-mark ${l.type}" 
                 data-ts="${l.timestamp}" 
                 style="left: ${l.left}px">
                <div class="axis-tick"></div>
                <div class="axis-label">${l.label}</div>
            </div>
        `).join("");

        const iconFiltersHtml = data.uniqueIcons.map(iconClass => {
            const isHidden = data.filters.hiddenIcons.includes(iconClass);
            return `
                <div class="icon-filter-btn ${isHidden ? '' : 'active'}" 
                     data-filter-icon="${iconClass}" 
                     title="Toggle ${iconClass}">
                    <i class="${iconClass}"></i>
                </div>
            `;
        }).join("");

        const eventsHtml = data.events.map(e => {
            const isVisible = !e.isHidden;
            const styleStr = isVisible ? e.style : `${e.style}; display:none;`;
            const classStr = isVisible ? "" : " filtered-out";

            return `
            <div class="timeline-event-wrapper${classStr}" 
                 data-ts="${e.timestamp}"
                 data-recurring="${e.isRecurring}" 
                 data-icon="${e.icon}"
                 style="${styleStr}">
                <div class="timeline-connector" style="${e.connectorStyle}"></div>
                <div class="timeline-event-card ${e.direction}" style="${e.topStyle}">
                    <div class="te-header">
                        <span class="te-date">${e.displayDate}</span>
                        ${e.isRecurring ? '<i class="fas fa-repeat" title="Recurring"></i>' : ''}
                    </div>
                    <div class="te-title"><i class="${e.icon}"></i> ${e.title}</div>
                    ${e.hasContent ? `
                    <div class="${e.popupClass}">
                        <div class="te-content-body">${e.contentHtml}</div>
                    </div>` : ''}
                </div>
                <div class="timeline-dot"></div>
            </div>
        `}).join("");

        const html = `
            <div class="cc-widget-timeline-horizontal" id="widget-${this.widgetId}">
                <div class="timeline-controls">
                    ${data.isGM ? `
                    <div class="control-group-filters">
                        <button data-action="toggleFilters" title="GM Filters" class="gm-filter-btn"><i class="fas fa-cog"></i></button>
                        <div class="filter-drawer" style="display:none;">
                            <div class="filter-header">Display Settings</div>
                            <div class="filter-section">
                                <label><input type="checkbox" data-filter="showPast" ${data.filters.showPast ? "checked" : ""}> Show Past</label>
                                <label><input type="checkbox" data-filter="showRecurring" ${data.filters.showRecurring ? "checked" : ""}> Show Recurring</label>
                            </div>
                            <div class="filter-divider"></div>
                            <div class="filter-header">Event Types</div>
                            <div class="filter-grid">${iconFiltersHtml}</div>
                            <div class="filter-divider"></div>
                            <button data-action="saveFilters" class="filter-save-btn"><i class="fas fa-save"></i> Save Settings</button>
                        </div>
                    </div>
                    ` : ''}
                    <button data-action="zoomOut"><i class="fas fa-minus"></i></button>
                    <button data-action="reset"><i class="fas fa-crosshairs"></i></button>
                    <button data-action="zoomIn"><i class="fas fa-plus"></i></button>
                </div>
                <div class="timeline-viewport">
                    <div class="timeline-canvas" style="width: ${data.canvasWidth}px">
                        <div class="timeline-axis-line"></div>
                        <div class="timeline-axis-labels">${axisHtml}</div>
                        <div class="timeline-today-marker" style="left: ${data.originX}px">
                            <div class="ttm-line"></div>
                            <div class="ttm-label">TODAY</div>
                        </div>
                        ${eventsHtml}
                    </div>
                </div>
            </div>
        `;
        
        setTimeout(() => {
            const el = document.getElementById(`widget-${this.widgetId}`);
            if(el) {
                const vp = el.querySelector(".timeline-viewport");
                if (vp) this._lastViewportWidth = vp.offsetWidth;
                this._applyFiltersToDOM(el.parentElement); 
                this._updatePositions(el.parentElement);
            }
        }, 0);

        return html;
    }

    
    async _persistSettings() {
        const savedData = (await this.getData()) || {};
        await this.saveData({ 
            ...savedData,
            filters: this.filters,
            view: {
                pxPerDay: this.pxPerDay,
                panOffset: this.panOffset
            }
        });
    }

    _debouncedSaveView() {
        if (this._saveTimeout) clearTimeout(this._saveTimeout);
        this._saveTimeout = setTimeout(() => { this._persistSettings(); }, 1000); 
    }

    _debouncedRefresh(htmlElement) {
        if (this._renderTimeout) clearTimeout(this._renderTimeout);
        this._renderTimeout = setTimeout(() => { this._refreshWidget(htmlElement); }, 100); 
    }

    async activateListeners(htmlElement) {
        const viewport = htmlElement.querySelector('.timeline-viewport');
        const canvas = htmlElement.querySelector('.timeline-canvas');
        if (!viewport || !canvas) return;
        this._lastViewportWidth = viewport.offsetWidth;

        htmlElement.querySelectorAll('.timeline-event-card').forEach(wrapper => {
            const parent = wrapper.closest('.timeline-event-wrapper');
            if(parent) {
                parent.addEventListener('mouseenter', () => parent.style.zIndex = "1000");
                parent.addEventListener('mouseleave', () => parent.style.zIndex = "");
            }
        });
        
        const stdInputs = htmlElement.querySelectorAll('.filter-drawer input[data-filter]');
        stdInputs.forEach(input => {
            input.addEventListener('change', async (e) => {
                const filterType = e.target.dataset.filter;
                this.filters[filterType] = e.target.checked;
                this._applyFiltersToDOM(htmlElement);
                this._updatePositions(htmlElement);
            });
        });

        const iconBtns = htmlElement.querySelectorAll('.icon-filter-btn');
        iconBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); 
                const icon = btn.dataset.filterIcon;
                if (this.filters.hiddenIcons.includes(icon)) {
                    this.filters.hiddenIcons = this.filters.hiddenIcons.filter(i => i !== icon);
                    btn.classList.add("active");
                } else {
                    this.filters.hiddenIcons.push(icon);
                    btn.classList.remove("active");
                }
                this._applyFiltersToDOM(htmlElement);
                this._updatePositions(htmlElement);
            });
        });

        const saveBtn = htmlElement.querySelector('button[data-action="saveFilters"]');
        if (saveBtn) {
            saveBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const originalText = saveBtn.innerHTML;
                saveBtn.innerHTML = `<i class="fas fa-check"></i> Saved`;
                await this._persistSettings();
                setTimeout(() => {
                    const drawer = htmlElement.querySelector('.filter-drawer');
                    const toggleBtn = htmlElement.querySelector('button[data-action="toggleFilters"]');
                    if(drawer) drawer.style.display = "none";
                    if(toggleBtn) toggleBtn.classList.remove("active");
                    saveBtn.innerHTML = originalText;
                }, 500);
            });
        }

        const originX = this._ctx.todayTs ? ((this._ctx.todayTs - this._ctx.minTs) / this._ctx.secondsPerDay * this.pxPerDay) : 0;
        if (this.panOffset === null) this.panOffset = (viewport.offsetWidth / 2) - originX;
        this._updatePan(canvas);

        htmlElement.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-action]");
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            const action = btn.dataset.action;
            if (action === "zoomIn") this._handleZoom(1, htmlElement);
            if (action === "zoomOut") this._handleZoom(-1, htmlElement);
            if (action === "reset") {
                const currentOriginX = (this._ctx.todayTs - this._ctx.minTs) / this._ctx.secondsPerDay * this.pxPerDay;
                this.panOffset = (viewport.offsetWidth / 2) - currentOriginX;
                this._updatePan(canvas);
                this._debouncedRefresh(htmlElement); 
            }
            if (action === "toggleFilters") {
               const drawer = htmlElement.querySelector('.filter-drawer');
               drawer.style.display = drawer.style.display === "none" ? "block" : "none";
               btn.classList.toggle("active");
             }
            if (!e.target.closest('.control-group-filters')) {
                    const drawer = htmlElement.querySelector('.filter-drawer');
                    if (drawer) drawer.style.display = "none";
                }
        });

        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = viewport.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const direction = Math.sign(e.deltaY) > 0 ? -1 : 1;
            this._handleZoom(direction, htmlElement, mouseX);
        }, { passive: false });

        let isDragging = false;
        let startX;
        let startPan;

        viewport.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; 
            isDragging = true;
            startX = e.pageX;
            startPan = this.panOffset;
            viewport.style.cursor = 'grabbing';
        });

        const endDrag = () => {
            if (!isDragging) return;
            isDragging = false;
            viewport.style.cursor = 'grab';
            this._debouncedRefresh(htmlElement);
        };
        
        document.addEventListener('mouseup', endDrag);

        viewport.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const diff = e.pageX - startX;
            this.panOffset = startPan + diff;
            this._updatePan(canvas);
        });
        if (!this._intialised) {
                const currentOriginX = (this._ctx.todayTs - this._ctx.minTs) / this._ctx.secondsPerDay * this.pxPerDay;
                this.panOffset = 0;
                this._updatePan(canvas);
                this._debouncedRefresh(htmlElement); 
                this._intialised = true;
        }
    }

    _applyFiltersToDOM(htmlElement) {
        const wrappers = htmlElement.querySelectorAll('.timeline-event-wrapper');
        const { showPast, showRecurring, hiddenIcons } = this.filters;
        const todayTs = this._ctx.todayTs;

        wrappers.forEach(el => {
            const ts = Number(el.dataset.ts);
            const isRecurring = el.dataset.recurring === "true";
            const icon = el.dataset.icon;

            let isVisible = true;
            if (!showRecurring && isRecurring) isVisible = false;
            if (!showPast && ts < todayTs) isVisible = false;
            if (hiddenIcons.includes(icon)) isVisible = false;

            if (isVisible) {
                el.style.display = "block";
                el.classList.remove("filtered-out");
            } else {
                el.style.display = "none";
                el.classList.add("filtered-out");
            }
        });
    }

    _handleZoom(direction, htmlElement, mouseXInViewport = null) {
        const viewport = htmlElement.querySelector(".timeline-viewport");
        const canvas = htmlElement.querySelector(".timeline-canvas");
        if (!viewport || !canvas) return;

        const oldPx = this.pxPerDay;
        const factor = 1.3;
        let nextPx = direction > 0 ? oldPx * factor : oldPx / factor;
        nextPx = Math.max(this.minZoom, Math.min(this.maxZoom, nextPx));
        
        if (nextPx === oldPx) return; 

        const ratio = nextPx / oldPx;
        this.pxPerDay = nextPx;

        const rect = viewport.getBoundingClientRect();
        const focusX = (mouseXInViewport ?? (rect.width / 2)); 

        this.panOffset = focusX - (focusX - this.panOffset) * ratio;

        const bufferPx = 3000;
        this._ctx.domOffset = (-this.panOffset) - bufferPx;

        this._updatePositions(htmlElement);
        this._updatePan(canvas);
        this._debouncedRefresh(htmlElement);
    }

    async _refreshWidget(htmlElement) {
        const newHtml = await this.render();
        const widgetSelector = `#widget-${this.widgetId}`;
        let container = htmlElement;
        if (htmlElement.matches(widgetSelector)) container = htmlElement.parentElement;
        else {
             const internalWidget = htmlElement.querySelector(widgetSelector);
             if (internalWidget) container = htmlElement;
        }
        if (container) {
            container.innerHTML = newHtml;
            this.activateListeners(container);
        }
    }

    _updatePositions(htmlElement) {
        const { minTs, secondsPerDay, todayTs, domOffset } = this._ctx;
        const CARD_WIDTH = 160; 
        const GAP = 10;
        const LANE_DEPTH_CAP = 3; 
        const MAX_TOTAL_LANES = LANE_DEPTH_CAP * 2; 

        const canvas = htmlElement.querySelector(".timeline-canvas");
        const showMonths = (this.pxPerDay * 30) > 40;
        const lanes = []; 

        const eventEls = Array.from(htmlElement.querySelectorAll(".timeline-event-wrapper:not(.filtered-out)"));
        eventEls.sort((a, b) => Number(a.dataset.ts) - Number(b.dataset.ts));

        eventEls.forEach(el => {
            const ts = Number(el.dataset.ts);
            const dayDiff = (ts - minTs) / secondsPerDay;
            const absLeft = dayDiff * this.pxPerDay;
            const relativeLeft = absLeft - domOffset;
            el.style.left = `${relativeLeft}px`;

            const myStart = relativeLeft - (CARD_WIDTH / 2);
            const myEnd = relativeLeft + (CARD_WIDTH / 2);

            let chosenLane = -1;
            for (let i = 0; i < lanes.length; i++) {
                if (myStart > (lanes[i] + GAP)) {
                    chosenLane = i;
                    break;
                }
            }
            if (chosenLane === -1) {
                if (lanes.length < MAX_TOTAL_LANES) {
                    chosenLane = lanes.length;
                    lanes.push(0);
                } 
                else chosenLane = lanes.indexOf(Math.min(...lanes));
            }
            
            lanes[chosenLane] = myEnd;
            const isTop = chosenLane % 2 === 0;
            const level = Math.floor(chosenLane / 2);
            const popup = el.querySelector(".te-content-popup-above-line, .te-content-popup-below-line");
            if (popup) {
                popup.classList.remove("te-content-popup-above-line", "te-content-popup-below-line");
                popup.classList.add(!isTop ? "te-content-popup-above-line" : "te-content-popup-below-line");
            }
            const verticalDist = this.initialOffset + (level * this.offset);
            const card = el.querySelector(".timeline-event-card");
            if (card) card.style.top = isTop ? `${verticalDist}px` : `-${verticalDist + this.offset}px`;
            const connector = el.querySelector(".timeline-connector");
            if (connector) {
                connector.style.height = isTop ? `${verticalDist}px` : `${verticalDist + this.offset}px`;
                connector.style.top = isTop ? "0" : `-${verticalDist + this.offset}px`;
            }
        });

        htmlElement.querySelectorAll(".axis-mark[data-ts]").forEach(el => {
            const ts = Number(el.dataset.ts);
            const dayDiff = (ts - minTs) / secondsPerDay;
            const absLeft = dayDiff * this.pxPerDay;
            el.style.left = `${absLeft - domOffset}px`;
            if (el.classList.contains("month")) el.style.display = showMonths ? "block" : "none";
        });

        const todayEl = htmlElement.querySelector(".timeline-today-marker");
        if (todayEl) {
            const dayDiff = (todayTs - minTs) / secondsPerDay;
            const absLeft = dayDiff * this.pxPerDay;
            todayEl.style.left = `${absLeft - domOffset}px`;
        }
    }

    _updatePan(canvas) {
        const offset = this.panOffset + (this._ctx.domOffset || 0);
        if(canvas) canvas.style.transform = `translate3d(${offset}px, 0, 0)`;
    }

   _layoutEvents(events, todayTimestamp, secondsPerDay, originX, renderMinX, renderMaxX) {
        const CARD_VISUAL_WIDTH = 160; 
        const HALF_WIDTH = CARD_VISUAL_WIDTH / 2;
        const GAP = 10; 
        const LANE_DEPTH_CAP = 3; 
        const MAX_TOTAL_LANES = LANE_DEPTH_CAP * 2; 
        
        const lanes = []; 

        return events.map(e => {
            let isHidden = false;
            if (!this.filters.showRecurring && e.isRecurring) isHidden = true;
            if (!this.filters.showPast && e.timestamp < todayTimestamp) isHidden = true;
            if (this.filters.hiddenIcons.includes(e.icon)) isHidden = true;

            const dayDiffFromToday = (e.timestamp - todayTimestamp) / secondsPerDay;
            const centerPos = originX + (dayDiffFromToday * this.pxPerDay);

            if (centerPos < renderMinX || centerPos > renderMaxX) return null; 
            
            const relativePos = centerPos - renderMinX;

            if (isHidden) {
                return { 
                    ...e, 
                    isHidden: true,
                    style: `display:none`, 
                    popupClass: "te-content-popup-above-line" 
                };
            }

            const myStart = relativePos - HALF_WIDTH;
            const myEnd = relativePos + HALF_WIDTH;

            let chosenLane = -1;
            for (let i = 0; i < lanes.length; i++) {
                if (myStart > (lanes[i] + GAP)) {
                    chosenLane = i;
                    break;
                }
            }
            if (chosenLane === -1) {
                if (lanes.length < MAX_TOTAL_LANES) {
                    chosenLane = lanes.length;
                    lanes.push(0);
                } else chosenLane = lanes.indexOf(Math.min(...lanes));
            }

            lanes[chosenLane] = myEnd;
            const isTop = chosenLane % 2 === 0;
            const level = Math.floor(chosenLane / 2);
            
            const verticalDist = this.initialOffset + (level * this.offset);
            const popupClass = !isTop ? "te-content-popup-above-line" : "te-content-popup-below-line";
            
            return {
                ...e,
                timestamp: e.timestamp, 
                isHidden: false,
                style: `left: ${relativePos}px;`,
                topStyle: `top: ${isTop ? verticalDist : -(verticalDist + this.offset)}px;`,
                connectorStyle: `height: ${isTop ? verticalDist : (verticalDist + this.offset)}px; top: ${isTop ? 0 : -(verticalDist + this.offset)}px;`,
                direction: e.timestamp >= todayTimestamp ? "future" : "past",
                hasContent: e.content && e.content.trim().length > 0,
                contentHtml: e.content,
                popupClass: popupClass 
            };
        }).filter(e => e !== null); 
    }

_generateAxisLabels(minTs, maxTs, todayTs, secondsPerDay, calendar, originX, renderMinX, renderMaxX) {
        const labels = [];
        const showMonths = (this.pxPerDay * 30) > 40; 
        const showDays = this.pxPerDay > 15; // Threshold: Show days if zoom is > 15px per day

        const startDiffDays = (renderMinX - originX) / this.pxPerDay;
        const endDiffDays = (renderMaxX - originX) / this.pxPerDay;
        
        const startTs = todayTs + (startDiffDays * secondsPerDay);
        const endTs = todayTs + (endDiffDays * secondsPerDay);

        const startDate = calendar.timeToComponents(startTs);
        const endDate = calendar.timeToComponents(endTs);
        
        for (let y = startDate.year - 1; y <= endDate.year + 1; y++) {
            
            const yearTs = this._getTimestamp({year: y, month: 0, day: 0}, calendar);
            const diffFromToday = (yearTs - todayTs) / secondsPerDay;
            const absLeft = originX + (diffFromToday * this.pxPerDay);

            if (absLeft >= renderMinX && absLeft <= renderMaxX) {
                 labels.push({ 
                    left: absLeft - renderMinX, 
                    timestamp: yearTs, 
                    label: y, 
                    type: "year" 
                });
            }

            if (showMonths) {
                for (let m = 0; m < calendar.months.values.length; m++) {
                    const monthTs = this._getTimestamp({year: y, month: m, day: 0}, calendar);
                    
                    // Gather Month Data
                    const monthData = calendar.months.values[m];
                    const isLeap = calendar.isLeapYear(y);
                    const daysInMonth = (isLeap && monthData.leapDays !== undefined) ? monthData.leapDays : monthData.days;
                    const monthEndTs = monthTs + (daysInMonth * secondsPerDay);

                    if (monthEndTs < startTs || monthTs > endTs) continue;

                    const mDiff = (monthTs - todayTs) / secondsPerDay;
                    const mAbsLeft = originX + (mDiff * this.pxPerDay);
                    
                    if (mAbsLeft >= renderMinX && mAbsLeft <= renderMaxX) {
                        labels.push({ 
                            left: mAbsLeft - renderMinX, 
                            timestamp: monthTs, 
                            label: calendar.months.values[m].abbreviation, 
                            type: "month" 
                        });
                    }

                    if (showDays) {
                        for(let d = 0; d < daysInMonth; d++) {
                            const dayTs = monthTs + (d * secondsPerDay);
                            
                            if (dayTs < startTs || dayTs > endTs) continue;

                            const dDiff = (dayTs - todayTs) / secondsPerDay;
                            const dAbsLeft = originX + (dDiff * this.pxPerDay);

                            if (dAbsLeft < renderMinX || dAbsLeft > renderMaxX) continue;

                            labels.push({ 
                                left: dAbsLeft - renderMinX, 
                                timestamp: dayTs, 
                                label: d + 1, 
                                type: "day" 
                            });
                        }
                    }
                }
            }
        }
        return labels;
    }
}