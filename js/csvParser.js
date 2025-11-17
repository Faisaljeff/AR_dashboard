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
            return [];
        }

        // Find header row (usually row with "Site", "Time zone", etc.)
        let headerIndex = -1;
        const headerKeywords = ['Site', 'Time zone', 'Team', 'Agent', 'Date', 'Schedule State'];
        
        for (let i = 0; i < Math.min(10, rawData.length); i++) {
            const row = rawData[i];
            if (Array.isArray(row) && row.length > 0) {
                const firstCell = String(row[0] || '').trim();
                if (firstCell === 'Site' || headerKeywords.some(keyword => 
                    String(row.join('')).includes(keyword))) {
                    headerIndex = i;
                    break;
                }
            }
        }

        if (headerIndex === -1) {
            throw new Error('Could not find header row in CSV file');
        }

        // Extract data rows (skip header and any metadata rows)
        const dataRows = rawData.slice(headerIndex + 1);
        const cleaned = [];

        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            
            if (!Array.isArray(row) || row.length < 10) {
                continue;
            }

            // Extract columns according to specification
            const site = this._cleanCell(row[0]);
            const timezone = this._cleanCell(row[1]);
            const teamRaw = this._cleanCell(row[2]);
            const agent = this._cleanCell(row[4]); // Column E (index 4)
            const date = this._cleanCell(row[5]); // Column F (index 5)
            const scheduleState = this._cleanCell(row[6]); // Column G (index 6)
            const startTime = this._cleanCell(row[7]); // Column H (index 7)
            const endTime = this._cleanCell(row[8]); // Column I (index 8)
            const duration = this._cleanCell(row[9]); // Column J (index 9)
            const paidHours = this._cleanCell(row[10]); // Column K (index 10)

            // Skip rows with blank Schedule State (Rule 1)
            if (!scheduleState || scheduleState.trim() === '') {
                continue;
            }

            // Skip summary rows (Rule 1)
            if (scheduleState.includes('Total for Agent') || 
                scheduleState.includes('Total for Team') ||
                scheduleState.includes('Total')) {
                continue;
            }

            // Extract team name (remove everything after "-")
            const team = this._extractTeamName(teamRaw);

            // Skip rows where essential data is missing
            if (!agent || !date || !startTime || !endTime) {
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

        return cleaned;
    },

    /**
     * Extract team name from team column (remove everything after "-")
     * @private
     * @param {string} teamRaw - Raw team string
     * @returns {string} Cleaned team name
     */
    _extractTeamName(teamRaw) {
        if (!teamRaw) return '';
        
        const parts = teamRaw.split('-');
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
            errors.push('No data found in CSV file');
            return { valid: false, errors, warnings };
        }

        // Check for required fields
        const requiredFields = ['agent', 'date', 'scheduleState', 'startTime', 'endTime'];
        data.forEach((row, index) => {
            requiredFields.forEach(field => {
                if (!row[field] || row[field].trim() === '') {
                    warnings.push(`Row ${index + 1}: Missing ${field}`);
                }
            });
        });

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            recordCount: data.length
        };
    }
};

