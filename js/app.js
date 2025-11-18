/**
 * Main Application
 * Orchestrates the dashboard functionality
 */

const App = {
    currentDate: null,
    previousScheduleData: null,
    ariseScheduleData: null,
    processedPrevious: null,
    processedArise: null,
    filters: {
        teams: new Set(),
        states: new Set(),
        categories: new Set(),
        groups: new Set()
    },
    filterOptions: {
        teams: [],
        states: [],
        categories: [],
        groups: []
    },

    /**
     * Initialize the application
     */
    init() {
        // Set today's date as default
        const today = new Date();
        const dateInput = document.getElementById('datePicker');
        dateInput.value = this._formatDateForInput(today);
        this.currentDate = today;

        // Set up event listeners
        this._setupEventListeners();

        // Try to load data for today
        this._tryLoadStoredData().catch(err => {
            console.error('Error loading initial data:', err);
        });
    },

    /**
     * Set up all event listeners
     * @private
     */
    _setupEventListeners() {
        const datePicker = document.getElementById('datePicker');
        const prevDayBtn = document.getElementById('prevDayBtn');
        const nextDayBtn = document.getElementById('nextDayBtn');
        const todayBtn = document.getElementById('todayBtn');

        // Date picker
        datePicker.addEventListener('change', async (e) => {
            this.currentDate = new Date(e.target.value);
            await this._tryLoadStoredData();
        });

        // Previous day button
        prevDayBtn.addEventListener('click', async () => {
            if (!this.currentDate) {
                this.currentDate = new Date();
            }
            this.currentDate.setDate(this.currentDate.getDate() - 1);
            this._updateDatePicker();
            await this._tryLoadStoredData();
        });

        // Next day button
        nextDayBtn.addEventListener('click', async () => {
            if (!this.currentDate) {
                this.currentDate = new Date();
            }
            this.currentDate.setDate(this.currentDate.getDate() + 1);
            this._updateDatePicker();
            await this._tryLoadStoredData();
        });

        // Today button
        todayBtn.addEventListener('click', async () => {
            this.currentDate = new Date();
            this._updateDatePicker();
            await this._tryLoadStoredData();
        });

        // Refresh data button (reload from data folder)
        document.getElementById('refreshDataBtn').addEventListener('click', async () => {
            await this._loadDataFromDataFolder();
        });

        // Load data button (manual upload)
        document.getElementById('loadDataBtn').addEventListener('click', () => {
            this._loadDataFromFiles();
        });

        // File inputs
        document.getElementById('scheduleFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById('scheduleFileName').textContent = file.name;
            }
        });

        document.getElementById('ariseFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById('ariseFileName').textContent = file.name;
            }
        });

        // Filters
        this._setupFilterControls();
    },

    /**
     * Try to load stored data for current date
     * Priority: 1. CSV files from data folder, 2. localStorage, 3. Manual upload
     * @private
     */
    async _tryLoadStoredData() {
        if (!this.currentDate) return;

        // First, try to load from CSV files in data folder
        const loadedFromFiles = await this._loadDataFromDataFolder();
        if (loadedFromFiles) {
            return;
        }

        // If files not found, try localStorage
        const dateKey = this._getDateKey(this.currentDate);
        const storedPrevious = localStorage.getItem(`scheduleData_previous_${dateKey}`);
        const storedArise = localStorage.getItem(`scheduleData_arise_${dateKey}`);

        if (storedPrevious && storedArise) {
            try {
                this.previousScheduleData = JSON.parse(storedPrevious);
                this.ariseScheduleData = JSON.parse(storedArise);
                this._populateFilterOptions();
                this._updateFileStatus('localStorage', dateKey);
                this._processAndRender();
            } catch (e) {
                console.error('Error loading stored data:', e);
            }
        } else {
            // No data found - show message
            this._updateFileStatus('notFound', dateKey);
        }
    },

    /**
     * Load data from CSV files in data folder
     * @private
     * @returns {Promise<boolean>} True if files were loaded successfully
     */
    async _loadDataFromDataFolder() {
        if (!this.currentDate) return false;

        const dateStr = DateUtils.formatDateForFilename(this.currentDate);
        const scheduleFileName = `data/Schedule_${dateStr}.csv`;
        const ariseFileName = `data/Arise_Schedule_${dateStr}.csv`;

        DashboardRenderer.showLoading();
        DashboardRenderer.hideError();

        try {
            // Try to fetch both files
            const [scheduleResponse, ariseResponse] = await Promise.allSettled([
                fetch(scheduleFileName),
                fetch(ariseFileName)
            ]);

            // Check if both files exist and loaded successfully
            const scheduleOk = scheduleResponse.status === 'fulfilled' && scheduleResponse.value.ok;
            const ariseOk = ariseResponse.status === 'fulfilled' && ariseResponse.value.ok;

            if (scheduleOk && ariseOk) {
                // Both files found - read their content
                const scheduleResponseObj = scheduleResponse.value;
                const ariseResponseObj = ariseResponse.value;
                
                const [scheduleText, ariseText] = await Promise.all([
                    scheduleResponseObj.text(),
                    ariseResponseObj.text()
                ]);

                // Parse both files
                const [scheduleData, ariseData] = await Promise.all([
                    CSVParser.parseFile(scheduleText),
                    CSVParser.parseFile(ariseText)
                ]);

                // Validate data
                const scheduleValidation = CSVParser.validateData(scheduleData);
                const ariseValidation = CSVParser.validateData(ariseData);

                if (!scheduleValidation.valid || !ariseValidation.valid) {
                    const errors = [...scheduleValidation.errors, ...ariseValidation.errors].join('\n');
                    DashboardRenderer.showError(`Data validation failed:\n${errors}`);
                    DashboardRenderer.hideLoading();
                    return false;
                }

                // Store raw data
                this.previousScheduleData = scheduleData;
                this.ariseScheduleData = ariseData;

                // Populate filters
                this._populateFilterOptions();

                // Store in localStorage for future use
                const dateKey = this._getDateKey(this.currentDate);
                localStorage.setItem(`scheduleData_previous_${dateKey}`, JSON.stringify(scheduleData));
                localStorage.setItem(`scheduleData_arise_${dateKey}`, JSON.stringify(ariseData));

                // Update UI
                this._updateFileStatus('dataFolder', dateStr);
                
                // Process and render
                this._processAndRender();
                DashboardRenderer.hideLoading();
                return true;

            } else {
                // Files not found in data folder - provide helpful message
                if (!scheduleOk && !ariseOk) {
                    // Both files missing - this is expected, will fall back to localStorage
                } else if (!scheduleOk) {
                    DashboardRenderer.showError(`Previous schedule file not found: ${scheduleFileName}`);
                    DashboardRenderer.hideLoading();
                    return false;
                } else if (!ariseOk) {
                    DashboardRenderer.showError(`After Arise schedule file not found: ${ariseFileName}`);
                    DashboardRenderer.hideLoading();
                    return false;
                }
                DashboardRenderer.hideLoading();
                return false;
            }

        } catch (error) {
            console.error('Error loading files from data folder:', error);
            DashboardRenderer.hideLoading();
            return false;
        }
    },

    /**
     * Update file status in UI
     * @private
     */
    _updateFileStatus(source, dateInfo) {
        const scheduleFileNameEl = document.getElementById('scheduleFileName');
        const ariseFileNameEl = document.getElementById('ariseFileName');

        if (source === 'dataFolder') {
            scheduleFileNameEl.textContent = `Schedule_${dateInfo}.csv (loaded from data folder)`;
            scheduleFileNameEl.style.color = 'var(--success-color)';
            ariseFileNameEl.textContent = `Arise_Schedule_${dateInfo}.csv (loaded from data folder)`;
            ariseFileNameEl.style.color = 'var(--success-color)';
        } else if (source === 'localStorage') {
            scheduleFileNameEl.textContent = `Schedule data (loaded from cache for ${dateInfo})`;
            scheduleFileNameEl.style.color = 'var(--text-secondary)';
            ariseFileNameEl.textContent = `Arise Schedule data (loaded from cache for ${dateInfo})`;
            ariseFileNameEl.style.color = 'var(--text-secondary)';
        } else if (source === 'uploaded') {
            scheduleFileNameEl.textContent = `Schedule_${dateInfo}.csv (uploaded)`;
            scheduleFileNameEl.style.color = 'var(--success-color)';
            ariseFileNameEl.textContent = `Arise_Schedule_${dateInfo}.csv (uploaded)`;
            ariseFileNameEl.style.color = 'var(--success-color)';
        } else if (source === 'notFound') {
            scheduleFileNameEl.textContent = 'No file found - please upload files';
            scheduleFileNameEl.style.color = 'var(--text-secondary)';
            ariseFileNameEl.textContent = 'No file found - please upload files';
            ariseFileNameEl.style.color = 'var(--text-secondary)';
        }
    },

    /**
     * Load data from uploaded files
     * @private
     */
    async _loadDataFromFiles() {
        const scheduleFile = document.getElementById('scheduleFile').files[0];
        const ariseFile = document.getElementById('ariseFile').files[0];

        if (!scheduleFile || !ariseFile) {
            DashboardRenderer.showError('Please upload both schedule files.');
            return;
        }

        DashboardRenderer.showLoading();
        DashboardRenderer.hideError();

        try {
            // Parse both files
            const [scheduleData, ariseData] = await Promise.all([
                CSVParser.parseFile(scheduleFile),
                CSVParser.parseFile(ariseFile)
            ]);

            // Validate data
            const scheduleValidation = CSVParser.validateData(scheduleData);
            const ariseValidation = CSVParser.validateData(ariseData);

            if (!scheduleValidation.valid || !ariseValidation.valid) {
                const errors = [...scheduleValidation.errors, ...ariseValidation.errors].join('\n');
                DashboardRenderer.showError(`Data validation failed:\n${errors}`);
                return;
            }

            // Store raw data
            this.previousScheduleData = scheduleData;
            this.ariseScheduleData = ariseData;
            this._populateFilterOptions();

            // Store in localStorage
            const dateKey = this._getDateKey(this.currentDate);
            localStorage.setItem(`scheduleData_previous_${dateKey}`, JSON.stringify(scheduleData));
            localStorage.setItem(`scheduleData_arise_${dateKey}`, JSON.stringify(ariseData));

            // Update file status
            this._updateFileStatus('uploaded', dateKey);

            // Process and render
            this._processAndRender();

        } catch (error) {
            console.error('Error loading files:', error);
            DashboardRenderer.showError(`Error loading files: ${error.message}`);
        } finally {
            DashboardRenderer.hideLoading();
        }
    },

    /**
     * Process data and render dashboard
     * @private
     */
    _processAndRender() {
        console.log('App: _processAndRender called');
        console.log('App: previousScheduleData:', this.previousScheduleData?.length || 0, 'entries');
        console.log('App: ariseScheduleData:', this.ariseScheduleData?.length || 0, 'entries');
        
        if (!this.previousScheduleData || !this.ariseScheduleData) {
            console.warn('App: Missing schedule data, cannot render');
            DashboardRenderer.showError('Please load schedule data files first.');
            return;
        }

        if (this.previousScheduleData.length === 0 || this.ariseScheduleData.length === 0) {
            console.warn('App: Empty schedule data');
            DashboardRenderer.showError('Schedule data files are empty. Please check your CSV files.');
            return;
        }

        // Get the target date for filtering (selected date in EST/EDT)
        // Only include entries that, after timezone conversion, fall on this date
        const targetDate = this.currentDate || new Date();
        console.log('App: Target date for filtering:', targetDate);
        if (this._hasActiveFilters()) {
            console.log('App: Active filters detected', {
                teams: Array.from(this.filters.teams),
                states: Array.from(this.filters.states),
                categories: Array.from(this.filters.categories),
                groups: Array.from(this.filters.groups)
            });
        }

        const filteredPrevious = this._applyFilters(this.previousScheduleData);
        const filteredArise = this._applyFilters(this.ariseScheduleData);
        console.log('App: Filtered previous entries:', filteredPrevious.length);
        console.log('App: Filtered arise entries:', filteredArise.length);
        if (filteredPrevious.length === 0 && filteredArise.length === 0 && this._hasActiveFilters()) {
            DashboardRenderer.showWarning('No records match the selected filters. Please adjust the filters to view data.');
        }

        try {
            // Process both datasets with date filtering
            // This ensures only entries that belong to the selected date (in EST/EDT) are included
            console.log('App: Processing previous schedule data...');
            this.processedPrevious = DataProcessor.processScheduleData(filteredPrevious, targetDate);
            console.log('App: Previous data processed. States found:', Object.keys(this.processedPrevious.stateTotals).length);
            console.log('App: Previous data state totals:', Object.keys(this.processedPrevious.stateTotals));
            
            console.log('App: Processing arise schedule data...');
            this.processedArise = DataProcessor.processScheduleData(filteredArise, targetDate);
            console.log('App: Arise data processed. States found:', Object.keys(this.processedArise.stateTotals).length);
            console.log('App: Arise data state totals:', Object.keys(this.processedArise.stateTotals));

            // Check if we have any data after processing
            const hasPreviousData = Object.keys(this.processedPrevious.stateTotals).length > 0;
            const hasAriseData = Object.keys(this.processedArise.stateTotals).length > 0;
            
            if (!hasPreviousData && !hasAriseData) {
                console.warn('App: No data found after processing. This might be due to strict date filtering.');
                console.log('App: Previous entries processed:', this.processedPrevious.metadata?.totalEntries || 0);
                console.log('App: Arise entries processed:', this.processedArise.metadata?.totalEntries || 0);
                
                // Try processing without date filter as fallback
                console.log('App: Attempting to process without date filter...');
                this.processedPrevious = DataProcessor.processScheduleData(filteredPrevious, null);
                this.processedArise = DataProcessor.processScheduleData(filteredArise, null);
                
                if (Object.keys(this.processedPrevious.stateTotals).length > 0 || 
                    Object.keys(this.processedArise.stateTotals).length > 0) {
                    console.warn('App: Data found without date filter. Date filtering may be too strict.');
                    DashboardRenderer.showWarning('Data found but may not match selected date. Showing all available data.');
                } else {
                    DashboardRenderer.showError('No schedule data found. Please check your CSV files and ensure they contain valid schedule entries.');
                    return;
                }
            }

            // Render multiple dashboards (one per visible group)
            console.log('App: Rendering dashboards...');
            DashboardRenderer.render(this.processedPrevious, this.processedArise);
            console.log('App: Dashboard rendering complete');
        } catch (error) {
            console.error('App: Error processing data:', error);
            DashboardRenderer.showError(`Error processing data: ${error.message}`);
        }
    },

    /**
     * Format date for input element (YYYY-MM-DD)
     * @private
     */
    _formatDateForInput(date) {
        if (!date) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    /**
     * Update the date picker input with current date
     * @private
     */
    _updateDatePicker() {
        if (this.currentDate) {
            const dateInput = document.getElementById('datePicker');
            if (dateInput) {
                dateInput.value = this._formatDateForInput(this.currentDate);
            }
        }
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
    },

    /**
     * Initialize filter controls
     * @private
     */
    _setupFilterControls() {
        const filterMappings = [
            { id: 'teamFilter', key: 'teams' },
            { id: 'stateFilter', key: 'states' },
            { id: 'categoryFilter', key: 'categories' },
            { id: 'groupFilter', key: 'groups' }
        ];

        filterMappings.forEach(({ id, key }) => {
            const element = document.getElementById(id);
            if (!element) return;
            element.addEventListener('change', () => {
                const selectedValues = Array.from(element.selectedOptions).map(option => option.value);
                this._updateFilterSelection(key, selectedValues);
            });
        });

        const clearBtn = document.getElementById('clearFiltersBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this._clearFilters());
        }
    },

    /**
     * Populate filter options using loaded datasets
     * @private
     */
    _populateFilterOptions() {
        if (!this.previousScheduleData || !this.ariseScheduleData) return;

        const combined = [...this.previousScheduleData, ...this.ariseScheduleData];
        const teamSet = new Set();
        const stateSet = new Set();

        combined.forEach(entry => {
            if (entry.team) {
                teamSet.add(entry.team);
            }
            const normalizedState = StateConfig.findMatchingState(entry.scheduleState);
            if (normalizedState) {
                stateSet.add(normalizedState);
            }
        });

        const categories = StateConfig.getAllCategories() || [];
        const groups = StateConfig.getAllGroups() || [];

        this.filterOptions = {
            teams: Array.from(teamSet).sort((a, b) => a.localeCompare(b)),
            states: Array.from(stateSet).sort((a, b) => a.localeCompare(b)),
            categories: [...categories].sort((a, b) => a.localeCompare(b)),
            groups: [...groups].sort((a, b) => a.localeCompare(b))
        };

        const syncSelection = (key) => {
            const available = new Set(this.filterOptions[key]);
            this.filters[key] = new Set(Array.from(this.filters[key]).filter(value => available.has(value)));
        };
        syncSelection('teams');
        syncSelection('states');
        syncSelection('categories');
        syncSelection('groups');

        this._renderFilterOptions();
    },

    /**
     * Render filter options in UI
     * @private
     */
    _renderFilterOptions() {
        const filtersSection = document.getElementById('filtersSection');
        const hasOptions = this.filterOptions.teams.length > 0 ||
                           this.filterOptions.states.length > 0 ||
                           this.filterOptions.categories.length > 0 ||
                           this.filterOptions.groups.length > 0;
        if (filtersSection) {
            filtersSection.style.display = hasOptions ? 'block' : 'none';
        }

        this._renderSelectOptions('teamFilter', this.filterOptions.teams, this.filters.teams);
        this._renderSelectOptions('stateFilter', this.filterOptions.states, this.filters.states);
        this._renderSelectOptions('categoryFilter', this.filterOptions.categories, this.filters.categories);
        this._renderSelectOptions('groupFilter', this.filterOptions.groups, this.filters.groups);
    },

    /**
     * Helper to populate a select element with options
     * @private
     */
    _renderSelectOptions(elementId, values, selectedSet) {
        const selectEl = document.getElementById(elementId);
        if (!selectEl) return;
        selectEl.innerHTML = '';
        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            if (selectedSet.has(value)) {
                option.selected = true;
            }
            selectEl.appendChild(option);
        });
    },

    /**
     * Update selection for specific filter key
     * @private
     */
    _updateFilterSelection(filterKey, values) {
        this.filters[filterKey] = new Set(values);
        this._processAndRender();
    },

    /**
     * Clear all filters
     * @private
     */
    _clearFilters() {
        Object.keys(this.filters).forEach(key => {
            this.filters[key] = new Set();
        });

        ['teamFilter', 'stateFilter', 'categoryFilter', 'groupFilter'].forEach(id => {
            const selectEl = document.getElementById(id);
            if (selectEl) {
                Array.from(selectEl.options).forEach(option => option.selected = false);
            }
        });

        this._processAndRender();
    },

    /**
     * Check if any filters are active
     * @private
     */
    _hasActiveFilters() {
        return Object.values(this.filters).some(set => set.size > 0);
    },

    /**
     * Apply filters to dataset
     * @private
     */
    _applyFilters(dataset) {
        if (!dataset || dataset.length === 0) {
            return [];
        }

        if (!this._hasActiveFilters()) {
            return dataset;
        }

        return dataset.filter(entry => {
            const normalizedState = StateConfig.findMatchingState(entry.scheduleState);
            const stateConfig = StateConfig.getStateByName(normalizedState);
            const category = stateConfig?.category || null;
            const group = stateConfig?.group || null;

            if (this.filters.teams.size && (!entry.team || !this.filters.teams.has(entry.team))) {
                return false;
            }

            if (this.filters.states.size && (!normalizedState || !this.filters.states.has(normalizedState))) {
                return false;
            }

            if (this.filters.categories.size) {
                if (!category || !this.filters.categories.has(category)) {
                    return false;
                }
            }

            if (this.filters.groups.size) {
                if (!group || !this.filters.groups.has(group)) {
                    return false;
                }
            }

            return true;
        });
    }
};

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}

