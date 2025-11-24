/**
 * Dashboard Renderer
 * Handles rendering of multiple dashboards, one per Schedule State Group
 */

const DashboardRenderer = {
    /**
     * Render multiple dashboards, one per visible Schedule State Group
     * @param {Object} previousData - Processed previous schedule data
     * @param {Object} updatedData - Processed updated schedule data
     */
    render(previousData, updatedData) {
        const container = document.getElementById('dashboardsContainer');
        container.innerHTML = '';

        // Get all groups that have states configured
        const allGroups = StateConfig.getAllGroups();
        const visibility = StateConfig.getDashboardVisibility();
        
        // Debug logging
        console.log('Dashboard Render - All Groups:', allGroups);
        console.log('Dashboard Render - Visibility Settings:', visibility);
        
        // Get groups that should be visible
        // Show ALL dashboards that are set to visible, regardless of whether they have states or data
        let visibleGroups = allGroups.filter(group => {
            // Check visibility: if not explicitly set to false, default to true
            // Only hide if explicitly set to false
            const isVisible = visibility[group] !== false;
            
            console.log(`Group: "${group}" - Visibility setting: ${visibility[group]}, Is Visible: ${isVisible}`);
            
            // Show dashboard if it's visible (don't require states or data)
            return isVisible;
        });

        // Get dashboard order from settings and sort
        const dashboardOrder = this._getDashboardOrder();
        if (dashboardOrder.length > 0) {
            visibleGroups = visibleGroups.sort((a, b) => {
                const orderA = dashboardOrder.indexOf(a);
                const orderB = dashboardOrder.indexOf(b);
                
                // If both are in order, sort by order
                if (orderA !== -1 && orderB !== -1) {
                    return orderA - orderB;
                }
                // If only A is in order, A comes first
                if (orderA !== -1) return -1;
                // If only B is in order, B comes first
                if (orderB !== -1) return 1;
                // If neither is in order, maintain original order
                return 0;
            });
        }

        console.log('Dashboard Render - Visible Groups:', visibleGroups);

        if (visibleGroups.length === 0) {
            // Provide more detailed error message
            const allStates = StateConfig.getAllStates();
            const statesWithGroups = allStates.filter(s => s.group && s.group.trim() !== '');
            const groupsWithStates = new Set(statesWithGroups.map(s => s.group));
            
            let errorMsg = '<p style="text-align: center; padding: 2rem; color: var(--text-secondary);">';
            errorMsg += '<strong>No dashboards to display.</strong><br><br>';
            errorMsg += `Total groups: ${allGroups.length}<br>`;
            errorMsg += `Groups with states: ${groupsWithStates.size}<br>`;
            errorMsg += `Visible groups: ${Object.keys(visibility).filter(g => visibility[g] === true).length}<br><br>`;
            errorMsg += 'Please ensure:<br>';
            errorMsg += '1. Schedule states have groups assigned<br>';
            errorMsg += '2. Dashboard visibility is enabled in Settings<br>';
            errorMsg += '3. Schedule data has been loaded';
            errorMsg += '</p>';
            
            container.innerHTML = errorMsg;
            container.style.display = 'block';
            return;
        }

        // Render a dashboard for each visible group
        visibleGroups.forEach(groupName => {
            const statesInGroup = StateConfig.getStatesByGroup(groupName);
            const stateNames = statesInGroup.map(s => s.name);
            
            console.log(`Dashboard Render: Rendering dashboard for group: "${groupName}"`);
            console.log(`Dashboard Render: States in group:`, stateNames);
            console.log(`Dashboard Render: Previous data all states:`, Object.keys(previousData.stateTotals || {}));
            console.log(`Dashboard Render: Updated data all states:`, Object.keys(updatedData.stateTotals || {}));
            
            // Filter data to only include states in this group
            const filteredPrevious = DataProcessor.filterByStates(previousData, stateNames);
            const filteredUpdated = DataProcessor.filterByStates(updatedData, stateNames);

            console.log(`Dashboard Render: Group "${groupName}" - Previous filtered states:`, Object.keys(filteredPrevious.stateTotals));
            console.log(`Dashboard Render: Group "${groupName}" - Updated filtered states:`, Object.keys(filteredUpdated.stateTotals));

            // Always render the dashboard if it's set to visible, even if empty
            // This allows users to see all selected dashboards
            const hasData = Object.keys(filteredPrevious.stateTotals).length > 0 || 
                           Object.keys(filteredUpdated.stateTotals).length > 0;
            
            if (!hasData) {
                console.log(`Dashboard Render: Group "${groupName}" has no data, but rendering empty dashboard since it's visible`);
            }

            const dashboardSection = this._createDashboardSection(groupName, filteredPrevious, filteredUpdated, stateNames);
            container.appendChild(dashboardSection);
        });

        // Show container
        container.style.display = 'block';
        
        // Set up drag and drop for dashboard reordering
        this._setupDashboardDragAndDrop();
    },

    /**
     * Create a dashboard section for a specific group
     * @private
     */
    _createDashboardSection(groupName, previousData, updatedData, stateNames) {
        const section = document.createElement('section');
        section.className = 'dashboard-section';
        section.id = `dashboard_${this._sanitizeId(groupName)}`;
        section.setAttribute('data-group-name', groupName);
        section.setAttribute('draggable', 'true');
        
        // Dashboard header
        const header = document.createElement('div');
        header.className = 'dashboard-header';
        
        // Drag handle and title container
        const titleContainer = document.createElement('div');
        titleContainer.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; flex: 1;';
        
        // Drag handle icon
        const dragHandle = document.createElement('span');
        dragHandle.innerHTML = '☰';
        dragHandle.style.cssText = 'cursor: move; font-size: 1.25rem; color: var(--text-secondary); user-select: none;';
        dragHandle.title = 'Drag to reorder dashboard';
        dragHandle.setAttribute('draggable', 'false');
        titleContainer.appendChild(dragHandle);
        
        const title = document.createElement('h2');
        title.textContent = groupName;
        title.style.cssText = 'margin: 0; flex: 1;';
        titleContainer.appendChild(title);
        
        header.appendChild(titleContainer);

        const headerRight = document.createElement('div');
        headerRight.style.cssText = 'display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;';
        
        // Summary stats for this group
        const summaryStats = this._renderSummaryStats(previousData, updatedData, stateNames);
        headerRight.appendChild(summaryStats);

        // Timezone indicator
        const timezoneBadge = document.createElement('div');
        timezoneBadge.style.cssText = 'font-size: 0.75rem; color: var(--text-secondary); padding: 0.375rem 0.75rem; background-color: var(--background); border-radius: var(--radius-sm); border: 1px solid var(--border-color); white-space: nowrap;';
        timezoneBadge.innerHTML = '<strong>Timezone:</strong> EST/EDT (America/New_York)';
        headerRight.appendChild(timezoneBadge);

        header.appendChild(headerRight);

        // Dashboard container with two columns
        const dashboardContainer = document.createElement('div');
        dashboardContainer.className = 'dashboard-container';
        dashboardContainer.setAttribute('data-group-name', groupName);

        // Previous Schedule column
        const prevColumn = this._createScheduleColumn('Previous Schedule', `prev_${this._sanitizeId(groupName)}`, previousData, stateNames);
        dashboardContainer.appendChild(prevColumn);

        // Updated Schedule column
        const updatedColumn = this._createScheduleColumn('Updated Schedule', `updated_${this._sanitizeId(groupName)}`, updatedData, stateNames);
        dashboardContainer.appendChild(updatedColumn);

        // Set up synchronized scrolling between the two table containers
        this._setupSynchronizedScrolling(prevColumn, updatedColumn, groupName);

        section.appendChild(header);
        section.appendChild(dashboardContainer);

        return section;
    },

    /**
     * Create a schedule column (Previous or Updated)
     * Only includes columns for states that have data in any interval
     * @private
     */
    _createScheduleColumn(title, uniqueId, processedData, stateNames) {
        const column = document.createElement('div');
        column.className = 'schedule-column';

        const columnTitle = document.createElement('h3');
        columnTitle.className = 'column-title';
        columnTitle.textContent = title;
        column.appendChild(columnTitle);

        // Filter state names to only include those with data
        const statesWithData = stateNames.filter(stateName => {
            // Check if state has data in any interval or in state totals
            const hasIntervalData = processedData.intervals.some(intervalData => {
                const stateInfo = intervalData.states[stateName];
                return stateInfo && (stateInfo.totalDuration > 0 || stateInfo.agentCount > 0);
            });
            
            const stateTotal = processedData.stateTotals[stateName];
            const hasTotalData = stateTotal && (stateTotal.totalDuration > 0 || stateTotal.totalAgents > 0);
            
            return hasIntervalData || hasTotalData;
        });

        // If no states have data, show empty message
        if (statesWithData.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-column-message';
            emptyMsg.textContent = 'No data available for this schedule';
            emptyMsg.style.cssText = 'text-align: center; padding: 2rem; color: var(--text-secondary); font-style: italic;';
            column.appendChild(emptyMsg);
            return column;
        }

        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-container';
        tableContainer.setAttribute('data-scroll-sync', uniqueId);

        const table = document.createElement('table');
        table.className = 'schedule-table';
        table.id = `table_${uniqueId}`;

        const thead = document.createElement('thead');
        const tbody = document.createElement('tbody');
        tbody.id = `tbody_${uniqueId}`;

        // Build header
        const headerRow = document.createElement('tr');
        const timeHeader = document.createElement('th');
        timeHeader.textContent = 'Time';
        headerRow.appendChild(timeHeader);

        statesWithData.forEach(stateName => {
            const stateHeader = document.createElement('th');
            stateHeader.className = 'state-header-cell';
            stateHeader.innerHTML = `
                <div class="state-header-name">${stateName}</div>
                <div class="state-header-subtitle">Duration / Count</div>
            `;
            headerRow.appendChild(stateHeader);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);
        table.appendChild(tbody);

        // Build body rows
        processedData.intervals.forEach(intervalData => {
            const row = document.createElement('tr');
            
            // Time cell
            const timeCell = document.createElement('td');
            timeCell.className = 'interval-time';
            timeCell.textContent = intervalData.interval.label;
            row.appendChild(timeCell);

            // State cells - only for states with data
            statesWithData.forEach(stateName => {
                const stateCell = document.createElement('td');
                const stateInfo = intervalData.states[stateName];
                
                if (stateInfo && (stateInfo.totalDuration > 0 || stateInfo.agentCount > 0)) {
                    stateCell.className = 'state-cell';
                    stateCell.innerHTML = `
                        <div class="state-duration">${DateUtils.formatDuration(stateInfo.totalDuration)}</div>
                        <div class="state-count">${stateInfo.agentCount} agents</div>
                    `;
                } else {
                    stateCell.className = 'state-cell-empty';
                    stateCell.innerHTML = '<div class="empty-cell">-</div>';
                }
                
                row.appendChild(stateCell);
            });

            tbody.appendChild(row);
        });

        tableContainer.appendChild(table);
        column.appendChild(tableContainer);

        return column;
    },

    /**
     * Render summary statistics for a group
     * Only shows cards for states that have data (duration > 0 or agents > 0)
     * @private
     */
    _renderSummaryStats(previousData, updatedData, stateNames) {
        const summaryContainer = document.createElement('div');
        summaryContainer.className = 'summary-stats';

        stateNames.forEach((stateName, idx) => {
            const prev = previousData.stateTotals[stateName] || { totalDuration: 0, totalAgents: 0 };
            const updated = updatedData.stateTotals[stateName] || { totalDuration: 0, totalAgents: 0 };
            const prevBreakdown = this._buildStateBreakdown(previousData, stateName);
            const updatedBreakdown = this._buildStateBreakdown(updatedData, stateName);
            
            // Only show card if there's data in either prev or updated
            const hasData = (prev.totalDuration > 0 || prev.totalAgents > 0) || 
                           (updated.totalDuration > 0 || updated.totalAgents > 0);
            
            if (!hasData) {
                return; // Skip this card
            }
            
            const durationDiff = updated.totalDuration - prev.totalDuration;
            const agentsDiff = updated.totalAgents - prev.totalAgents;
            const detailsId = `state-details-${this._sanitizeId(stateName)}-${idx}`;

            const card = document.createElement('div');
            card.className = 'stat-card';
            card.innerHTML = `
                <div class="stat-label">${stateName}</div>
                <div class="stat-value">
                    Prev: ${DateUtils.formatDuration(prev.totalDuration)} (${prev.totalAgents} agents)<br>
                    Updated: ${DateUtils.formatDuration(updated.totalDuration)} (${updated.totalAgents} agents)<br>
                    <small style="color: ${durationDiff >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}">
                        Δ: ${durationDiff >= 0 ? '+' : ''}${DateUtils.formatDuration(durationDiff)} (${agentsDiff >= 0 ? '+' : ''}${agentsDiff} agents)
                    </small>
                </div>
                <div class="card-breakdown-summary">
                    ${this._renderBreakdownSummary('Previous', prevBreakdown)}
                    ${this._renderBreakdownSummary('Updated', updatedBreakdown)}
                </div>
                <button class="details-toggle" data-target="${detailsId}" type="button">Show details</button>
                <div class="card-details" id="${detailsId}" hidden>
                    ${this._renderBreakdownDetails(prevBreakdown, updatedBreakdown, stateName)}
                </div>
            `;

            const toggleBtn = card.querySelector('.details-toggle');
            const detailsEl = card.querySelector(`#${detailsId}`);
            if (toggleBtn && detailsEl) {
                toggleBtn.addEventListener('click', () => {
                    const isHidden = detailsEl.hasAttribute('hidden');
                    if (isHidden) {
                        detailsEl.removeAttribute('hidden');
                        toggleBtn.textContent = 'Hide details';
                        toggleBtn.setAttribute('aria-expanded', 'true');
                    } else {
                        detailsEl.setAttribute('hidden', '');
                        toggleBtn.textContent = 'Show details';
                        toggleBtn.setAttribute('aria-expanded', 'false');
                    }
                });
            }
            summaryContainer.appendChild(card);
        });

        return summaryContainer;
    },

    /**
     * Build a breakdown summary for a specific state within processed data
     * @private
     */
    _buildStateBreakdown(processedData, stateName) {
        const fallback = {
            rows: 0,
            totalSourceMinutes: 0,
            totalAppliedMinutes: 0,
            entries: []
        };

        if (!processedData || !Array.isArray(processedData.processedEntries)) {
            return fallback;
        }

        const entries = processedData.processedEntries.filter(entry => {
            if (!entry) return false;
            return (entry.normalizedState || entry.scheduleState || '').toLowerCase() === stateName.toLowerCase();
        });

        if (entries.length === 0) {
            return fallback;
        }

        let totalSourceMinutes = 0;
        let totalAppliedMinutes = 0;

        entries.forEach(entry => {
            const source = Number.isFinite(entry.durationSourceMinutes) ? entry.durationSourceMinutes : 0;
            const applied = Number.isFinite(entry.durationAppliedMinutes) 
                ? entry.durationAppliedMinutes 
                : source;
            totalSourceMinutes += source;
            totalAppliedMinutes += applied;
        });

        return {
            rows: entries.length,
            totalSourceMinutes,
            totalAppliedMinutes,
            entries
        };
    },

    /**
     * Render a compact summary block for Previous/Updated data
     * @private
     */
    _renderBreakdownSummary(label, breakdown) {
        const data = breakdown || { rows: 0, totalSourceMinutes: 0, totalAppliedMinutes: 0 };
        return `
            <div class="card-summary-block">
                <div class="summary-label">${label}</div>
                <div class="summary-duration">${DateUtils.formatDuration(data.totalAppliedMinutes)}</div>
                <div class="summary-meta">Rows: ${data.rows}</div>
                <div class="summary-meta small">CSV Sum: ${DateUtils.formatDuration(data.totalSourceMinutes)}</div>
            </div>
        `;
    },

    /**
     * Render detailed breakdown tables for testing/validation
     * @private
     */
    _renderBreakdownDetails(prevBreakdown, updatedBreakdown, stateName) {
        return `
            <div class="card-details-header">
                <strong>${stateName} breakdown</strong>
                <span>This panel lists the rows contributing to the totals (testing view).</span>
            </div>
            <div class="card-details-grid">
                ${this._renderDatasetDetails('Previous', prevBreakdown)}
                ${this._renderDatasetDetails('Updated', updatedBreakdown)}
            </div>
        `;
    },

    /**
     * Render dataset-specific table
     * @private
     */
    _renderDatasetDetails(label, breakdown) {
        const data = breakdown || { rows: 0, totalSourceMinutes: 0, totalAppliedMinutes: 0, entries: [] };
        const formatDuration = (mins) => DateUtils.formatDuration(mins || 0);

        if (data.rows === 0) {
            return `
                <div class="card-details-column">
                    <h5>${label}</h5>
                    <p class="details-empty">No rows for this dataset.</p>
                </div>
            `;
        }

        const maxRows = 20;
        const rowsHtml = data.entries.slice(0, maxRows).map(entry => {
            const source = Number.isFinite(entry.durationSourceMinutes) ? entry.durationSourceMinutes : 0;
            const applied = Number.isFinite(entry.durationAppliedMinutes) ? entry.durationAppliedMinutes : source;
            return `
                <tr>
                    <td>${entry.agent || '-'}</td>
                    <td>${entry.date || entry.startESTDate || '-'}</td>
                    <td>${entry.startESTTime || '-'} – ${entry.endESTTime || '-'}</td>
                    <td>${formatDuration(source)}</td>
                    <td>${formatDuration(applied)}</td>
                    <td>${entry.wasClamped ? 'Yes' : 'No'}</td>
                </tr>
            `;
        }).join('');

        const remaining = data.entries.length > maxRows
            ? `<div class="details-note">Showing ${maxRows} of ${data.entries.length} rows…</div>`
            : '';

        return `
            <div class="card-details-column">
                <h5>${label}</h5>
                <div class="details-stat-line">
                    Rows: ${data.rows} • CSV Sum: ${formatDuration(data.totalSourceMinutes)} • Applied Sum: ${formatDuration(data.totalAppliedMinutes)}
                </div>
                <div class="details-table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Agent</th>
                                <th>Date</th>
                                <th>Time (EST)</th>
                                <th>CSV</th>
                                <th>Applied</th>
                                <th>Clamped</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
                ${remaining}
            </div>
        `;
    },

    /**
     * Sanitize a string to be used as an ID
     * @private
     */
    _sanitizeId(str) {
        return str.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    },

    /**
     * Show loading state
     */
    showLoading() {
        document.getElementById('loadingSection').style.display = 'block';
        document.getElementById('dashboardsContainer').style.display = 'none';
        document.getElementById('errorSection').style.display = 'none';
    },

    /**
     * Hide loading state
     */
    hideLoading() {
        document.getElementById('loadingSection').style.display = 'none';
    },

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('errorSection').style.display = 'block';
        document.getElementById('dashboardsContainer').style.display = 'none';
        document.getElementById('loadingSection').style.display = 'none';
    },

    /**
     * Hide error message
     */
    hideError() {
        document.getElementById('errorSection').style.display = 'none';
    },

    /**
     * Show warning message
     * @param {string} message - Warning message
     */
    showWarning(message) {
        // Create or update warning element
        let warningEl = document.getElementById('warningMessage');
        if (!warningEl) {
            const errorSection = document.getElementById('errorSection');
            warningEl = document.createElement('div');
            warningEl.id = 'warningMessage';
            warningEl.style.cssText = 'background-color: #fff3cd; border: 1px solid #ffc107; color: #856404; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;';
            errorSection.insertBefore(warningEl, errorSection.firstChild);
        }
        warningEl.textContent = message;
        warningEl.style.display = 'block';
        document.getElementById('errorSection').style.display = 'block';
    },

    /**
     * Set up synchronized scrolling between two table containers
     * @private
     */
    _setupSynchronizedScrolling(prevColumn, updatedColumn, groupName) {
        const prevTableContainer = prevColumn.querySelector('.table-container');
        const updatedTableContainer = updatedColumn.querySelector('.table-container');
        
        if (!prevTableContainer || !updatedTableContainer) return;

        let isScrolling = false;

        // Sync Previous to Updated
        prevTableContainer.addEventListener('scroll', () => {
            if (!isScrolling) {
                isScrolling = true;
                updatedTableContainer.scrollTop = prevTableContainer.scrollTop;
                updatedTableContainer.scrollLeft = prevTableContainer.scrollLeft;
                setTimeout(() => { isScrolling = false; }, 10);
            }
        });

        // Sync Updated to Previous
        updatedTableContainer.addEventListener('scroll', () => {
            if (!isScrolling) {
                isScrolling = true;
                prevTableContainer.scrollTop = updatedTableContainer.scrollTop;
                prevTableContainer.scrollLeft = updatedTableContainer.scrollLeft;
                setTimeout(() => { isScrolling = false; }, 10);
            }
        });
    },

    /**
     * Get dashboard order from localStorage
     * @private
     */
    _getDashboardOrder() {
        try {
            const stored = localStorage.getItem('dashboardOrder');
            if (stored) {
                return JSON.parse(stored);
            }
            return [];
        } catch (e) {
            console.error('Error reading dashboard order:', e);
            return [];
        }
    },

    /**
     * Save dashboard order to localStorage
     * @private
     */
    _saveDashboardOrder(order) {
        try {
            localStorage.setItem('dashboardOrder', JSON.stringify(order));
        } catch (e) {
            console.error('Error saving dashboard order:', e);
        }
    },

    /**
     * Set up drag and drop for dashboard reordering
     * @private
     */
    _setupDashboardDragAndDrop() {
        const container = document.getElementById('dashboardsContainer');
        if (!container) return;

        const dashboards = container.querySelectorAll('.dashboard-section');
        
        dashboards.forEach(dashboard => {
            // Remove existing listeners to avoid duplicates
            dashboard.addEventListener('dragstart', this._handleDragStart.bind(this));
            dashboard.addEventListener('dragover', this._handleDragOver.bind(this));
            dashboard.addEventListener('drop', this._handleDrop.bind(this));
            dashboard.addEventListener('dragend', this._handleDragEnd.bind(this));
        });
    },

    /**
     * Handle drag start
     * @private
     */
    _handleDragStart(e) {
        const dashboard = e.currentTarget;
        dashboard.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dashboard.getAttribute('data-group-name'));
    },

    /**
     * Handle drag over
     * @private
     */
    _handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        
        const dragging = document.querySelector('.dragging');
        if (!dragging) return;
        
        const container = document.getElementById('dashboardsContainer');
        const afterElement = this._getDragAfterElement(container, e.clientY);
        
        if (afterElement == null) {
            container.appendChild(dragging);
        } else {
            container.insertBefore(dragging, afterElement);
        }
    },

    /**
     * Get element after which to insert dragged element
     * @private
     */
    _getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.dashboard-section:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    },

    /**
     * Handle drop
     * @private
     */
    _handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }
        
        // Save new order
        const container = document.getElementById('dashboardsContainer');
        const dashboards = container.querySelectorAll('.dashboard-section');
        const newOrder = Array.from(dashboards).map(d => d.getAttribute('data-group-name'));
        this._saveDashboardOrder(newOrder);
        
        return false;
    },

    /**
     * Handle drag end
     * @private
     */
    _handleDragEnd(e) {
        const dashboard = e.currentTarget;
        dashboard.classList.remove('dragging');
    }
};
