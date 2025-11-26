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
            // IMPORTANT: The stateNames are configured state names, which should match
            // the normalized state names in processedData (from StateConfig.findMatchingState)
            let filteredPrevious = DataProcessor.filterByStates(previousData, stateNames);
            let filteredUpdated = DataProcessor.filterByStates(updatedData, stateNames);
            
            // ALSO include states from data that might belong to this group based on their category/group
            // This handles cases where states don't match configured names exactly
            const allDataStates = new Set([
                ...Object.keys(previousData.stateTotals || {}),
                ...Object.keys(updatedData.stateTotals || {})
            ]);
            
            const additionalStates = [];
            allDataStates.forEach(dataStateName => {
                // Skip if already in stateNames
                if (stateNames.some(s => s.toLowerCase() === dataStateName.toLowerCase())) {
                    return;
                }
                
                // Check if this state might belong to this group
                // Try to find a matching state config by checking the state name
                const stateConfig = StateConfig.getStateByName(dataStateName);
                if (stateConfig && stateConfig.group === groupName) {
                    additionalStates.push(dataStateName);
                } else {
                    // Also check if the state name contains keywords that match this group
                    // This is a fallback for states that aren't configured but might belong
                    const groupKeywords = groupName.toLowerCase().split(/[,\s]+/);
                    const stateNameLower = dataStateName.toLowerCase();
                    const matchesGroup = groupKeywords.some(keyword => 
                        keyword.length > 3 && stateNameLower.includes(keyword)
                    );
                    if (matchesGroup) {
                        additionalStates.push(dataStateName);
                    }
                }
            });
            
            if (additionalStates.length > 0) {
                console.log(`Dashboard Render: Found ${additionalStates.length} additional states for group "${groupName}":`, additionalStates);
                // Merge additional states into filtered data
                const allStatesForGroup = [...stateNames, ...additionalStates];
                filteredPrevious = DataProcessor.filterByStates(previousData, allStatesForGroup);
                filteredUpdated = DataProcessor.filterByStates(updatedData, allStatesForGroup);
            }
            
            // Double-check: Log what states are actually in the filtered data
            console.log(`Dashboard Render: After filtering for group "${groupName}":`);
            console.log(`  - Previous filtered states:`, Object.keys(filteredPrevious.stateTotals || {}));
            console.log(`  - Updated filtered states:`, Object.keys(filteredUpdated.stateTotals || {}));

            console.log(`Dashboard Render: Group "${groupName}" - Previous filtered states:`, Object.keys(filteredPrevious.stateTotals));
            console.log(`Dashboard Render: Group "${groupName}" - Updated filtered states:`, Object.keys(filteredUpdated.stateTotals));

            // Always render the dashboard if it's set to visible, even if empty
            // This allows users to see all selected dashboards
            const hasData = Object.keys(filteredPrevious.stateTotals).length > 0 || 
                           Object.keys(filteredUpdated.stateTotals).length > 0;
            
            if (!hasData) {
                console.log(`Dashboard Render: Group "${groupName}" has no data, but rendering empty dashboard since it's visible`);
            }

            // Include both configured state names and additional states found in data
            const allStateNamesForGroup = [...stateNames, ...additionalStates];
            const dashboardSection = this._createDashboardSection(groupName, filteredPrevious, filteredUpdated, allStateNamesForGroup);
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

        // Validate processedData
        if (!processedData || !processedData.intervals || !processedData.stateTotals) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-column-message';
            emptyMsg.textContent = 'No data available for this schedule';
            emptyMsg.style.cssText = 'text-align: center; padding: 2rem; color: var(--text-secondary); font-style: italic;';
            column.appendChild(emptyMsg);
            return column;
        }

        // Create a case-insensitive lookup map for state names in the data
        const stateNameMap = new Map();
        Object.keys(processedData.stateTotals || {}).forEach(key => {
            stateNameMap.set(key.toLowerCase(), key);
        });
        (processedData.intervals || []).forEach(intervalData => {
            if (intervalData && intervalData.states) {
                Object.keys(intervalData.states).forEach(key => {
                    if (!stateNameMap.has(key.toLowerCase())) {
                        stateNameMap.set(key.toLowerCase(), key);
                    }
                });
            }
        });
        
        console.log(`[Dashboard] Creating column "${title}" with ${stateNames.length} configured states`);
        console.log(`[Dashboard] Found ${stateNameMap.size} unique state names in filtered data:`, Array.from(stateNameMap.values()));

        // Create a set of valid state names for this group (case-insensitive)
        const validStateNamesSet = new Set(stateNames.map(s => s.toLowerCase()));
        
        // First, try to match configured state names to data (case-insensitive)
        const matchedStates = new Map(); // Maps configured state name -> actual data key
        stateNames.forEach(configuredStateName => {
            const normalized = configuredStateName.toLowerCase();
            const dataKey = stateNameMap.get(normalized);
            if (dataKey) {
                // Verify the data key is actually in our valid state names
                if (validStateNamesSet.has(dataKey.toLowerCase())) {
                    matchedStates.set(configuredStateName, dataKey);
                }
            } else if (processedData.stateTotals[configuredStateName]) {
                // Exact match fallback - verify it's in our valid list
                if (validStateNamesSet.has(configuredStateName.toLowerCase())) {
                    matchedStates.set(configuredStateName, configuredStateName);
                }
            }
        });
        
        // Build list of states to display - prefer configured state names, but use data state names if no match
        const statesWithData = [];
        const usedDataKeys = new Set();
        const usedDisplayNames = new Set(); // Track display names to prevent duplicates
        
        // Add matched configured states
        matchedStates.forEach((dataKey, configuredName) => {
            // Skip if we've already added this display name
            if (usedDisplayNames.has(configuredName.toLowerCase())) {
                return;
            }
            
            const hasIntervalData = processedData.intervals.some(intervalData => {
                const stateInfo = intervalData.states[dataKey];
                return stateInfo && (stateInfo.totalDuration > 0 || stateInfo.agentCount > 0);
            });
            const stateTotal = processedData.stateTotals[dataKey];
            const hasTotalData = stateTotal && (stateTotal.totalDuration > 0 || stateTotal.totalAgents > 0);
            
            if (hasIntervalData || hasTotalData) {
                statesWithData.push(configuredName); // Use configured name for display
                usedDataKeys.add(dataKey);
                usedDisplayNames.add(configuredName.toLowerCase());
            }
        });
        
        // Add any remaining data states that weren't matched to configured states
        // BUT ONLY if they are in the stateNames list (i.e., belong to this group)
        // This ensures we only show states that belong to this specific group/column
        const stateNamesSet = new Set(stateNames.map(s => s.toLowerCase()));
        Object.keys(processedData.stateTotals || {}).forEach(dataStateName => {
            // Only include if it's in the stateNames list for this group
            if (!stateNamesSet.has(dataStateName.toLowerCase())) {
                return; // Skip states that don't belong to this group
            }
            
            if (!usedDataKeys.has(dataStateName) && !usedDisplayNames.has(dataStateName.toLowerCase())) {
                const stateTotal = processedData.stateTotals[dataStateName];
                const hasData = stateTotal && (stateTotal.totalDuration > 0 || stateTotal.totalAgents > 0);
                if (hasData) {
                    const hasIntervalData = processedData.intervals.some(intervalData => {
                        const stateInfo = intervalData.states[dataStateName];
                        return stateInfo && (stateInfo.totalDuration > 0 || stateInfo.agentCount > 0);
                    });
                    if (hasIntervalData || hasData) {
                        statesWithData.push(dataStateName); // Use data state name
                        usedDisplayNames.add(dataStateName.toLowerCase());
                    }
                }
            }
        });

        // NOW: Group states by category instead of showing each state as a separate column
        // This aggregates all states within the same category into a single column
        const categoryMap = new Map(); // Maps category name -> { states: [...], displayName: "..." }
        
        statesWithData.forEach(stateName => {
            // Find the category for this state
            const stateConfig = StateConfig.getStateByName(stateName);
            let category = stateConfig?.category || 'Other';
            
            // If no config found, try to infer category from state name
            if (!stateConfig) {
                const stateNameLower = stateName.toLowerCase();
                if (stateNameLower.includes('break')) category = 'Break';
                else if (stateNameLower.includes('meeting')) category = 'Meeting';
                else if (stateNameLower.includes('training')) category = 'Training';
                else if (stateNameLower.includes('coaching')) category = 'Coaching';
                else if (stateNameLower.includes('time off') || stateNameLower.includes('paid')) category = 'Time Off';
                else if (stateNameLower.includes('work')) category = 'Work';
                else category = 'Other';
            }
            
            if (!categoryMap.has(category)) {
                categoryMap.set(category, {
                    states: [],
                    displayName: category
                });
            }
            categoryMap.get(category).states.push(stateName);
        });
        
        // Convert category map to array of categories to display
        const categoriesWithData = Array.from(categoryMap.keys()).sort();

        // If no categories have data, show empty message
        if (categoriesWithData.length === 0) {
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

        // Build header - one column per category
        const headerRow = document.createElement('tr');
        const timeHeader = document.createElement('th');
        timeHeader.textContent = 'Time';
        headerRow.appendChild(timeHeader);

        categoriesWithData.forEach(categoryName => {
            const categoryHeader = document.createElement('th');
            categoryHeader.className = 'state-header-cell';
            categoryHeader.innerHTML = `
                <div class="state-header-name">${categoryName}</div>
                <div class="state-header-subtitle">Duration / Count</div>
            `;
            headerRow.appendChild(categoryHeader);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);
        table.appendChild(tbody);

        // Build body rows - ensure we only show valid 30-minute intervals (max 48)
        // Filter out any corrupted or duplicate intervals
        const validIntervals = (processedData.intervals || []).filter((intervalData, index) => {
            if (!intervalData || !intervalData.interval) return false;
            // Validate interval index and minutes
            const interval = intervalData.interval;
            if (interval.index !== undefined && interval.index !== index) {
                console.warn(`[Dashboard] Interval index mismatch: expected ${index}, got ${interval.index}`);
            }
            // Ensure minutes are within valid range (0-1439)
            if (interval.startMinutes !== undefined) {
                if (interval.startMinutes < 0 || interval.startMinutes >= 1440) {
                    console.warn(`[Dashboard] Invalid interval startMinutes: ${interval.startMinutes}`);
                    return false;
                }
            }
            return true;
        }).slice(0, 48); // Limit to 48 intervals (one day)
        
        // If we have more than 48 intervals, something is wrong
        if (processedData.intervals && processedData.intervals.length > 48) {
            console.error(`[Dashboard] ERROR: Found ${processedData.intervals.length} intervals, expected max 48. Data may be corrupted.`);
        }
        
        validIntervals.forEach((intervalData, index) => {
            const row = document.createElement('tr');
            
            // Time cell - validate the label
            const timeCell = document.createElement('td');
            timeCell.className = 'interval-time';
            let timeLabel = intervalData.interval.label;
            // Validate time label format
            if (!timeLabel || !timeLabel.match(/\d{1,2}:\d{2}\s*(AM|PM)/i)) {
                // Regenerate label from index if corrupted
                const startMinutes = index * 30;
                timeLabel = DateUtils.minutesToTimeString(startMinutes);
                console.warn(`[Dashboard] Invalid time label "${intervalData.interval.label}", regenerated to "${timeLabel}"`);
            }
            timeCell.textContent = timeLabel;
            row.appendChild(timeCell);

            // Category cells - aggregate all states within each category
            categoriesWithData.forEach(categoryName => {
                const categoryCell = document.createElement('td');
                const categoryInfo = categoryMap.get(categoryName);
                const statesInCategory = categoryInfo.states;
                
                // Aggregate duration and agent count for all states in this category
                let totalDuration = 0;
                const uniqueAgents = new Set();
                
                statesInCategory.forEach(stateName => {
                    // Try to find the actual data key for this state name
                    let actualKey = matchedStates.get(stateName);
                    if (!actualKey) {
                        const normalizedName = stateName.toLowerCase();
                        actualKey = stateNameMap.get(normalizedName) || stateName;
                    }
                    
                    const stateInfo = intervalData.states[actualKey];
                    if (stateInfo) {
                        totalDuration += stateInfo.totalDuration || 0;
                        // Note: agentCount is already unique per interval, so we sum them
                        // But we need to track unique agents across states in the category
                        // For now, we'll sum the agent counts (this might double-count if same agent in multiple states)
                        // TODO: Track unique agents per category if needed
                    }
                });
                
                // Also check state totals to get unique agent count
                let totalAgents = 0;
                statesInCategory.forEach(stateName => {
                    let actualKey = matchedStates.get(stateName);
                    if (!actualKey) {
                        const normalizedName = stateName.toLowerCase();
                        actualKey = stateNameMap.get(normalizedName) || stateName;
                    }
                    const stateInfo = intervalData.states[actualKey];
                    if (stateInfo && stateInfo.agentCount) {
                        totalAgents += stateInfo.agentCount;
                    }
                });
                
                if (totalDuration > 0 || totalAgents > 0) {
                    categoryCell.className = 'state-cell';
                    categoryCell.innerHTML = `
                        <div class="state-duration">${DateUtils.formatDuration(totalDuration)}</div>
                        <div class="state-count">${totalAgents} agents</div>
                    `;
                } else {
                    categoryCell.className = 'state-cell-empty';
                    categoryCell.innerHTML = '<div class="empty-cell">-</div>';
                }
                
                row.appendChild(categoryCell);
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

        // Group states by category
        const categoryMap = new Map();
        stateNames.forEach(stateName => {
            const stateConfig = StateConfig.getStateByName(stateName);
            let category = stateConfig?.category || 'Other';
            
            // If no config found, try to infer category from state name
            if (!stateConfig) {
                const stateNameLower = stateName.toLowerCase();
                if (stateNameLower.includes('break')) category = 'Break';
                else if (stateNameLower.includes('meeting')) category = 'Meeting';
                else if (stateNameLower.includes('training')) category = 'Training';
                else if (stateNameLower.includes('coaching')) category = 'Coaching';
                else if (stateNameLower.includes('time off') || stateNameLower.includes('paid')) category = 'Time Off';
                else if (stateNameLower.includes('work')) category = 'Work';
                else category = 'Other';
            }
            
            if (!categoryMap.has(category)) {
                categoryMap.set(category, []);
            }
            categoryMap.get(category).push(stateName);
        });

        // Create one card per category
        Array.from(categoryMap.keys()).sort().forEach((categoryName, idx) => {
            const statesInCategory = categoryMap.get(categoryName);
            
            // Aggregate totals for all states in this category
            let prevTotalDuration = 0;
            let prevTotalAgents = 0;
            let updatedTotalDuration = 0;
            let updatedTotalAgents = 0;
            let prevTotalRows = 0;
            let updatedTotalRows = 0;
            let prevTotalSourceMinutes = 0;
            let updatedTotalSourceMinutes = 0;
            let prevTotalAppliedMinutes = 0;
            let updatedTotalAppliedMinutes = 0;
            
            const prevAllEntries = [];
            const updatedAllEntries = [];
            
            statesInCategory.forEach(stateName => {
                const prev = previousData.stateTotals[stateName] || { totalDuration: 0, totalAgents: 0 };
                const updated = updatedData.stateTotals[stateName] || { totalDuration: 0, totalAgents: 0 };
                
                prevTotalDuration += prev.totalDuration || 0;
                prevTotalAgents += prev.totalAgents || 0;
                updatedTotalDuration += updated.totalDuration || 0;
                updatedTotalAgents += updated.totalAgents || 0;
                
                const prevBreakdown = this._buildStateBreakdown(previousData, stateName);
                const updatedBreakdown = this._buildStateBreakdown(updatedData, stateName);
                
                // Sum rows and minutes
                prevTotalRows += prevBreakdown.rows || 0;
                updatedTotalRows += updatedBreakdown.rows || 0;
                prevTotalSourceMinutes += prevBreakdown.totalSourceMinutes || 0;
                updatedTotalSourceMinutes += updatedBreakdown.totalSourceMinutes || 0;
                prevTotalAppliedMinutes += prevBreakdown.totalAppliedMinutes || 0;
                updatedTotalAppliedMinutes += updatedBreakdown.totalAppliedMinutes || 0;
                
                // Collect all entries
                if (prevBreakdown.entries) {
                    prevAllEntries.push(...prevBreakdown.entries);
                }
                if (updatedBreakdown.entries) {
                    updatedAllEntries.push(...updatedBreakdown.entries);
                }
            });
            
            // Only show card if there's data in either prev or updated
            const hasData = (prevTotalDuration > 0 || prevTotalAgents > 0) || 
                           (updatedTotalDuration > 0 || updatedTotalAgents > 0);
            
            if (!hasData) {
                return; // Skip this card
            }
            
            const durationDiff = updatedTotalDuration - prevTotalDuration;
            const agentsDiff = updatedTotalAgents - prevTotalAgents;
            const detailsId = `category-details-${this._sanitizeId(categoryName)}-${idx}`;

            // Combine breakdowns for display
            const combinedPrevBreakdown = {
                rows: prevTotalRows,
                totalSourceMinutes: prevTotalSourceMinutes,
                totalAppliedMinutes: prevTotalAppliedMinutes,
                entries: prevAllEntries
            };
            const combinedUpdatedBreakdown = {
                rows: updatedTotalRows,
                totalSourceMinutes: updatedTotalSourceMinutes,
                totalAppliedMinutes: updatedTotalAppliedMinutes,
                entries: updatedAllEntries
            };

            const card = document.createElement('div');
            card.className = 'stat-card';
            card.innerHTML = `
                <div class="stat-label">${categoryName}</div>
                <div class="stat-value">
                    Prev: ${DateUtils.formatDuration(prevTotalDuration)} (${prevTotalAgents} agents)<br>
                    Updated: ${DateUtils.formatDuration(updatedTotalDuration)} (${updatedTotalAgents} agents)<br>
                    <small style="color: ${durationDiff >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}">
                        Δ: ${durationDiff >= 0 ? '+' : ''}${DateUtils.formatDuration(durationDiff)} (${agentsDiff >= 0 ? '+' : ''}${agentsDiff} agents)
                    </small>
                </div>
                <div class="card-breakdown-summary">
                    ${this._renderBreakdownSummary('Previous', combinedPrevBreakdown)}
                    ${this._renderBreakdownSummary('Updated', combinedUpdatedBreakdown)}
                </div>
                <button class="details-toggle" data-target="${detailsId}" type="button">Show details</button>
                <div class="card-details" id="${detailsId}" hidden>
                    ${this._renderBreakdownDetails(combinedPrevBreakdown, combinedUpdatedBreakdown, categoryName)}
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

        // Find the actual data state key for this state name
        // stateName might be a configured name, but entries use the normalized state name from data
        const stateNameLower = stateName.toLowerCase();
        const entries = processedData.processedEntries.filter(entry => {
            if (!entry) return false;
            const entryState = (entry.normalizedState || entry.scheduleState || '').toLowerCase();
            // Match case-insensitively
            return entryState === stateNameLower;
        });
        
        // If no exact match, also check if this state name appears in stateTotals (might be a data state name)
        if (entries.length === 0 && processedData.stateTotals) {
            const matchingDataKey = Object.keys(processedData.stateTotals).find(key => 
                key.toLowerCase() === stateNameLower
            );
            if (matchingDataKey) {
                // Try matching with the actual data key
                const entriesByKey = processedData.processedEntries.filter(entry => {
                    if (!entry) return false;
                    const entryState = (entry.normalizedState || entry.scheduleState || '').toLowerCase();
                    return entryState === matchingDataKey.toLowerCase();
                });
                if (entriesByKey.length > 0) {
                    entries.push(...entriesByKey);
                }
            }
        }

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
