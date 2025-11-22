/**
 * Main Application
 * Orchestrates the dashboard functionality
 */

const App = {
    currentDate: null,
    previousScheduleData: null,
    updatedScheduleData: null,
    processedPrevious: null,
    processedUpdated: null,
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
    filterContainerIds: {
        teams: 'teamFilterOptions',
        states: 'stateFilterOptions',
        categories: 'categoryFilterOptions',
        groups: 'groupFilterOptions'
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

        document.getElementById('updatedFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById('updatedFileName').textContent = file.name;
            }
        });

        // Filters
        this._setupFilterControls();

        // Dashboard visibility controls
        this._setupDashboardToggleControls();
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
        const storedUpdated = localStorage.getItem(`scheduleData_updated_${dateKey}`);

        if (storedPrevious && storedUpdated) {
            try {
                this.previousScheduleData = JSON.parse(storedPrevious);
                this.updatedScheduleData = JSON.parse(storedUpdated);
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
     * Forces a fresh reload by clearing cache and adding cache-busting
     * @private
     * @returns {Promise<boolean>} True if files were loaded successfully
     */
    async _loadDataFromDataFolder() {
        if (!this.currentDate) return false;

        const dateStr = DateUtils.formatDateForFilename(this.currentDate);
        const dateKey = this._getDateKey(this.currentDate);
        
        // Clear cached data from localStorage to force fresh load
        localStorage.removeItem(`scheduleData_previous_${dateKey}`);
        localStorage.removeItem(`scheduleData_updated_${dateKey}`);
        localStorage.removeItem(`auditData_previous_${dateKey}`);
        localStorage.removeItem(`auditData_updated_${dateKey}`);
        
        // Clear in-memory data
        this.previousScheduleData = null;
        this.updatedScheduleData = null;
        this.processedPrevious = null;
        this.processedUpdated = null;

        // Add cache-busting query parameter to force fresh fetch
        const cacheBuster = `?t=${Date.now()}`;
        const scheduleFileName = `data/Schedule_${dateStr}.csv${cacheBuster}`;
        const updatedFileName = `data/Updated_Schedule_${dateStr}.csv${cacheBuster}`;

        DashboardRenderer.showLoading();
        DashboardRenderer.hideError();

        try {
            // Try to fetch both files with cache-busting and no-cache headers
            const fetchOptions = {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            };
            
            const [scheduleResponse, updatedResponse] = await Promise.allSettled([
                fetch(scheduleFileName, fetchOptions),
                fetch(updatedFileName, fetchOptions)
            ]);

            // Check if both files exist and loaded successfully
            const scheduleOk = scheduleResponse.status === 'fulfilled' && scheduleResponse.value.ok;
            const updatedOk = updatedResponse.status === 'fulfilled' && updatedResponse.value.ok;

            if (scheduleOk && updatedOk) {
                // Both files found - read their content
                const scheduleResponseObj = scheduleResponse.value;
                const updatedResponseObj = updatedResponse.value;
                
                const [scheduleText, updatedText] = await Promise.all([
                    scheduleResponseObj.text(),
                    updatedResponseObj.text()
                ]);

                // Parse both files
                const [scheduleData, updatedData] = await Promise.all([
                    CSVParser.parseFile(scheduleText),
                    CSVParser.parseFile(updatedText)
                ]);

                // Validate data
                const scheduleValidation = CSVParser.validateData(scheduleData);
                const updatedValidation = CSVParser.validateData(updatedData);

                if (!scheduleValidation.valid || !updatedValidation.valid) {
                    const errors = [...scheduleValidation.errors, ...updatedValidation.errors].join('\n');
                    DashboardRenderer.showError(`Data validation failed:\n${errors}`);
                    DashboardRenderer.hideLoading();
                    return false;
                }

                // Store raw data
                this.previousScheduleData = scheduleData;
                this.updatedScheduleData = updatedData;

                // Populate filters
                this._populateFilterOptions();

                // Store in localStorage for future use
                const dateKey = this._getDateKey(this.currentDate);
                this._safeStoreInLocalStorage(`scheduleData_previous_${dateKey}`, scheduleData);
                this._safeStoreInLocalStorage(`scheduleData_updated_${dateKey}`, updatedData);

                // Update UI
                this._updateFileStatus('dataFolder', dateStr);
                
                // Process and render
                this._processAndRender();
                DashboardRenderer.hideLoading();
                return true;

            } else {
                // Files not found in data folder - provide helpful message
                if (!scheduleOk && !updatedOk) {
                    // Both files missing - this is expected, will fall back to localStorage
                } else if (!scheduleOk) {
                    DashboardRenderer.showError(`Previous schedule file not found: ${scheduleFileName}`);
                    DashboardRenderer.hideLoading();
                    return false;
                } else if (!updatedOk) {
                    DashboardRenderer.showError(`Updated schedule file not found: ${updatedFileName}`);
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
        const updatedFileNameEl = document.getElementById('updatedFileName');

        if (source === 'dataFolder') {
            scheduleFileNameEl.textContent = `Schedule_${dateInfo}.csv (loaded from data folder)`;
            scheduleFileNameEl.style.color = 'var(--success-color)';
            updatedFileNameEl.textContent = `Updated_Schedule_${dateInfo}.csv (loaded from data folder)`;
            updatedFileNameEl.style.color = 'var(--success-color)';
        } else if (source === 'localStorage') {
            scheduleFileNameEl.textContent = `Schedule data (loaded from cache for ${dateInfo})`;
            scheduleFileNameEl.style.color = 'var(--text-secondary)';
            updatedFileNameEl.textContent = `Updated Schedule data (loaded from cache for ${dateInfo})`;
            updatedFileNameEl.style.color = 'var(--text-secondary)';
        } else if (source === 'uploaded') {
            scheduleFileNameEl.textContent = `Schedule_${dateInfo}.csv (uploaded)`;
            scheduleFileNameEl.style.color = 'var(--success-color)';
            updatedFileNameEl.textContent = `Updated_Schedule_${dateInfo}.csv (uploaded)`;
            updatedFileNameEl.style.color = 'var(--success-color)';
        } else if (source === 'notFound') {
            scheduleFileNameEl.textContent = 'No file found - please upload files';
            scheduleFileNameEl.style.color = 'var(--text-secondary)';
            updatedFileNameEl.textContent = 'No file found - please upload files';
            updatedFileNameEl.style.color = 'var(--text-secondary)';
        }
    },

    /**
     * Load data from uploaded files
     * @private
     */
    async _loadDataFromFiles() {
        const scheduleFile = document.getElementById('scheduleFile').files[0];
        const updatedFile = document.getElementById('updatedFile').files[0];

        if (!scheduleFile || !updatedFile) {
            DashboardRenderer.showError('Please upload both schedule files.');
            return;
        }

        DashboardRenderer.showLoading();
        DashboardRenderer.hideError();

        try {
            // Parse both files
            const [scheduleData, updatedData] = await Promise.all([
                CSVParser.parseFile(scheduleFile),
                CSVParser.parseFile(updatedFile)
            ]);

            // Validate data
            const scheduleValidation = CSVParser.validateData(scheduleData);
            const updatedValidation = CSVParser.validateData(updatedData);

            if (!scheduleValidation.valid || !updatedValidation.valid) {
                const errors = [...scheduleValidation.errors, ...updatedValidation.errors].join('\n');
                DashboardRenderer.showError(`Data validation failed:\n${errors}`);
                return;
            }

            // Store raw data
            this.previousScheduleData = scheduleData;
            this.updatedScheduleData = updatedData;
            this._populateFilterOptions();

            // Store in localStorage
            const dateKey = this._getDateKey(this.currentDate);
            this._safeStoreInLocalStorage(`scheduleData_previous_${dateKey}`, scheduleData);
            this._safeStoreInLocalStorage(`scheduleData_updated_${dateKey}`, updatedData);

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
        console.log('App: updatedScheduleData:', this.updatedScheduleData?.length || 0, 'entries');
        
        if (!this.previousScheduleData || !this.updatedScheduleData) {
            console.warn('App: Missing schedule data, cannot render');
            DashboardRenderer.showError('Please load schedule data files first.');
            return;
        }

        if (this.previousScheduleData.length === 0 || this.updatedScheduleData.length === 0) {
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
        const filteredUpdated = this._applyFilters(this.updatedScheduleData);
        console.log('App: Filtered previous entries:', filteredPrevious.length);
        console.log('App: Filtered updated entries:', filteredUpdated.length);
        if (filteredPrevious.length === 0 && filteredUpdated.length === 0 && this._hasActiveFilters()) {
            DashboardRenderer.showWarning('No records match the selected filters. Please adjust the filters to view data.');
        }

        try {
            // Process both datasets with date filtering
            // This ensures only entries that belong to the selected date (in EST/EDT) are included
            console.log('App: Processing previous schedule data...');
            this.processedPrevious = DataProcessor.processScheduleData(filteredPrevious, targetDate);
            console.log('App: Previous data processed. States found:', Object.keys(this.processedPrevious.stateTotals).length);
            console.log('App: Previous data state totals:', Object.keys(this.processedPrevious.stateTotals));
            
            console.log('App: Processing updated schedule data...');
            this.processedUpdated = DataProcessor.processScheduleData(filteredUpdated, targetDate);
            console.log('App: Updated data processed. States found:', Object.keys(this.processedUpdated.stateTotals).length);
            console.log('App: Updated data state totals:', Object.keys(this.processedUpdated.stateTotals));

            // Check if we have any data after processing
            const hasPreviousData = Object.keys(this.processedPrevious.stateTotals).length > 0;
            const hasUpdatedData = Object.keys(this.processedUpdated.stateTotals).length > 0;
            
            if (!hasPreviousData && !hasUpdatedData) {
                console.warn('App: No data found after processing. This might be due to strict date filtering.');
                console.log('App: Previous entries processed:', this.processedPrevious.metadata?.totalEntries || 0);
                console.log('App: Updated entries processed:', this.processedUpdated.metadata?.totalEntries || 0);
                
                // Try processing without date filter as fallback
                console.log('App: Attempting to process without date filter...');
                this.processedPrevious = DataProcessor.processScheduleData(filteredPrevious, null);
                this.processedUpdated = DataProcessor.processScheduleData(filteredUpdated, null);
                
                if (Object.keys(this.processedPrevious.stateTotals).length > 0 || 
                    Object.keys(this.processedUpdated.stateTotals).length > 0) {
                    console.warn('App: Data found without date filter. Date filtering may be too strict.');
                    DashboardRenderer.showWarning('Data found but may not match selected date. Showing all available data.');
                } else {
                    DashboardRenderer.showError('No schedule data found. Please check your CSV files and ensure they contain valid schedule entries.');
                    return;
                }
            }

            // Render multiple dashboards (one per visible group)
            console.log('App: Rendering dashboards...');
            DashboardRenderer.render(this.processedPrevious, this.processedUpdated);
            console.log('App: Dashboard rendering complete');
            
            // Store audit data for audit page
            this._storeAuditData();
        } catch (error) {
            console.error('App: Error processing data:', error);
            DashboardRenderer.showError(`Error processing data: ${error.message}`);
        }
    },
    
    /**
     * Store processed data for audit page
     * @private
     */
    _storeAuditData() {
        if (!this.processedPrevious || !this.processedUpdated) return;
        
        const dateKey = this._getDateKey(this.currentDate);
        
        try {
            // Store audit data with processed entries
            this._safeStoreInLocalStorage(`auditData_previous_${dateKey}`, {
                processedEntries: this.processedPrevious.processedEntries || [],
                metadata: this.processedPrevious.metadata || {},
                timestamp: new Date().toISOString()
            });
            
            this._safeStoreInLocalStorage(`auditData_updated_${dateKey}`, {
                processedEntries: this.processedUpdated.processedEntries || [],
                metadata: this.processedUpdated.metadata || {},
                timestamp: new Date().toISOString()
            });
            
            console.log('App: Audit data stored for date:', dateKey);
        } catch (e) {
            console.error('App: Error storing audit data:', e);
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
        const filtersSection = document.getElementById('filtersSection');
        if (filtersSection) {
            filtersSection.addEventListener('change', (event) => {
                const target = event.target;
                if (target && target.classList.contains('filter-checkbox')) {
                    this._handleFilterCheckboxChange(target);
                }
            });

            filtersSection.addEventListener('click', (event) => {
                const target = event.target;
                if (!target) return;

                if (target.classList.contains('filter-select-all')) {
                    event.preventDefault();
                    const filterKey = target.dataset.filterKey;
                    this._selectAllFilter(filterKey);
                } else if (target.classList.contains('filter-clear')) {
                    event.preventDefault();
                    const filterKey = target.dataset.filterKey;
                    this._clearFilter(filterKey);
                }
            });
        }

        const clearBtn = document.getElementById('clearFiltersBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this._clearFilters());
        }
    },

    /**
     * Set up dashboard visibility toggle controls
     * @private
     */
    _setupDashboardToggleControls() {
        const pillsContainer = document.getElementById('dashboardTogglePills');
        if (pillsContainer) {
            pillsContainer.addEventListener('click', (event) => {
                const target = event.target;
                if (target && target.classList.contains('dashboard-pill')) {
                    const groupName = target.dataset.groupName;
                    this._toggleDashboardVisibility(groupName);
                }
            });
        }

        const showBtn = document.getElementById('showAllDashboardsBtn');
        if (showBtn) {
            showBtn.addEventListener('click', () => this._setAllDashboardsVisibility(true));
        }

        const hideBtn = document.getElementById('hideAllDashboardsBtn');
        if (hideBtn) {
            hideBtn.addEventListener('click', () => this._setAllDashboardsVisibility(false));
        }
    },

    /**
     * Populate filter options using loaded datasets
     * @private
     */
    _populateFilterOptions() {
        if (!this.previousScheduleData || !this.updatedScheduleData) return;

        const combined = [...this.previousScheduleData, ...this.updatedScheduleData];
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

        this._renderCheckboxOptions('teams');
        this._renderCheckboxOptions('states');
        this._renderCheckboxOptions('categories');
        this._renderCheckboxOptions('groups');

        this._renderDashboardToggleBar();
    },

    /**
     * Render checkbox options for a filter key
     * @private
     */
    _renderCheckboxOptions(filterKey) {
        const containerId = this.filterContainerIds[filterKey];
        const container = document.getElementById(containerId);
        if (!container) return;

        const values = this.filterOptions[filterKey] || [];
        container.innerHTML = '';

        if (values.length === 0) {
            const emptyMsg = document.createElement('p');
            emptyMsg.className = 'filter-hint';
            emptyMsg.textContent = 'No options available for this filter.';
            container.appendChild(emptyMsg);
            return;
        }

        values.forEach(value => {
            const optionLabel = document.createElement('label');
            optionLabel.className = 'filter-option';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'filter-checkbox';
            checkbox.dataset.filterKey = filterKey;
            checkbox.value = value;
            checkbox.checked = this.filters[filterKey].has(value);

            const text = document.createElement('span');
            text.textContent = value;

            optionLabel.appendChild(checkbox);
            optionLabel.appendChild(text);
            container.appendChild(optionLabel);
        });
    },

    /**
     * Handle checkbox change events for filters
     * @private
     */
    _handleFilterCheckboxChange(checkboxEl) {
        const filterKey = checkboxEl.dataset.filterKey;
        if (!filterKey || !this.filters[filterKey]) {
            return;
        }

        const value = checkboxEl.value;
        if (checkboxEl.checked) {
            this.filters[filterKey].add(value);
        } else {
            this.filters[filterKey].delete(value);
        }

        this._processAndRender();
    },

    /**
     * Render dashboard visibility pills
     * @private
     */
    _renderDashboardToggleBar() {
        const bar = document.getElementById('dashboardToggleBar');
        const pillsContainer = document.getElementById('dashboardTogglePills');
        if (!bar || !pillsContainer) return;

        const groups = StateConfig.getAllGroups() || [];
        if (groups.length === 0) {
            bar.style.display = 'none';
            return;
        }

        const visibility = StateConfig.getDashboardVisibility();
        pillsContainer.innerHTML = '';

        groups.forEach(group => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = `dashboard-pill ${visibility[group] !== false ? 'active' : ''}`;
            pill.dataset.groupName = group;
            pill.textContent = group;
            pillsContainer.appendChild(pill);
        });

        bar.style.display = 'block';
    },

    /**
     * Toggle a specific dashboard visibility
     * @private
     */
    _toggleDashboardVisibility(groupName) {
        if (!groupName) return;
        const visibility = StateConfig.getDashboardVisibility();
        const currentlyVisible = visibility[groupName] !== false;
        StateConfig.setDashboardVisibility(groupName, !currentlyVisible);
        this._renderDashboardToggleBar();

        if (this.processedPrevious && this.processedUpdated) {
            DashboardRenderer.render(this.processedPrevious, this.processedUpdated);
        } else {
            this._processAndRender();
        }
    },

    /**
     * Set all dashboard visibility at once
     * @private
     */
    _setAllDashboardsVisibility(visible) {
        StateConfig.setAllDashboardVisibility(visible);
        this._renderDashboardToggleBar();
        if (this.processedPrevious && this.processedUpdated) {
            DashboardRenderer.render(this.processedPrevious, this.processedUpdated);
        } else {
            this._processAndRender();
        }
    },

    /**
     * Clear all filters
     * @private
     */
    _clearFilters() {
        Object.keys(this.filters).forEach(key => {
            this.filters[key] = new Set();
            this._renderCheckboxOptions(key);
        });

        this._processAndRender();
    },

    /**
     * Select all values for a filter
     * @private
     */
    _selectAllFilter(filterKey) {
        if (!filterKey || !this.filterOptions[filterKey]) return;
        this.filters[filterKey] = new Set(this.filterOptions[filterKey]);
        this._renderCheckboxOptions(filterKey);
        this._processAndRender();
    },

    /**
     * Clear a specific filter
     * @private
     */
    _clearFilter(filterKey) {
        if (!filterKey || !this.filters[filterKey]) return;
        this.filters[filterKey] = new Set();
        this._renderCheckboxOptions(filterKey);
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
    },

    /**
     * Clear old localStorage data to free up space
     * Keeps only the current date's data
     * @private
     */
    _clearOldLocalStorageData(currentDateKey) {
        const keysToKeep = new Set([
            `scheduleData_previous_${currentDateKey}`,
            `scheduleData_updated_${currentDateKey}`,
            `auditData_previous_${currentDateKey}`,
            `auditData_updated_${currentDateKey}`,
            'scheduleConfig',
            'scheduleCategories',
            'scheduleGroups',
            'dashboardVisibility',
            'dashboardOrder',
            'userPrefs'
        ]);

        // Clear all schedule and audit data except current date
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('scheduleData_') || key.startsWith('auditData_')) && !keysToKeep.has(key)) {
                localStorage.removeItem(key);
            }
        }
    },

    /**
     * Clear all localStorage data (last resort when quota is exceeded)
     * @private
     */
    _clearAllLocalStorageData() {
        const keysToKeep = new Set([
            'scheduleConfig',
            'scheduleCategories',
            'scheduleGroups',
            'dashboardVisibility',
            'dashboardOrder',
            'userPrefs'
        ]);

        // Clear all schedule and audit data, keep only config
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('scheduleData_') || key.startsWith('auditData_')) && !keysToKeep.has(key)) {
                localStorage.removeItem(key);
            }
        }
    },

    /**
     * Safely store data in localStorage with quota error handling
     * @private
     */
    _safeStoreInLocalStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                console.warn(`LocalStorage quota exceeded for key: ${key}. Clearing old data...`);
                const dateKey = this._getDateKey(this.currentDate);
                this._clearOldLocalStorageData(dateKey);
                try {
                    localStorage.setItem(key, JSON.stringify(value));
                } catch (e2) {
                    if (e2.name === 'QuotaExceededError') {
                        console.warn('Still exceeded after clearing old data. Clearing all schedule data...');
                        this._clearAllLocalStorageData();
                        try {
                            localStorage.setItem(key, JSON.stringify(value));
                        } catch (e3) {
                            console.error('Failed to store data even after clearing all:', e3);
                            DashboardRenderer.showWarning('LocalStorage is full. Data loaded but could not be cached. Please clear browser data or reload files on next visit.');
                        }
                    } else {
                        throw e2;
                    }
                }
            } else {
                throw e;
            }
        }
    }
};

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}

