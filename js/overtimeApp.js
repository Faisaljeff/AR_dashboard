/**
 * Overtime Tracking Application
 * Handles parsing CSV files (without agent column), filtering for overtime,
 * timezone conversion, and generating site-wise totals table
 */

const OvertimeApp = {
    sites: [
        'CSN Gurgaon US',
        'CSN HBS US',
        'CSN Manila US',
        'CSN Phoenix US'
    ],
    usCnsSites: ['CSN HBS US', 'CSN Phoenix US'], // Sites to sum for US CSN column
    requirements: {}, // Store manual requirement inputs: { 'YYYY-MM-DD': { 'site': value } }
    processedData: null,

    init() {
        this._setupEventListeners();
        this._loadRequirements();
    },

    _setupEventListeners() {
        const fileInput = document.getElementById('scheduleFileInput');
        const processBtn = document.getElementById('processFileBtn');
        const clearBtn = document.getElementById('clearDataBtn');

        if (processBtn) {
            processBtn.addEventListener('click', () => this._handleFileProcess());
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    console.log('File selected:', e.target.files[0].name);
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this._clearData());
        }
    },

    async _handleFileProcess() {
        const fileInput = document.getElementById('scheduleFileInput');
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            this._showError('Please select a CSV file to process.');
            return;
        }

        const file = fileInput.files[0];
        this._showLoading(true);
        this._hideError();
        this._hideInfo();

        try {
            const data = await this._parseCSVFile(file);
            const processed = this._processOvertimeData(data);
            this.processedData = processed;
            this._renderTable(processed);
            this._showLoading(false);
        } catch (error) {
            console.error('Error processing file:', error);
            this._showError(`Error processing file: ${error.message}`);
            this._showLoading(false);
        }
    },

    async _parseCSVFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    Papa.parse(e.target.result, {
                        header: false,
                        skipEmptyLines: true,
                        complete: (results) => {
                            const cleaned = this._cleanCSVData(results.data);
                            resolve(cleaned);
                        },
                        error: (error) => {
                            reject(new Error(`CSV parsing error: ${error.message}`));
                        }
                    });
                } catch (error) {
                    reject(new Error(`Error reading file: ${error.message}`));
                }
            };
            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };
            reader.readAsText(file);
        });
    },

    _cleanCSVData(rawData) {
        if (!rawData || rawData.length === 0) {
            return [];
        }

        // Find header row
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(10, rawData.length); i++) {
            const row = rawData[i];
            if (Array.isArray(row) && row.length > 0) {
                const firstCell = String(row[0] || '').trim().toLowerCase();
                if (firstCell === 'site') {
                    headerRowIndex = i;
                    break;
                }
            }
        }

        if (headerRowIndex === -1) {
            throw new Error('Could not find header row with "Site" column');
        }

        const dataRows = rawData.slice(headerRowIndex + 1);
        const cleaned = [];

        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            
            if (!Array.isArray(row) || row.length < 8) {
                continue;
            }

            // CSV structure (without agent column):
            // Column 0: Site
            // Column 1: Time zone
            // Column 2: Team
            // Column 3: Date
            // Column 4: Schedule State
            // Column 5: Start Time
            // Column 6: End Time
            // Column 7: Duration
            // Column 8: Paid Hours (optional)

            const site = this._cleanCell(row[0] || '');
            const timezone = this._cleanCell(row[1] || '');
            const team = this._cleanCell(row[2] || '');
            const date = this._cleanCell(row[3] || '');
            const scheduleState = this._cleanCell(row[4] || '');
            const startTime = this._cleanCell(row[5] || '');
            const endTime = this._cleanCell(row[6] || '');
            const duration = this._cleanCell(row[7] || '');

            // Skip rows without essential data
            if (!site || !date || !scheduleState) {
                continue;
            }

            // Only process entries from the specified sites
            const siteTrimmed = site.trim();
            if (!this.sites.includes(siteTrimmed)) {
                continue;
            }

            // Skip summary rows
            if (scheduleState.toLowerCase().includes('total') || 
                scheduleState.toLowerCase().includes('agent') ||
                scheduleState.toLowerCase().includes('team')) {
                continue;
            }

            // Only process "overtime" schedule state (case-insensitive, handle variations)
            const stateLower = scheduleState.toLowerCase().trim();
            if (!stateLower.includes('overtime') && stateLower !== 'ot') {
                if (i < 30) { // Log first 30 skipped entries for debugging
                    console.log(`[CSV Parse] Skipping row ${i}: schedule state "${scheduleState}" is not overtime`);
                }
                continue;
            }
            
            // Log early morning entries for debugging
            if (startTime && (startTime.toLowerCase().includes('am') && parseInt(startTime) < 6)) {
                console.log(`[CSV Parse] Found early morning entry: Site=${site}, Date=${date}, Start Time=${startTime}, Timezone=${timezone}`);
            }

            // Parse duration
            const durationMinutes = this._parseDurationToMinutes(duration);
            if (durationMinutes === null || durationMinutes === 0) {
                continue;
            }

            // Parse date
            const parsedDate = this._parseDate(date);
            if (!parsedDate) {
                console.warn(`Could not parse date: ${date}`);
                continue;
            }

            cleaned.push({
                site: site.trim(),
                timezone: timezone.trim(),
                team: team.trim(),
                date: parsedDate,
                scheduleState: scheduleState.trim(),
                startTime: startTime.trim(),
                endTime: endTime.trim(),
                duration: duration.trim(),
                durationMinutes: durationMinutes,
                dateStr: date // Keep original date string for conversion
            });
        }

        console.log(`Parsed ${cleaned.length} overtime entries from CSV`);
        console.log(`Sample entries:`, cleaned.slice(0, 3).map(e => ({
            site: e.site,
            date: e.dateStr,
            startTime: e.startTime,
            timezone: e.timezone,
            duration: e.duration
        })));
        return cleaned;
    },

    _cleanCell(cell) {
        if (cell === null || cell === undefined) {
            return '';
        }
        return String(cell).trim();
    },

    _parseDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') {
            return null;
        }

        // Try MM/DD/YY or MM/DD/YYYY format
        const datePattern = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;
        const match = dateStr.match(datePattern);
        
        if (match) {
            let month = parseInt(match[1], 10) - 1; // 0-indexed
            let day = parseInt(match[2], 10);
            let year = parseInt(match[3], 10);
            
            // Handle 2-digit year
            if (year < 100) {
                year += 2000;
            }
            
            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) {
                return date;
            }
        }
        
        return null;
    },

    _parseDurationToMinutes(durationStr) {
        if (!durationStr || typeof durationStr !== 'string') {
            return null;
        }

        const trimmed = durationStr.trim();
        if (!trimmed) {
            return null;
        }

        // Try format "HH:MM" or "HH:MM:SS"
        const durationPattern = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;
        const match = trimmed.match(durationPattern);
        
        if (match) {
            const hours = parseInt(match[1], 10) || 0;
            const minutes = parseInt(match[2], 10) || 0;
            const seconds = parseInt(match[3] || '0', 10) || 0;
            
            return hours * 60 + minutes + Math.round(seconds / 60);
        }
        
        return null;
    },

    _processOvertimeData(data) {
        // Group by site and date, sum durations
        const grouped = {};

        for (const entry of data) {
            // Convert the entry's start time to EST to determine which EST date it falls on
            const estDate = this._convertToESTDate(entry.date, entry.startTime, entry.timezone, entry.dateStr);
            const dateKey = this._formatDateKey(estDate);
            const site = entry.site;

            // Debug logging for ALL entries to see what's happening
            const originalDateStr = entry.dateStr || this._formatDateKey(entry.date);
            const estDateStr = this._formatDateKey(estDate);
            console.log(`[Overtime] Entry: Site=${site}, Original Date=${originalDateStr}, Start Time=${entry.startTime}, Timezone=${entry.timezone}, EST Date=${estDateStr}, Duration=${entry.durationMinutes}min`);

            if (!grouped[dateKey]) {
                grouped[dateKey] = {};
            }

            if (!grouped[dateKey][site]) {
                grouped[dateKey][site] = 0;
            }

            grouped[dateKey][site] += entry.durationMinutes;
        }

        return grouped;
    },

    _convertToESTDate(date, startTime, timezone, dateStr) {
        // Convert the entry's start time from source timezone to EST
        // This determines which EST date the entry should be counted on
        
        const normalizedTz = DateUtils.normalizeTimezone(timezone);
        
        // If already in EST, return the date as-is
        if (normalizedTz === 'America/New_York') {
            return date;
        }
        
        // Parse the start time to get minutes since midnight
        const startMinutes = DateUtils.parseTimeToMinutes(startTime);
        if (startMinutes === null) {
            // If we can't parse start time, fall back to converting date at midnight
            const year = date.getFullYear();
            const month = date.getMonth();
            const day = date.getDate();
            const fallbackDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const estConversion = DateUtils.convertToESTWithDate(0, normalizedTz, fallbackDateStr);
            if (estConversion && estConversion.date) {
                return estConversion.date;
            }
            return date;
        }
        
        // Create date string in format YYYY-MM-DD
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        const formattedDateStr = dateStr || `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // Use the existing convertToESTWithDate function which should handle this correctly
        // But we need to verify the date it returns is correct for the converted time
        const estConversion = DateUtils.convertToESTWithDate(startMinutes, normalizedTz, formattedDateStr);
        
        if (estConversion && estConversion.date) {
            // The date from convertToESTWithDate should be correct
            // But let's verify by checking if the time suggests a day change
            const estMinutes = estConversion.minutes;
            const estDate = estConversion.date;
            
            // If the converted time is very early (before 6 AM) or very late (after 10 PM),
            // and the source was early morning, we might have crossed a day boundary
            // But the date from convertToESTWithDate should already account for this
            
            // For debugging: log the conversion details
            if (startMinutes < 300) { // Before 5 AM
                console.log(`[TZ Debug] Early morning conversion: ${startTime} (${startMinutes}min) in ${normalizedTz} on ${formattedDateStr} -> EST time: ${estMinutes}min, EST date: ${this._formatDateKey(estDate)}`);
            }
            
            return estDate;
        }
        
        console.warn(`convertToESTWithDate returned no date for ${startTime} on ${formattedDateStr}`);
        return date;
        
        // Fallback: return original date
        return date;
    },

    _formatDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    _renderTable(data) {
        const container = document.getElementById('tableContainer');
        const content = document.getElementById('tableContent');
        
        if (!container || !content) {
            return;
        }

        // Generate date range: yesterday, today, next 5 days (7 days total)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const dates = [];
        for (let i = -1; i < 6; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() + i);
            dates.push(date);
        }

        // Build table
        let html = '<table class="overtime-table">';
        
        // Header row
        html += '<thead><tr>';
        html += '<th class="date-header">Date</th>';
        this.sites.forEach(site => {
            html += `<th>${site}</th>`;
        });
        html += '<th>US CSN</th>';
        html += '<th>Requirement</th>';
        html += '<th>% Delivered</th>';
        html += '</tr></thead>';
        
        // Data rows
        html += '<tbody>';
        
        let grandTotal = {
            sites: {},
            usCns: 0
        };
        
        dates.forEach(date => {
            const dateKey = this._formatDateKey(date);
            const dateStr = this._formatDateDisplay(date);
            const isToday = dateKey === this._formatDateKey(today);
            
            html += '<tr>';
            html += `<td class="date-header" style="font-weight: 600; ${isToday ? 'background: #e3f2fd;' : ''}">${dateStr}${isToday ? ' (Today)' : ''}</td>`;
            
            let rowTotal = 0;
            let usCnsTotal = 0;
            
            // Site columns
            this.sites.forEach(site => {
                const minutes = data[dateKey]?.[site] || 0;
                const hours = (minutes / 60).toFixed(2);
                html += `<td class="site-column">${hours}</td>`;
                rowTotal += minutes;
                
                if (this.usCnsSites.includes(site)) {
                    usCnsTotal += minutes;
                }
                
                // Track grand total
                if (!grandTotal.sites[site]) {
                    grandTotal.sites[site] = 0;
                }
                grandTotal.sites[site] += minutes;
            });
            
            // US CSN column
            const usCnsHours = (usCnsTotal / 60).toFixed(2);
            html += `<td class="site-column" style="font-weight: 600;">${usCnsHours}</td>`;
            grandTotal.usCns += usCnsTotal;
            
            // Requirement column (editable)
            const reqKey = `${dateKey}`;
            const currentReq = this.requirements[reqKey] || {};
            const reqValue = currentReq.total || '';
            html += `<td><input type="number" class="requirement-input" data-date="${dateKey}" step="0.01" min="0" value="${reqValue}" placeholder="0.00" /></td>`;
            
            // % Delivered column
            const requirement = parseFloat(reqValue) || 0;
            const delivered = rowTotal / 60; // Convert minutes to hours
            let percentage = 0;
            if (requirement > 0) {
                percentage = ((delivered / requirement) * 100).toFixed(1);
            }
            const percentageClass = percentage >= 100 ? 'positive' : (percentage >= 80 ? '' : 'negative');
            html += `<td class="percentage-cell ${percentageClass}">${percentage}%</td>`;
            
            html += '</tr>';
        });
        
        // Grand total row
        html += '<tr class="total-row">';
        html += '<td><strong>Total</strong></td>';
        this.sites.forEach(site => {
            const totalHours = ((grandTotal.sites[site] || 0) / 60).toFixed(2);
            html += `<td><strong>${totalHours}</strong></td>`;
        });
        const usCnsTotalHours = (grandTotal.usCns / 60).toFixed(2);
        html += `<td><strong>${usCnsTotalHours}</strong></td>`;
        html += '<td></td>'; // Requirement column
        html += '<td></td>'; // % Delivered column
        html += '</tr>';
        
        html += '</tbody></table>';
        
        content.innerHTML = html;
        container.style.display = 'block';
        
        // Add event listeners to requirement inputs
        const requirementInputs = content.querySelectorAll('.requirement-input');
        requirementInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const dateKey = e.target.getAttribute('data-date');
                const value = parseFloat(e.target.value) || 0;
                
                if (!this.requirements[dateKey]) {
                    this.requirements[dateKey] = {};
                }
                this.requirements[dateKey].total = value;
                
                this._saveRequirements();
                this._updatePercentageRow(e.target);
            });
        });
    },

    _updatePercentageRow(input) {
        const row = input.closest('tr');
        if (!row) return;
        
        const dateKey = input.getAttribute('data-date');
        const requirement = parseFloat(input.value) || 0;
        
        // Calculate delivered from site columns
        const siteCells = row.querySelectorAll('.site-column');
        let delivered = 0;
        siteCells.forEach(cell => {
            const hours = parseFloat(cell.textContent) || 0;
            delivered += hours;
        });
        
        // Update percentage cell
        const percentageCell = row.querySelector('.percentage-cell');
        if (percentageCell) {
            let percentage = 0;
            if (requirement > 0) {
                percentage = ((delivered / requirement) * 100).toFixed(1);
            }
            const percentageClass = percentage >= 100 ? 'positive' : (percentage >= 80 ? '' : 'negative');
            percentageCell.className = `percentage-cell ${percentageClass}`;
            percentageCell.textContent = `${percentage}%`;
        }
    },

    _formatDateDisplay(date) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        const dayName = days[date.getDay()];
        const month = months[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();
        
        return `${dayName}, ${month} ${day}, ${year}`;
    },

    _showLoading(show) {
        const loadingMsg = document.getElementById('loadingMessage');
        if (loadingMsg) {
            loadingMsg.style.display = show ? 'block' : 'none';
        }
    },

    _showError(message) {
        const container = document.getElementById('errorContainer');
        if (container) {
            container.innerHTML = `<div class="error-message">${message}</div>`;
        }
    },

    _hideError() {
        const container = document.getElementById('errorContainer');
        if (container) {
            container.innerHTML = '';
        }
    },

    _showInfo(message) {
        const container = document.getElementById('infoContainer');
        if (container) {
            container.innerHTML = `<div class="info-message">${message}</div>`;
        }
    },

    _hideInfo() {
        const container = document.getElementById('infoContainer');
        if (container) {
            container.innerHTML = '';
        }
    },

    _clearData() {
        this.processedData = null;
        const container = document.getElementById('tableContainer');
        if (container) {
            container.style.display = 'none';
        }
        const fileInput = document.getElementById('scheduleFileInput');
        if (fileInput) {
            fileInput.value = '';
        }
        this._hideError();
        this._hideInfo();
    },

    _saveRequirements() {
        try {
            localStorage.setItem('overtimeRequirements', JSON.stringify(this.requirements));
        } catch (error) {
            console.error('Error saving requirements:', error);
        }
    },

    _loadRequirements() {
        try {
            const saved = localStorage.getItem('overtimeRequirements');
            if (saved) {
                this.requirements = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Error loading requirements:', error);
            this.requirements = {};
        }
    }
};

// Initialize on page load
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        OvertimeApp.init();
    });
}

