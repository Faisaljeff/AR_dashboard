/**
 * Audit Renderer
 * Handles rendering of audit table with filtering, sorting, and export
 */

const AuditRenderer = {
    currentData: null,
    filteredData: null,
    sortColumn: null,
    sortDirection: 'asc',
    
    /**
     * Render audit table with processed entries
     * @param {Array} processedEntries - Array of entry metadata objects
     */
    render(processedEntries) {
        this.currentData = processedEntries || [];
        this.filteredData = [...this.currentData];
        
        // Apply current sort if any
        if (this.sortColumn) {
            this._sortData(this.sortColumn, this.sortDirection);
        }
        
        this._renderTable();
        this._updateTotals();
    },
    
    /**
     * Apply filters to the data (if no filters provided, show all data)
     * @param {Object} filters - Filter object with teams, states, categories, groups, timezones, dateRange
     */
    applyFilters(filters) {
        if (!this.currentData) return;
        
        // If no filters provided or all filters are empty, show all data
        if (!filters || (
            (!filters.teams || filters.teams.size === 0) &&
            (!filters.states || filters.states.size === 0) &&
            (!filters.categories || filters.categories.size === 0) &&
            (!filters.groups || filters.groups.size === 0) &&
            (!filters.timezones || filters.timezones.size === 0) &&
            !filters.dateRangeStart &&
            !filters.dateRangeEnd
        )) {
            this.filteredData = [...this.currentData];
            this._renderTable();
            this._updateTotals();
            return;
        }
        
        this.filteredData = this.currentData.filter(entry => {
            // Team filter
            if (filters.teams && filters.teams.size > 0) {
                if (!entry.team || !filters.teams.has(entry.team)) {
                    return false;
                }
            }
            
            // State filter
            if (filters.states && filters.states.size > 0) {
                if (!entry.normalizedState || !filters.states.has(entry.normalizedState)) {
                    return false;
                }
            }
            
            // Category filter
            if (filters.categories && filters.categories.size > 0) {
                const stateConfig = StateConfig.getStateByName(entry.normalizedState);
                const category = stateConfig?.category || null;
                if (!category || !filters.categories.has(category)) {
                    return false;
                }
            }
            
            // Group filter
            if (filters.groups && filters.groups.size > 0) {
                const stateConfig = StateConfig.getStateByName(entry.normalizedState);
                const group = stateConfig?.group || null;
                if (!group || !filters.groups.has(group)) {
                    return false;
                }
            }
            
            // Timezone filter
            if (filters.timezones && filters.timezones.size > 0) {
                if (!entry.normalizedTimezone || !filters.timezones.has(entry.normalizedTimezone)) {
                    return false;
                }
            }
            
            // Date range filter
            if (filters.dateRangeStart || filters.dateRangeEnd) {
                const entryDate = DateUtils.parseDate(entry.date);
                if (entryDate) {
                    if (filters.dateRangeStart) {
                        const startDate = new Date(filters.dateRangeStart);
                        startDate.setHours(0, 0, 0, 0);
                        if (entryDate < startDate) {
                            return false;
                        }
                    }
                    if (filters.dateRangeEnd) {
                        const endDate = new Date(filters.dateRangeEnd);
                        endDate.setHours(23, 59, 59, 999);
                        if (entryDate > endDate) {
                            return false;
                        }
                    }
                }
            }
            
            return true;
        });
        
        // Re-apply sort
        if (this.sortColumn) {
            this._sortData(this.sortColumn, this.sortDirection);
        }
        
        this._renderTable();
        this._updateTotals();
    },
    
    /**
     * Sort table by column
     * @param {string} column - Column name to sort by
     * @param {string} direction - 'asc' or 'desc'
     */
    sort(column, direction) {
        this.sortColumn = column;
        this.sortDirection = direction || (this.sortColumn === column && this.sortDirection === 'asc' ? 'desc' : 'asc');
        this._sortData(column, this.sortDirection);
        this._renderTable();
    },
    
    /**
     * Internal sort data function
     * @private
     */
    _sortData(column, direction) {
        this.filteredData.sort((a, b) => {
            let aVal = this._getSortValue(a, column);
            let bVal = this._getSortValue(b, column);
            
            // Handle null/undefined
            if (aVal === null || aVal === undefined) aVal = '';
            if (bVal === null || bVal === undefined) bVal = '';
            
            // Compare
            let comparison = 0;
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                comparison = aVal - bVal;
            } else {
                comparison = String(aVal).localeCompare(String(bVal));
            }
            
            return direction === 'asc' ? comparison : -comparison;
        });
    },
    
    /**
     * Get sort value for a column
     * @private
     */
    _getSortValue(entry, column) {
        switch (column) {
            case 'site': return entry.site;
            case 'team': return entry.team;
            case 'agent': return entry.agent;
            case 'date': return DateUtils.parseDate(entry.date)?.getTime() || 0;
            case 'scheduleState': return entry.scheduleState;
            case 'startTime': return entry.startTime;
            case 'endTime': return entry.endTime;
            case 'durationSource': return entry.durationSourceMinutes || 0;
            case 'timezone': return entry.timezone;
            case 'startESTDate': return DateUtils.parseDate(entry.startESTDate)?.getTime() || 0;
            case 'startESTTime': return entry.startESTMinutes || 0;
            case 'endESTDate': return DateUtils.parseDate(entry.endESTDate)?.getTime() || 0;
            case 'endESTTime': return entry.endESTMinutes || 0;
            case 'durationEST': return entry.durationESTMinutes || 0;
            case 'difference': return entry.durationDifference || 0;
            default: return '';
        }
    },
    
    /**
     * Render the table
     * @private
     */
    _renderTable() {
        const thead = document.getElementById('auditTableHead');
        const tbody = document.getElementById('auditTableBody');
        
        if (!thead || !tbody) return;
        
        // Clear existing content
        thead.innerHTML = '';
        tbody.innerHTML = '';
        
        // Create header row
        const headerRow = document.createElement('tr');
        const columns = [
            { key: 'site', label: 'Site', sortable: true },
            { key: 'team', label: 'Team', sortable: true },
            { key: 'agent', label: 'Agent', sortable: true },
            { key: 'date', label: 'Date (Source)', sortable: true },
            { key: 'scheduleState', label: 'Schedule State', sortable: true },
            { key: 'startTime', label: 'Start Time (Source)', sortable: true },
            { key: 'endTime', label: 'End Time (Source)', sortable: true },
            { key: 'durationSource', label: 'Duration (Source)', sortable: true },
            { key: 'timezone', label: 'Timezone', sortable: true },
            { key: 'startESTDate', label: 'Start Date (EST)', sortable: true },
            { key: 'startESTTime', label: 'Start Time (EST)', sortable: true },
            { key: 'endESTDate', label: 'End Date (EST)', sortable: true },
            { key: 'endESTTime', label: 'End Time (EST)', sortable: true },
            { key: 'durationEST', label: 'Duration (EST)', sortable: true },
            { key: 'difference', label: 'Difference', sortable: true },
            { key: 'notes', label: 'Notes', sortable: false }
        ];
        
        columns.forEach(col => {
            const th = document.createElement('th');
            th.className = col.sortable ? 'sortable' : '';
            if (col.sortable) {
                th.addEventListener('click', () => {
                    this.sort(col.key, this.sortColumn === col.key && this.sortDirection === 'asc' ? 'desc' : 'asc');
                });
                
                // Add sort indicator
                if (this.sortColumn === col.key) {
                    th.classList.add(this.sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
                    th.innerHTML = `${col.label} <span class="sort-indicator">${this.sortDirection === 'asc' ? '↑' : '↓'}</span>`;
                } else {
                    th.textContent = col.label;
                }
            } else {
                th.textContent = col.label;
            }
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        
        // Create body rows
        this.filteredData.forEach(entry => {
            const row = document.createElement('tr');
            row.className = this._getRowClass(entry);
            
            // Site
            row.appendChild(this._createCell(entry.site || '-'));
            
            // Team
            row.appendChild(this._createCell(entry.team || '-'));
            
            // Agent
            row.appendChild(this._createCell(entry.agent || '-'));
            
            // Date (Source)
            row.appendChild(this._createCell(entry.date || '-'));
            
            // Schedule State
            const stateCell = this._createCell(entry.scheduleState || '-');
            if (entry.normalizedState !== entry.scheduleState) {
                stateCell.title = `Normalized to: ${entry.normalizedState}`;
                stateCell.classList.add('normalized-state');
            }
            row.appendChild(stateCell);
            
            // Start Time (Source)
            row.appendChild(this._createCell(entry.startTime || '-'));
            
            // End Time (Source)
            row.appendChild(this._createCell(entry.endTime || '-'));
            
            // Duration (Source)
            const sourceDuration = entry.durationSourceMinutes !== null 
                ? DateUtils.formatDuration(entry.durationSourceMinutes)
                : (entry.duration || '-');
            row.appendChild(this._createCell(sourceDuration));
            
            // Timezone
            row.appendChild(this._createCell(entry.timezone || '-'));
            
            // Start Date (EST)
            row.appendChild(this._createCell(entry.startESTDate || '-'));
            
            // Start Time (EST)
            row.appendChild(this._createCell(entry.startESTTime || '-'));
            
            // End Date (EST)
            row.appendChild(this._createCell(entry.endESTDate || '-'));
            
            // End Time (EST)
            row.appendChild(this._createCell(entry.endESTTime || '-'));
            
            // Duration (EST)
            row.appendChild(this._createCell(DateUtils.formatDuration(entry.durationESTMinutes)));
            
            // Difference
            const diffCell = this._createCell(
                entry.durationDifference !== null 
                    ? DateUtils.formatDuration(Math.abs(entry.durationDifference)) + (entry.durationDifference < 0 ? ' (-)' : ' (+)')
                    : '-'
            );
            if (entry.durationDifference !== null) {
                const absDiff = Math.abs(entry.durationDifference);
                if (absDiff > 30) {
                    diffCell.classList.add('diff-large');
                } else if (absDiff > 5) {
                    diffCell.classList.add('diff-medium');
                } else if (absDiff > 0) {
                    diffCell.classList.add('diff-small');
                }
            }
            row.appendChild(diffCell);
            
            // Notes
            const notes = [];
            if (entry.wasClamped) notes.push('Clamped');
            if (entry.wasTimezoneConverted) notes.push('TZ Converted');
            if (entry.dayOffsetApplied) notes.push('Day Offset');
            const notesCell = this._createCell(notes.join(', ') || '-');
            notesCell.className = 'notes-cell';
            row.appendChild(notesCell);
            
            tbody.appendChild(row);
        });
    },
    
    /**
     * Get CSS class for row based on entry properties
     * @private
     */
    _getRowClass(entry) {
        const classes = [];
        if (entry.wasClamped) classes.push('row-clamped');
        if (entry.wasTimezoneConverted) classes.push('row-converted');
        if (entry.durationDifference !== null && Math.abs(entry.durationDifference) > 30) {
            classes.push('row-highlight');
        }
        return classes.join(' ');
    },
    
    /**
     * Create a table cell
     * @private
     */
    _createCell(text) {
        const td = document.createElement('td');
        td.textContent = text;
        return td;
    },
    
    /**
     * Update totals display
     * @private
     */
    _updateTotals() {
        const totalRows = this.filteredData.length;
        let totalSourceMinutes = 0;
        let totalESTMinutes = 0;
        
        this.filteredData.forEach(entry => {
            if (entry.durationSourceMinutes !== null) {
                totalSourceMinutes += entry.durationSourceMinutes;
            }
            totalESTMinutes += entry.durationESTMinutes || 0;
        });
        
        const totalDifference = totalESTMinutes - totalSourceMinutes;
        
        document.getElementById('totalRowsCount').textContent = `${totalRows} rows`;
        document.getElementById('totalDurationSource').textContent = `Source: ${DateUtils.formatDuration(totalSourceMinutes)}`;
        document.getElementById('totalDurationEST').textContent = `EST: ${DateUtils.formatDuration(totalESTMinutes)}`;
        document.getElementById('totalDifference').textContent = `Diff: ${DateUtils.formatDuration(Math.abs(totalDifference))} ${totalDifference < 0 ? '(-)' : '(+)'}`;
    },
    
    /**
     * Export filtered data to CSV
     */
    exportToCSV() {
        if (!this.filteredData || this.filteredData.length === 0) {
            alert('No data to export');
            return;
        }
        
        // CSV headers
        const headers = [
            'Site', 'Team', 'Agent', 'Date', 'Schedule State', 'Normalized State',
            'Start Time (Source)', 'End Time (Source)', 'Duration (Source)', 'Timezone',
            'Start Date (EST)', 'Start Time (EST)', 'End Date (EST)', 'End Time (EST)',
            'Duration (EST)', 'Difference', 'Was Clamped', 'Was Timezone Converted', 'Day Offset Applied'
        ];
        
        // CSV rows
        const rows = this.filteredData.map(entry => [
            entry.site || '',
            entry.team || '',
            entry.agent || '',
            entry.date || '',
            entry.scheduleState || '',
            entry.normalizedState || '',
            entry.startTime || '',
            entry.endTime || '',
            entry.duration || '',
            entry.timezone || '',
            entry.startESTDate || '',
            entry.startESTTime || '',
            entry.endESTDate || '',
            entry.endESTTime || '',
            DateUtils.formatDuration(entry.durationESTMinutes),
            entry.durationDifference !== null ? DateUtils.formatDuration(Math.abs(entry.durationDifference)) : '',
            entry.wasClamped ? 'Yes' : 'No',
            entry.wasTimezoneConverted ? 'Yes' : 'No',
            entry.dayOffsetApplied ? 'Yes' : 'No'
        ]);
        
        // Combine headers and rows
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => {
                // Escape commas and quotes in CSV
                const cellStr = String(cell);
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                    return `"${cellStr.replace(/"/g, '""')}"`;
                }
                return cellStr;
            }).join(','))
        ].join('\n');
        
        // Create download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `audit_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

