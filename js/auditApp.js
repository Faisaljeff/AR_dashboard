/**
 * Audit App Controller
 * Handles data loading, filtering, and tab switching for audit page
 */

const AuditApp = {
    currentDate: null,
    currentTab: 'previous',
    previousScheduleData: null,
    updatedScheduleData: null,
    previousData: null,
    updatedData: null,
    
    /**
     * Initialize the audit page
     */
    init() {
        // Set today's date as default
        const today = new Date();
        const dateInput = document.getElementById('auditDatePicker');
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
        const datePicker = document.getElementById('auditDatePicker');
        const prevDayBtn = document.getElementById('auditPrevDayBtn');
        const nextDayBtn = document.getElementById('auditNextDayBtn');
        const todayBtn = document.getElementById('auditTodayBtn');

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
        document.getElementById('auditRefreshDataBtn').addEventListener('click', async () => {
            await this._loadDataFromDataFolder();
        });

        // Load data button (manual upload)
        document.getElementById('auditLoadDataBtn').addEventListener('click', () => {
            this._loadDataFromFiles();
        });

        // File inputs
        document.getElementById('auditScheduleFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById('auditScheduleFileName').textContent = file.name;
            }
        });

        document.getElementById('auditUpdatedFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById('auditUpdatedFileName').textContent = file.name;
            }
        });

        // Tab switching
        document.getElementById('tabPrevious').addEventListener('click', () => {
            this._switchTab('previous');
        });
        
        document.getElementById('tabUpdated').addEventListener('click', () => {
            this._switchTab('updated');
        });
        
        // Export CSV button
        document.getElementById('exportCsvBtn').addEventListener('click', () => {
            AuditRenderer.exportToCSV();
        });
    },

    /**
     * Update date picker input
     * @private
     */
    _updateDatePicker() {
        const dateInput = document.getElementById('auditDatePicker');
        dateInput.value = this._formatDateForInput(this.currentDate);
    },

    /**
     * Format date for input field (YYYY-MM-DD)
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
     * Try to load stored data for current date
     * Priority: 1. CSV files from data folder, 2. localStorage (processed), 3. localStorage (raw), 4. Manual upload
     * @private
     */
    async _tryLoadStoredData() {
        if (!this.currentDate) return;

        // First, try to load from CSV files in data folder
        const loadedFromFiles = await this._loadDataFromDataFolder();
        if (loadedFromFiles) {
            return;
        }

        // If files not found, try localStorage (check for processed data first)
        const dateKey = this._getDateKey(this.currentDate);
        const storedPreviousProcessed = localStorage.getItem(`auditData_previous_${dateKey}`);
        const storedUpdatedProcessed = localStorage.getItem(`auditData_updated_${dateKey}`);

        if (storedPreviousProcessed && storedUpdatedProcessed) {
            try {
                this.previousData = JSON.parse(storedPreviousProcessed);
                this.updatedData = JSON.parse(storedUpdatedProcessed);
                
                // Check if processedEntries exist
                if (this.previousData && this.previousData.processedEntries && this.previousData.processedEntries.length > 0) {
                    this._updateFileStatus('localStorage', dateKey);
                    
                    // Show tabs and table
                    document.getElementById('auditTabsSection').style.display = 'block';
                    document.getElementById('auditTableSection').style.display = 'block';
                    document.getElementById('noDataSection').style.display = 'none';
                    
                    // Render initial data
                    this._switchTab('previous');
                    return;
                }
            } catch (e) {
                console.error('Error loading processed data:', e);
            }
        }

        // Try loading raw data from localStorage and process it
        const storedPrevious = localStorage.getItem(`scheduleData_previous_${dateKey}`);
        const storedUpdated = localStorage.getItem(`scheduleData_updated_${dateKey}`);

        if (storedPrevious && storedUpdated) {
            try {
                this.previousScheduleData = JSON.parse(storedPrevious);
                this.updatedScheduleData = JSON.parse(storedUpdated);
                this._updateFileStatus('localStorage', dateKey);
                this._processAndRender();
            } catch (e) {
                console.error('Error loading stored data:', e);
                this._showError('Error loading stored data: ' + e.message);
            }
        } else {
            // No data found - show message
            this._updateFileStatus('notFound', dateKey);
            this._showNoData();
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
        this.previousData = null;
        this.updatedData = null;

        // Add cache-busting query parameter to force fresh fetch
        const cacheBuster = `?t=${Date.now()}`;
        const scheduleFileName = `data/Schedule_${dateStr}.csv${cacheBuster}`;
        const updatedFileName = `data/Updated_Schedule_${dateStr}.csv${cacheBuster}`;

        this._showLoading();
        this._hideError();

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
                    this._showError(`Data validation failed:\n${errors}`);
                    this._hideLoading();
                    return false;
                }

                // Store raw data
                this.previousScheduleData = scheduleData;
                this.updatedScheduleData = updatedData;

                console.log('Loaded from data folder:');
                console.log('Previous schedule entries:', scheduleData.length);
                console.log('Updated schedule entries:', updatedData.length);
                if (scheduleData.length > 0) {
                    console.log('First previous entry:', scheduleData[0]);
                }
                if (updatedData.length > 0) {
                    console.log('First updated entry:', updatedData[0]);
                }

                // Store in localStorage for future use
                const dateKey = this._getDateKey(this.currentDate);
                this._safeStoreInLocalStorage(`scheduleData_previous_${dateKey}`, scheduleData);
                this._safeStoreInLocalStorage(`scheduleData_updated_${dateKey}`, updatedData);

                // Update UI (use dateStr without cache-busting parameter)
                this._updateFileStatus('dataFolder', dateStr);
                
                // Process and render
                this._processAndRender();
                this._hideLoading();
                return true;

            } else {
                // Files not found in data folder
                if (!scheduleOk && !updatedOk) {
                    // Both files missing - this is expected, will fall back to localStorage
                } else if (!scheduleOk) {
                    this._showError(`Previous schedule file not found: ${scheduleFileName}`);
                    this._hideLoading();
                    return false;
                } else if (!updatedOk) {
                    this._showError(`Updated schedule file not found: ${updatedFileName}`);
                    this._hideLoading();
                    return false;
                }
                this._hideLoading();
                return false;
            }

        } catch (error) {
            console.error('Error loading files from data folder:', error);
            this._showError('Error loading files: ' + error.message);
            this._hideLoading();
            return false;
        }
    },

    /**
     * Load data from uploaded files
     * @private
     */
    async _loadDataFromFiles() {
        const scheduleFile = document.getElementById('auditScheduleFile').files[0];
        const updatedFile = document.getElementById('auditUpdatedFile').files[0];

        if (!scheduleFile || !updatedFile) {
            this._showError('Please upload both schedule files.');
            return;
        }

        this._showLoading();
        this._hideError();

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
                this._showError(`Data validation failed:\n${errors}`);
                return;
            }

            // Store raw data
            this.previousScheduleData = scheduleData;
            this.updatedScheduleData = updatedData;

            console.log('Loaded from manual upload:');
            console.log('Previous schedule entries:', scheduleData.length);
            console.log('Updated schedule entries:', updatedData.length);
            if (scheduleData.length > 0) {
                console.log('First previous entry:', scheduleData[0]);
            }
            if (updatedData.length > 0) {
                console.log('First updated entry:', updatedData[0]);
            }

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
            this._showError(`Error loading files: ${error.message}`);
        } finally {
            this._hideLoading();
        }
    },

    /**
     * Update file status in UI
     * @private
     */
    _updateFileStatus(source, dateInfo) {
        const scheduleFileNameEl = document.getElementById('auditScheduleFileName');
        const updatedFileNameEl = document.getElementById('auditUpdatedFileName');

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
     * Process data and render audit table
     * @private
     */
    _processAndRender() {
        if (!this.previousScheduleData || !this.updatedScheduleData) {
            this._showError('Please load schedule data files first.');
            return;
        }

        if (this.previousScheduleData.length === 0 || this.updatedScheduleData.length === 0) {
            this._showError('Schedule data files are empty. Please check your CSV files.');
            return;
        }

        // For audit page, we want to show ALL entries regardless of date
        // Pass null to disable date filtering - this allows us to see all parsed data
        const targetDate = null;

        try {
            // Process both datasets WITHOUT date filtering (show all entries)
            this.previousData = DataProcessor.processScheduleData(this.previousScheduleData, targetDate);
            this.updatedData = DataProcessor.processScheduleData(this.updatedScheduleData, targetDate);

            console.log('Processed previous data:', this.previousData);
            console.log('Processed updated data:', this.updatedData);
            console.log('Previous processedEntries count:', this.previousData?.processedEntries?.length || 0);
            console.log('Updated processedEntries count:', this.updatedData?.processedEntries?.length || 0);
            console.log('Previous raw data count:', this.previousScheduleData?.length || 0);
            console.log('Updated raw data count:', this.updatedScheduleData?.length || 0);
            
            // Debug: Show first few entries if available
            if (this.previousData?.processedEntries?.length > 0) {
                console.log('First processed entry (previous):', this.previousData.processedEntries[0]);
            }
            if (this.updatedData?.processedEntries?.length > 0) {
                console.log('First processed entry (updated):', this.updatedData.processedEntries[0]);
            }

            // Store processed data in localStorage for audit page
            const dateKey = this._getDateKey(this.currentDate);
            this._safeStoreInLocalStorage(`auditData_previous_${dateKey}`, this.previousData);
            this._safeStoreInLocalStorage(`auditData_updated_${dateKey}`, this.updatedData);

            // Show tabs and table
            document.getElementById('auditTabsSection').style.display = 'block';
            document.getElementById('auditTableSection').style.display = 'block';
            document.getElementById('noDataSection').style.display = 'none';

            // Render initial data (show all data, no filters)
            this._switchTab('previous');

        } catch (error) {
            console.error('Error processing data:', error);
            this._showError(`Error processing data: ${error.message}`);
        }
    },
    
    /**
     * Switch between Previous and Updated tabs
     * @private
     */
    _switchTab(tabName) {
        this.currentTab = tabName;
        
        // Update tab buttons
        document.querySelectorAll('.audit-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById(`tab${tabName === 'previous' ? 'Previous' : 'Updated'}`).classList.add('active');
        
        // Get data for current tab
        const data = tabName === 'previous' ? this.previousData : this.updatedData;
        
        if (data && data.processedEntries && data.processedEntries.length > 0) {
            console.log(`Rendering ${data.processedEntries.length} entries for ${tabName} tab`);
            // Show all data - no filters
            AuditRenderer.render(data.processedEntries);
        } else {
            console.warn(`No processed entries found for ${tabName} tab. Data:`, data);
            AuditRenderer.render([]);
        }
    },

    /**
     * Show loading state
     * @private
     */
    _showLoading() {
        document.getElementById('auditLoadingSection').style.display = 'block';
        document.getElementById('auditErrorSection').style.display = 'none';
        document.getElementById('auditTabsSection').style.display = 'none';
        document.getElementById('auditTableSection').style.display = 'none';
        document.getElementById('noDataSection').style.display = 'none';
    },

    /**
     * Hide loading state
     * @private
     */
    _hideLoading() {
        document.getElementById('auditLoadingSection').style.display = 'none';
    },

    /**
     * Show error message
     * @private
     */
    _showError(message) {
        document.getElementById('auditErrorMessage').textContent = message;
        document.getElementById('auditErrorSection').style.display = 'block';
        document.getElementById('auditLoadingSection').style.display = 'none';
        document.getElementById('auditTabsSection').style.display = 'none';
        document.getElementById('auditTableSection').style.display = 'none';
        document.getElementById('noDataSection').style.display = 'none';
    },

    /**
     * Hide error message
     * @private
     */
    _hideError() {
        document.getElementById('auditErrorSection').style.display = 'none';
    },

    /**
     * Show no data message
     * @private
     */
    _showNoData() {
        document.getElementById('noDataSection').style.display = 'block';
        document.getElementById('auditTabsSection').style.display = 'none';
        document.getElementById('auditTableSection').style.display = 'none';
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
