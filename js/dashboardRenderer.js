/**
 * Dashboard Renderer
 * Handles rendering of the dashboard UI with schedule data
 */

const DashboardRenderer = {
    /**
     * Render the complete dashboard
     * @param {Object} previousData - Processed previous schedule data
     * @param {Object} ariseData - Processed arise schedule data
     * @param {Array} visibleStates - Array of state names to display
     */
    render(previousData, ariseData, visibleStates = null) {
        // Filter data if states are specified
        const filteredPrevious = visibleStates 
            ? DataProcessor.filterByStates(previousData, visibleStates)
            : previousData;
        const filteredArise = visibleStates 
            ? DataProcessor.filterByStates(ariseData, visibleStates)
            : ariseData;

        // Render summary stats
        this._renderSummaryStats(filteredPrevious, filteredArise);

        // Render tables
        this._renderScheduleTable('previousScheduleTable', 'previousScheduleHeader', 'previousScheduleBody', filteredPrevious, visibleStates);
        this._renderScheduleTable('ariseScheduleTable', 'ariseScheduleHeader', 'ariseScheduleBody', filteredArise, visibleStates);

        // Show dashboard
        document.getElementById('dashboardSection').style.display = 'block';
    },

    /**
     * Render summary statistics
     * @private
     */
    _renderSummaryStats(previousData, ariseData) {
        const summaryContainer = document.getElementById('summaryStats');
        summaryContainer.innerHTML = '';

        // Get all unique states
        const allStates = new Set([
            ...Object.keys(previousData.stateTotals),
            ...Object.keys(ariseData.stateTotals)
        ]);

        allStates.forEach(stateName => {
            const prev = previousData.stateTotals[stateName] || { totalDuration: 0, totalAgents: 0 };
            const arise = ariseData.stateTotals[stateName] || { totalDuration: 0, totalAgents: 0 };
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
    },

    /**
     * Render a schedule table
     * @private
     */
    _renderScheduleTable(tableId, headerId, bodyId, processedData, visibleStates) {
        const headerEl = document.getElementById(headerId);
        const bodyEl = document.getElementById(bodyId);

        // Get all states to display
        let statesToShow = visibleStates || Object.keys(processedData.stateTotals);
        
        // If no states specified, get from configuration defaults
        if (!visibleStates || visibleStates.length === 0) {
            const defaultStates = StateConfig.getDefaultStates();
            if (defaultStates.length > 0) {
                statesToShow = defaultStates.map(s => s.name);
            } else {
                statesToShow = Object.keys(processedData.stateTotals);
            }
        }

        // Build header
        headerEl.innerHTML = '';
        const headerRow = document.createElement('tr');
        
        // Time column
        const timeHeader = document.createElement('th');
        timeHeader.textContent = 'Time';
        headerRow.appendChild(timeHeader);

        // State columns
        statesToShow.forEach(stateName => {
            const stateHeader = document.createElement('th');
            stateHeader.innerHTML = `
                <div style="font-weight: 600;">${stateName}</div>
                <div style="font-size: 0.7em; font-weight: normal; opacity: 0.9;">Duration / Count</div>
            `;
            headerRow.appendChild(stateHeader);
        });

        headerEl.appendChild(headerRow);

        // Build body
        bodyEl.innerHTML = '';
        processedData.intervals.forEach(intervalData => {
            const row = document.createElement('tr');
            
            // Time cell
            const timeCell = document.createElement('td');
            timeCell.className = 'interval-time';
            timeCell.textContent = intervalData.interval.label;
            row.appendChild(timeCell);

            // State cells
            statesToShow.forEach(stateName => {
                const stateCell = document.createElement('td');
                const stateInfo = intervalData.states[stateName];
                
                if (stateInfo) {
                    stateCell.className = 'state-cell';
                    stateCell.innerHTML = `
                        <div class="state-duration">${DateUtils.formatDuration(stateInfo.totalDuration)}</div>
                        <div class="state-count">${stateInfo.agentCount} agents</div>
                    `;
                } else {
                    stateCell.innerHTML = '<div style="color: var(--text-secondary);">-</div>';
                }
                
                row.appendChild(stateCell);
            });

            bodyEl.appendChild(row);
        });
    },

    /**
     * Render state filter checkboxes
     * @param {Array} allStates - All available state names
     * @param {Array} selectedStates - Currently selected state names
     * @param {Function} onChange - Callback when selection changes
     */
    renderStateFilters(allStates, selectedStates = [], onChange = null) {
        const filtersContainer = document.getElementById('stateFilters');
        filtersContainer.innerHTML = '';

        if (!allStates || allStates.length === 0) {
            filtersContainer.innerHTML = '<p style="color: var(--text-secondary);">No states available. Configure states in Settings.</p>';
            return;
        }

        // Get default states from configuration
        const defaultStates = StateConfig.getDefaultStates().map(s => s.name);
        const defaultSet = new Set(defaultStates);

        allStates.forEach(stateName => {
            const stateConfig = StateConfig.getStateByName(stateName);
            const isChecked = selectedStates.length === 0 
                ? defaultSet.has(stateName) 
                : selectedStates.includes(stateName);

            const filterItem = document.createElement('div');
            filterItem.className = 'state-filter-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `filter_${stateName}`;
            checkbox.value = stateName;
            checkbox.checked = isChecked;
            
            if (onChange) {
                checkbox.addEventListener('change', onChange);
            }

            const label = document.createElement('label');
            label.htmlFor = `filter_${stateName}`;
            label.textContent = stateName;
            
            if (stateConfig) {
                const badge = document.createElement('span');
                badge.className = `badge badge-${stateConfig.category.toLowerCase().replace(' ', '-')}`;
                badge.textContent = stateConfig.category;
                badge.style.marginLeft = '0.5rem';
                label.appendChild(badge);
            }

            filterItem.appendChild(checkbox);
            filterItem.appendChild(label);
            filtersContainer.appendChild(filterItem);
        });
    },

    /**
     * Show loading state
     */
    showLoading() {
        document.getElementById('loadingSection').style.display = 'block';
        document.getElementById('dashboardSection').style.display = 'none';
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
        document.getElementById('dashboardSection').style.display = 'none';
        document.getElementById('loadingSection').style.display = 'none';
    },

    /**
     * Hide error message
     */
    hideError() {
        document.getElementById('errorSection').style.display = 'none';
    }
};

