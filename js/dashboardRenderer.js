/**
 * Dashboard Renderer
 * Handles rendering of multiple dashboards, one per Schedule State Group
 */

const DashboardRenderer = {
    /**
     * Render multiple dashboards, one per visible Schedule State Group
     * @param {Object} previousData - Processed previous schedule data
     * @param {Object} ariseData - Processed arise schedule data
     */
    render(previousData, ariseData) {
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
            console.log(`Dashboard Render: Arise data all states:`, Object.keys(ariseData.stateTotals || {}));
            
            // Filter data to only include states in this group
            const filteredPrevious = DataProcessor.filterByStates(previousData, stateNames);
            const filteredArise = DataProcessor.filterByStates(ariseData, stateNames);

            console.log(`Dashboard Render: Group "${groupName}" - Previous filtered states:`, Object.keys(filteredPrevious.stateTotals));
            console.log(`Dashboard Render: Group "${groupName}" - Arise filtered states:`, Object.keys(filteredArise.stateTotals));

            // Always render the dashboard if it's set to visible, even if empty
            // This allows users to see all selected dashboards
            const hasData = Object.keys(filteredPrevious.stateTotals).length > 0 || 
                           Object.keys(filteredArise.stateTotals).length > 0;
            
            if (!hasData) {
                console.log(`Dashboard Render: Group "${groupName}" has no data, but rendering empty dashboard since it's visible`);
            }

            const dashboardSection = this._createDashboardSection(groupName, filteredPrevious, filteredArise, stateNames);
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
    _createDashboardSection(groupName, previousData, ariseData, stateNames) {
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
        
        // Toggle switch for show/hide dashboard
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'dashboard-toggle-container';
        toggleContainer.style.cssText = 'display: flex; align-items: center; gap: 0.5rem;';
        
        const toggleSwitch = document.createElement('input');
        toggleSwitch.type = 'checkbox';
        toggleSwitch.className = 'dashboard-toggle-switch';
        toggleSwitch.id = `toggle_${this._sanitizeId(groupName)}`;
        toggleSwitch.checked = true; // Default to visible
        toggleSwitch.setAttribute('data-group-name', groupName);
        toggleSwitch.title = 'Toggle dashboard visibility';
        
        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'dashboard-toggle-label';
        toggleLabel.setAttribute('for', toggleSwitch.id);
        toggleLabel.textContent = 'Show';
        toggleLabel.style.cssText = 'font-size: 0.75rem; color: var(--text-secondary); cursor: pointer; user-select: none;';
        
        // Set initial state from settings
        const visibility = StateConfig.getDashboardVisibility();
        const isVisible = visibility[groupName] !== false;
        toggleSwitch.checked = isVisible;
        toggleLabel.textContent = isVisible ? 'Hide' : 'Show';
        
        // Toggle event handler
        toggleSwitch.addEventListener('change', (e) => {
            const visible = e.target.checked;
            StateConfig.setDashboardVisibility(groupName, visible);
            toggleLabel.textContent = visible ? 'Hide' : 'Show';
            
            // Hide/show the dashboard content (keep header visible for toggling)
            const dashboardContent = section.querySelector('.dashboard-container');
            if (dashboardContent) {
                if (visible) {
                    dashboardContent.style.display = 'grid';
                    section.classList.remove('dashboard-hidden');
                } else {
                    dashboardContent.style.display = 'none';
                    section.classList.add('dashboard-hidden');
                }
            }
        });
        
        // Set initial visibility state
        if (!isVisible) {
            const dashboardContent = section.querySelector('.dashboard-container');
            if (dashboardContent) {
                dashboardContent.style.display = 'none';
                section.classList.add('dashboard-hidden');
            }
        }
        
        toggleContainer.appendChild(toggleLabel);
        toggleContainer.appendChild(toggleSwitch);
        titleContainer.appendChild(toggleContainer);
        
        header.appendChild(titleContainer);

        const headerRight = document.createElement('div');
        headerRight.style.cssText = 'display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;';
        
        // Summary stats for this group
        const summaryStats = this._renderSummaryStats(previousData, ariseData, stateNames);
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

        // After Arise Schedule column
        const ariseColumn = this._createScheduleColumn('After Arise Schedule', `arise_${this._sanitizeId(groupName)}`, ariseData, stateNames);
        dashboardContainer.appendChild(ariseColumn);

        // Set up synchronized scrolling between the two table containers
        this._setupSynchronizedScrolling(prevColumn, ariseColumn, groupName);

        section.appendChild(header);
        section.appendChild(dashboardContainer);

        return section;
    },

    /**
     * Create a schedule column (Previous or After Arise)
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
    _renderSummaryStats(previousData, ariseData, stateNames) {
        const summaryContainer = document.createElement('div');
        summaryContainer.className = 'summary-stats';

        stateNames.forEach(stateName => {
            const prev = previousData.stateTotals[stateName] || { totalDuration: 0, totalAgents: 0 };
            const arise = ariseData.stateTotals[stateName] || { totalDuration: 0, totalAgents: 0 };
            
            // Only show card if there's data in either prev or arise
            const hasData = (prev.totalDuration > 0 || prev.totalAgents > 0) || 
                           (arise.totalDuration > 0 || arise.totalAgents > 0);
            
            if (!hasData) {
                return; // Skip this card
            }
            
            const durationDiff = arise.totalDuration - prev.totalDuration;
            const agentsDiff = arise.totalAgents - prev.totalAgents;

            const card = document.createElement('div');
            card.className = 'stat-card';
            card.innerHTML = `
                <div class="stat-label">${stateName}</div>
                <div class="stat-value">
                    Prev: ${DateUtils.formatDuration(prev.totalDuration)} (${prev.totalAgents} agents)<br>
                    Arise: ${DateUtils.formatDuration(arise.totalDuration)} (${arise.totalAgents} agents)<br>
                    <small style="color: ${durationDiff >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}">
                        Δ: ${durationDiff >= 0 ? '+' : ''}${DateUtils.formatDuration(durationDiff)} (${agentsDiff >= 0 ? '+' : ''}${agentsDiff} agents)
                    </small>
                </div>
            `;
            summaryContainer.appendChild(card);
        });

        return summaryContainer;
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
    _setupSynchronizedScrolling(prevColumn, ariseColumn, groupName) {
        const prevTableContainer = prevColumn.querySelector('.table-container');
        const ariseTableContainer = ariseColumn.querySelector('.table-container');
        
        if (!prevTableContainer || !ariseTableContainer) return;

        let isScrolling = false;

        // Sync Previous to After Arise
        prevTableContainer.addEventListener('scroll', () => {
            if (!isScrolling) {
                isScrolling = true;
                ariseTableContainer.scrollTop = prevTableContainer.scrollTop;
                ariseTableContainer.scrollLeft = prevTableContainer.scrollLeft;
                setTimeout(() => { isScrolling = false; }, 10);
            }
        });

        // Sync After Arise to Previous
        ariseTableContainer.addEventListener('scroll', () => {
            if (!isScrolling) {
                isScrolling = true;
                prevTableContainer.scrollTop = ariseTableContainer.scrollTop;
                prevTableContainer.scrollLeft = ariseTableContainer.scrollLeft;
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
