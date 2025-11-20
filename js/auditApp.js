/**
 * Audit App Controller
 * Handles data loading, filtering, and tab switching for audit page
 */

const AuditApp = {
    currentTab: 'previous',
    previousData: null,
    ariseData: null,
    filters: {
        teams: new Set(),
        states: new Set(),
        categories: new Set(),
        groups: new Set(),
        timezones: new Set(),
        dateRangeStart: null,
        dateRangeEnd: null
    },
    filterOptions: {
        teams: [],
        states: [],
        categories: [],
        groups: [],
        timezones: []
    },
    
    /**
     * Initialize the audit page
     */
    init() {
        this._loadData();
        this._setupEventListeners();
        this._populateFilterOptions();
        this._renderFilters();
    },
    
    /**
     * Load processed data from localStorage
     * @private
     */
    _loadData() {
        // Try to get current date from URL or use today
        const urlParams = new URLSearchParams(window.location.search);
        const dateParam = urlParams.get('date');
        const targetDate = dateParam ? new Date(dateParam) : new Date();
        
        const dateKey = this._getDateKey(targetDate);
        
        // Try to load audit data
        const previousAuditData = localStorage.getItem(`auditData_previous_${dateKey}`);
        const ariseAuditData = localStorage.getItem(`auditData_arise_${dateKey}`);
        
        if (previousAuditData && ariseAuditData) {
            try {
                this.previousData = JSON.parse(previousAuditData);
                this.ariseData = JSON.parse(ariseAuditData);
                
                // Show tabs and table
                document.getElementById('auditTabsSection').style.display = 'block';
                document.getElementById('auditTableSection').style.display = 'block';
                document.getElementById('noDataSection').style.display = 'none';
                
                // Render initial data
                this._switchTab('previous');
                
                return;
            } catch (e) {
                console.error('Error loading audit data:', e);
            }
        }
        
        // No data found - show message
        document.getElementById('auditTabsSection').style.display = 'none';
        document.getElementById('auditTableSection').style.display = 'none';
        document.getElementById('noDataSection').style.display = 'block';
        document.getElementById('filtersSection').style.display = 'none';
    },
    
    /**
     * Set up event listeners
     * @private
     */
    _setupEventListeners() {
        // Tab switching
        document.getElementById('tabPrevious').addEventListener('click', () => {
            this._switchTab('previous');
        });
        
        document.getElementById('tabArise').addEventListener('click', () => {
            this._switchTab('arise');
        });
        
        // Clear filters button
        document.getElementById('clearFiltersBtn').addEventListener('click', () => {
            this._clearFilters();
        });
        
        // Export CSV button
        document.getElementById('exportCsvBtn').addEventListener('click', () => {
            AuditRenderer.exportToCSV();
        });
        
        // Date range filters
        document.getElementById('auditDateRangeStart').addEventListener('change', (e) => {
            this.filters.dateRangeStart = e.target.value || null;
            this._applyFilters();
        });
        
        document.getElementById('auditDateRangeEnd').addEventListener('change', (e) => {
            this.filters.dateRangeEnd = e.target.value || null;
            this._applyFilters();
        });
    },
    
    /**
     * Switch between Previous and After Arise tabs
     * @private
     */
    _switchTab(tabName) {
        this.currentTab = tabName;
        
        // Update tab buttons
        document.querySelectorAll('.audit-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById(`tab${tabName === 'previous' ? 'Previous' : 'Arise'}`).classList.add('active');
        
        // Get data for current tab
        const data = tabName === 'previous' ? this.previousData : this.ariseData;
        
        if (data && data.processedEntries) {
            AuditRenderer.render(data.processedEntries);
            this._applyFilters(); // Re-apply filters
        } else {
            AuditRenderer.render([]);
        }
    },
    
    /**
     * Populate filter options from loaded data
     * @private
     */
    _populateFilterOptions() {
        if (!this.previousData && !this.ariseData) return;
        
        const allEntries = [
            ...(this.previousData?.processedEntries || []),
            ...(this.ariseData?.processedEntries || [])
        ];
        
        const teamSet = new Set();
        const stateSet = new Set();
        const timezoneSet = new Set();
        
        allEntries.forEach(entry => {
            if (entry.team) teamSet.add(entry.team);
            if (entry.normalizedState) stateSet.add(entry.normalizedState);
            if (entry.normalizedTimezone) timezoneSet.add(entry.normalizedTimezone);
        });
        
        const categories = StateConfig.getAllCategories() || [];
        const groups = StateConfig.getAllGroups() || [];
        
        this.filterOptions = {
            teams: Array.from(teamSet).sort(),
            states: Array.from(stateSet).sort(),
            categories: [...categories].sort(),
            groups: [...groups].sort(),
            timezones: Array.from(timezoneSet).sort()
        };
    },
    
    /**
     * Render filter checkboxes
     * @private
     */
    _renderFilters() {
        if (!this.previousData && !this.ariseData) {
            document.getElementById('filtersSection').style.display = 'none';
            return;
        }
        
        document.getElementById('filtersSection').style.display = 'block';
        
        // Render each filter type
        this._renderFilterCheckboxes('auditTeamFilter', 'teams', this.filterOptions.teams);
        this._renderFilterCheckboxes('auditStateFilter', 'states', this.filterOptions.states);
        this._renderFilterCheckboxes('auditCategoryFilter', 'categories', this.filterOptions.categories);
        this._renderFilterCheckboxes('auditGroupFilter', 'groups', this.filterOptions.groups);
        this._renderFilterCheckboxes('auditTimezoneFilter', 'timezones', this.filterOptions.timezones);
    },
    
    /**
     * Render checkboxes for a filter
     * @private
     */
    _renderFilterCheckboxes(containerId, filterKey, options) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';
        
        // Select All / Clear buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'filter-buttons';
        buttonContainer.style.cssText = 'margin-bottom: 0.5rem; display: flex; gap: 0.5rem;';
        
        const selectAllBtn = document.createElement('button');
        selectAllBtn.type = 'button';
        selectAllBtn.className = 'btn btn-link';
        selectAllBtn.textContent = 'Select All';
        selectAllBtn.style.cssText = 'font-size: 0.75rem; padding: 0.25rem 0.5rem;';
        selectAllBtn.addEventListener('click', () => {
            this.filters[filterKey] = new Set(options);
            this._renderFilterCheckboxes(containerId, filterKey, options);
            this._applyFilters();
        });
        
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'btn btn-link';
        clearBtn.textContent = 'Clear';
        clearBtn.style.cssText = 'font-size: 0.75rem; padding: 0.25rem 0.5rem;';
        clearBtn.addEventListener('click', () => {
            this.filters[filterKey] = new Set();
            this._renderFilterCheckboxes(containerId, filterKey, options);
            this._applyFilters();
        });
        
        buttonContainer.appendChild(selectAllBtn);
        buttonContainer.appendChild(clearBtn);
        container.appendChild(buttonContainer);
        
        // Checkboxes
        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = 'filter-checkboxes';
        checkboxContainer.style.cssText = 'max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.5rem;';
        
        options.forEach(option => {
            const label = document.createElement('label');
            label.className = 'filter-checkbox-item';
            label.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; cursor: pointer;';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = option;
            checkbox.checked = this.filters[filterKey].has(option);
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.filters[filterKey].add(option);
                } else {
                    this.filters[filterKey].delete(option);
                }
                this._applyFilters();
            });
            
            const span = document.createElement('span');
            span.textContent = option;
            span.style.cssText = 'font-size: 0.875rem;';
            
            label.appendChild(checkbox);
            label.appendChild(span);
            checkboxContainer.appendChild(label);
        });
        
        container.appendChild(checkboxContainer);
    },
    
    /**
     * Apply filters to current data
     * @private
     */
    _applyFilters() {
        AuditRenderer.applyFilters(this.filters);
    },
    
    /**
     * Clear all filters
     * @private
     */
    _clearFilters() {
        this.filters = {
            teams: new Set(),
            states: new Set(),
            categories: new Set(),
            groups: new Set(),
            timezones: new Set(),
            dateRangeStart: null,
            dateRangeEnd: null
        };
        
        // Clear date inputs
        document.getElementById('auditDateRangeStart').value = '';
        document.getElementById('auditDateRangeEnd').value = '';
        
        // Re-render filters
        this._renderFilters();
        
        // Re-apply (will show all data)
        this._applyFilters();
    },
    
    /**
     * Get date key for localStorage (YYYYMMDD)
     * @private
     */
    _getDateKey(date) {
        if (!date) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AuditApp.init());
} else {
    AuditApp.init();
}

