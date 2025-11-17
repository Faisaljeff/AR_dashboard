/**
 * CSV Parser
 * Handles parsing of schedule CSV files using PapaParse
 */

const CSVParser = {
    /**
     * Parse a CSV file
     * @param {File|string} fileOrContent - File object or CSV content string
     * @returns {Promise<Array>} Parsed and cleaned data array
     */
    async parseFile(fileOrContent) {
        return new Promise((resolve, reject) => {
            const parseContent = (content) => {
                const config = {
                    header: false,
                    skipEmptyLines: true,
                    dynamicTyping: false,
                    complete: (results) => {
                        try {
                            const cleaned = this._cleanData(results.data);
                            resolve(cleaned);
                        } catch (error) {
                            reject(error);
                        }
                    },
                    error: (error) => {
                        reject(new Error(`CSV parsing error: ${error.message || 'Unknown error'}`));
                    }
                };

                Papa.parse(content, config);
            };

            if (fileOrContent instanceof File) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        parseContent(e.target.result);
                    } catch (error) {
                        reject(new Error(`Error reading file: ${error.message}`));
                    }
                };
                reader.onerror = () => {
                    reject(new Error('Failed to read file'));
                };
                reader.readAsText(fileOrContent);
            } else if (typeof fileOrContent === 'string') {
                parseContent(fileOrContent);
            } else {
                reject(new Error('Invalid file or content provided'));
            }
        });
    },

    /**
     * Clean and structure parsed CSV data
     * @private
     * @param {Array} rawData - Raw parsed CSV rows
     * @returns {Array} Cleaned data array
     */
    _cleanData(rawData) {
        if (!rawData || rawData.length === 0) {
            console.warn('CSVParser: No raw data provided');
            return [];
        }

        // Find header row (usually row with "Site", "Time zone", etc.)
        // Make it case-insensitive and more flexible
        let headerIndex = -1;
        const headerKeywords = ['site', 'time zone', 'timezone', 'team', 'agent', 'date', 'schedule state', 'schedulestate'];
        
        for (let i = 0; i < Math.min(15, rawData.length); i++) {
            const row = rawData[i];
            if (Array.isArray(row) && row.length > 0) {
                const firstCell = String(row[0] || '').trim().toLowerCase();
                const rowText = String(row.join(' ')).toLowerCase();
                
                // Check if first cell is "Site" (case-insensitive) or row contains header keywords
                if (firstCell === 'site' || headerKeywords.some(keyword => rowText.includes(keyword))) {
                    headerIndex = i;
                    console.log('CSVParser: Found header at row', i, 'Columns:', row.length, 'Header:', row);
                    break;
                }
            }
        }

        if (headerIndex === -1) {
            console.error('CSVParser: Could not find header row. First few rows:', rawData.slice(0, 5));
            throw new Error('Could not find header row in CSV file');
        }

        // Extract data rows (skip header and any metadata rows)
        const dataRows = rawData.slice(headerIndex + 1);
        const cleaned = [];
        console.log('CSVParser: Processing', dataRows.length, 'data rows');

        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            
            if (!Array.isArray(row)) {
                continue;
            }
            
            // Check if row has enough columns (at least 8 for required fields: Site, Timezone, Team, Agent, Date, Schedule State, Start Time, End Time)
            // Start Time and End Time are required for interval calculations
            if (row.length < 8) {
                console.log('CSVParser: Skipping row', i, '- insufficient columns (need at least 8):', row.length, 'Row:', row);
                continue;
            }

            // Extract columns according to specification (Employee ID column removed)
            // Column A: Site (index 0)
            // Column B: Time zone (index 1)
            // Column C: Team (index 2)
            // Column D: Agent (index 3)
            // Column E: Date (index 4)
            // Column F: Schedule State (index 5)
            // Column G: Start Time (index 6) - REQUIRED (rows without this are skipped)
            // Column H: End Time (index 7) - REQUIRED (rows without this are skipped)
            // Column I: Duration (index 8) - optional
            // Column J: Paid Hours (index 9) - optional
            const site = this._cleanCell(row[0] || '');
            const timezone = this._cleanCell(row[1] || '');
            const teamRaw = this._cleanCell(row[2] || '');
            const agent = this._cleanCell(row[3] || ''); // Column D (index 3)
            const date = this._cleanCell(row[4] || ''); // Column E (index 4)
            const scheduleState = this._cleanCell(row[5] || ''); // Column F (index 5)
            const startTime = this._cleanCell(row[6] || ''); // Column G (index 6) - may be empty
            const endTime = this._cleanCell(row[7] || ''); // Column H (index 7) - may be empty
            const duration = this._cleanCell(row[8] || ''); // Column I (index 8) - may be empty
            const paidHours = this._cleanCell(row[9] || ''); // Column J (index 9) - may be empty

            // Skip rows with blank Schedule State (Rule 1)
            if (!scheduleState || scheduleState.trim() === '') {
                continue;
            }

            // Skip summary rows (Rule 1)
            // Only skip if it's explicitly a summary row, not if "Total" appears in a state name
            const scheduleStateUpper = scheduleState.toUpperCase();
            if (scheduleStateUpper.includes('TOTAL FOR AGENT') || 
                scheduleStateUpper.includes('TOTAL FOR TEAM') ||
                scheduleStateUpper === 'TOTAL' ||
                scheduleStateUpper.startsWith('TOTAL ')) {
                continue;
            }

            // Extract team name (if contains "-", use part before it; otherwise use as-is)
            const team = this._extractTeamName(teamRaw);

            // Skip rows where essential data is missing
            // Agent, Date, Start Time, and End Time are all REQUIRED for calculation
            // Without Start/End Time, we cannot determine which intervals to calculate
            if (!agent || !date) {
                continue;
            }
            
            // Start Time and End Time are REQUIRED - skip rows without them
            // "Full Day" is a valid value (will be handled by data processor)
            // But empty/missing values mean we can't calculate intervals, so skip
            if (!startTime || !endTime || startTime.trim() === '' || endTime.trim() === '') {
                continue;
            }

            cleaned.push({
                site: site,
                timezone: timezone || 'UTC',
                team: team,
                agent: agent,
                date: date,
                scheduleState: scheduleState.trim(),
                startTime: startTime,
                endTime: endTime,
                duration: duration,
                paidHours: paidHours
            });
        }

        console.log('CSVParser: Successfully cleaned', cleaned.length, 'rows from', dataRows.length, 'total rows');
        return cleaned;
    },

    /**
     * Extract team name from team column
     * If team name contains "-", extract only the part before "-"
     * Otherwise, use the team name as-is
     * @private
     * @param {string} teamRaw - Raw team string
     * @returns {string} Cleaned team name
     */
    _extractTeamName(teamRaw) {
        if (!teamRaw) return '';
        
        const trimmed = teamRaw.trim();
        
        // If there's no "-" delimiter, return the team name as-is
        if (!trimmed.includes('-')) {
            return trimmed;
        }
        
        // If there's a "-", extract only the part before it
        const parts = trimmed.split('-');
        return parts[0].trim();
    },

    /**
     * Clean a cell value
     * @private
     * @param {*} cell - Cell value
     * @returns {string} Cleaned string
     */
    _cleanCell(cell) {
        if (cell === null || cell === undefined) {
            return '';
        }
        return String(cell).trim();
    },

    /**
     * Validate CSV structure
     * @param {Array} data - Parsed data
     * @returns {Object} Validation result
     */
    validateData(data) {
        const errors = [];
        const warnings = [];

        if (!data || data.length === 0) {
            errors.push('No data found in CSV file. Please check: 1) File has header row with "Site,Time zone,Team,Agent,Date,Schedule State,Start Time,End Time,Duration,Paid Hours", 2) Data rows have Schedule State values, 3) Rows have Agent, Date, Start Time, and End Time values (all required for calculation)');
            console.error('CSVParser: Validation failed - no data. This could mean:');
            console.error('  - Header row not found or incorrect');
            console.error('  - All rows were filtered out (missing required fields: Agent, Date, Start Time, End Time)');
            console.error('  - CSV structure does not match expected format');
            return { valid: false, errors, warnings };
        }

        // Check for required fields
        // Agent, Date, Schedule State, Start Time, and End Time are all REQUIRED
        data.forEach((row, index) => {
            if (!row.agent || row.agent.trim() === '') {
                warnings.push(`Row ${index + 1}: Missing agent`);
            }
            if (!row.date || row.date.trim() === '') {
                warnings.push(`Row ${index + 1}: Missing date`);
            }
            if (!row.scheduleState || row.scheduleState.trim() === '') {
                warnings.push(`Row ${index + 1}: Missing scheduleState`);
            }
            // Start Time and End Time are REQUIRED for interval calculations
            if (!row.startTime || row.startTime.trim() === '') {
                warnings.push(`Row ${index + 1}: Missing startTime (required for calculation)`);
            }
            if (!row.endTime || row.endTime.trim() === '') {
                warnings.push(`Row ${index + 1}: Missing endTime (required for calculation)`);
            }
        });

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            recordCount: data.length
        };
    }
};

