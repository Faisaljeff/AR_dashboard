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
    selectedStates: [],

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
        // Date picker
        document.getElementById('datePicker').addEventListener('change', async (e) => {
            this.currentDate = new Date(e.target.value);
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
        if (!this.previousScheduleData || !this.ariseScheduleData) {
            return;
        }

        // Process both datasets
        this.processedPrevious = DataProcessor.processScheduleData(this.previousScheduleData);
        this.processedArise = DataProcessor.processScheduleData(this.ariseScheduleData);

        // Get all unique states
        const allStates = new Set([
            ...Object.keys(this.processedPrevious.stateTotals),
            ...Object.keys(this.processedArise.stateTotals)
        ]);

        // Render state filters
        DashboardRenderer.renderStateFilters(
            Array.from(allStates),
            this.selectedStates,
            (e) => this._onStateFilterChange(e)
        );

        // Render dashboard
        const statesToShow = this.selectedStates.length > 0 
            ? this.selectedStates 
            : null;
        DashboardRenderer.render(this.processedPrevious, this.processedArise, statesToShow);
    },

    /**
     * Handle state filter change
     * @private
     */
    _onStateFilterChange(e) {
        const checkboxes = document.querySelectorAll('#stateFilters input[type="checkbox"]');
        this.selectedStates = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        // Re-render dashboard with filtered states
        if (this.processedPrevious && this.processedArise) {
            DashboardRenderer.render(
                this.processedPrevious,
                this.processedArise,
                this.selectedStates.length > 0 ? this.selectedStates : null
            );
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

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}

