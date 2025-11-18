/**
 * Date and Time Utilities
 * Handles timezone conversion, time parsing, and interval generation
 */

const DateUtils = {
    /**
     * Parse time string in format "12:30:00 AM" or "4:00 PM" to minutes since midnight
     * @param {string} timeStr - Time string in various formats
     * @returns {number} Minutes since midnight (0-1439)
     */
    parseTimeToMinutes(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') {
            return null;
        }
        
        const trimmed = timeStr.trim();
        if (trimmed === '' || trimmed.toUpperCase() === 'FULL DAY') {
            return null;
        }

        // Remove extra spaces and normalize
        let time = trimmed.toUpperCase();
        
        // Handle formats like "12:30:00 AM" or "4:00 PM" or "1:30 PM" or "12:30 PM"
        // Also handle formats without seconds: "4:00 PM"
        const timePattern = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i;
        const match = time.match(timePattern);
        
        if (!match) {
            // Try alternative format without colon (e.g., "400 PM" -> "4:00 PM")
            const altPattern = /(\d{1,4})\s*(AM|PM)/i;
            const altMatch = time.match(altPattern);
            if (altMatch) {
                let timeNum = parseInt(altMatch[1], 10);
                const period = altMatch[2].toUpperCase();
                let hours = Math.floor(timeNum / 100);
                const minutes = timeNum % 100;
                
                if (period === 'PM' && hours !== 12) {
                    hours += 12;
                } else if (period === 'AM' && hours === 12) {
                    hours = 0;
                }
                
                return hours * 60 + minutes;
            }
            return null;
        }

        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const period = match[4].toUpperCase();

        // Convert to 24-hour format
        if (period === 'PM' && hours !== 12) {
            hours += 12;
        } else if (period === 'AM' && hours === 12) {
            hours = 0;
        }

        return hours * 60 + minutes;
    },

    /**
     * Parse time string and detect indicators (like "+" for next-day)
     * @param {string} timeStr - Raw time string that may include indicators
     * @returns {{ minutes: number|null, isNextDay: boolean, dayOffset: number }}
     */
    parseTimeWithNextDayIndicator(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') {
            return {
                minutes: null,
                isNextDay: false,
                dayOffset: 0
            };
        }

        let normalized = timeStr.trim();
        let isNextDay = false;

        // Detect leading "+" (e.g., "+ 02:00 AM" or "+02:00 AM")
        if (normalized.startsWith('+')) {
            isNextDay = true;
            normalized = normalized.replace(/^\+\s*/, '');
        }

        // Detect trailing "+" (e.g., "02:00 AM +" or "02:00 AM+")
        if (normalized.endsWith('+')) {
            isNextDay = true;
            normalized = normalized.replace(/\s*\+$/, '');
        }

        // Clean up any remaining lone "+" characters around the time
        normalized = normalized.replace(/^\+\s*/, '').replace(/\s*\+$/, '').trim();

        const minutes = this.parseTimeToMinutes(normalized);
        return {
            minutes,
            isNextDay,
            dayOffset: isNextDay ? 1 : 0
        };
    },

    /**
     * Convert minutes since midnight to time string
     * @param {number} minutes - Minutes since midnight
     * @returns {string} Time string in "HH:MM AM/PM" format
     */
    minutesToTimeString(minutes) {
        if (minutes === null || minutes === undefined) {
            return '';
        }

        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);

        return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
    },

    /**
     * Format minutes to duration string (e.g., "2:30" for 2 hours 30 minutes)
     * @param {number} minutes - Total minutes
     * @returns {string} Duration string
     */
    formatDuration(minutes) {
        if (minutes === null || minutes === undefined || minutes === 0) {
            return '0:00';
        }

        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}:${mins.toString().padStart(2, '0')}`;
    },

    /**
     * Generate all 30-minute intervals for a day
     * @returns {Array} Array of interval objects with start and end minutes
     */
    generateIntervals() {
        const intervals = [];
        for (let i = 0; i < 48; i++) {
            const startMinutes = i * 30;
            const endMinutes = startMinutes + 30;
            intervals.push({
                index: i,
                startMinutes: startMinutes,
                endMinutes: endMinutes,
                label: this.minutesToTimeString(startMinutes)
            });
        }
        return intervals;
    },

    /**
     * Check if a time range overlaps with an interval
     * @param {number} startMinutes - Start time in minutes
     * @param {number} endMinutes - End time in minutes
     * @param {number} intervalStart - Interval start in minutes
     * @param {number} intervalEnd - Interval end in minutes
     * @returns {boolean} True if overlaps
     */
    overlapsInterval(startMinutes, endMinutes, intervalStart, intervalEnd) {
        if (startMinutes === null || endMinutes === null) {
            return false;
        }
        // Handle cases where end time might be next day (e.g., 23:30 to 00:30)
        if (endMinutes < startMinutes) {
            endMinutes += 1440; // Add 24 hours
        }
        return startMinutes < intervalEnd && endMinutes > intervalStart;
    },

    /**
     * Calculate overlap duration between a time range and an interval
     * @param {number} startMinutes - Start time in minutes
     * @param {number} endMinutes - End time in minutes
     * @param {number} intervalStart - Interval start in minutes
     * @param {number} intervalEnd - Interval end in minutes
     * @returns {number} Overlap duration in minutes
     */
    calculateOverlap(startMinutes, endMinutes, intervalStart, intervalEnd) {
        if (!this.overlapsInterval(startMinutes, endMinutes, intervalStart, intervalEnd)) {
            return 0;
        }

        // Handle next-day scenarios
        if (endMinutes < startMinutes) {
            endMinutes += 1440;
        }

        const overlapStart = Math.max(startMinutes, intervalStart);
        const overlapEnd = Math.min(endMinutes, intervalEnd);
        
        return Math.max(0, overlapEnd - overlapStart);
    },

    /**
     * Parse date string in MM/DD/YYYY format
     * @param {string} dateStr - Date string
     * @returns {Date|null} Parsed date or null
     */
    parseDate(dateStr) {
        if (!dateStr) return null;
        
        const parts = dateStr.split('/');
        if (parts.length !== 3) return null;
        
        const month = parseInt(parts[0], 10) - 1; // Month is 0-indexed
        const day = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);
        
        // Handle 2-digit years (assume 2000-2099)
        if (year < 100) {
            year += 2000;
        }
        
        return new Date(year, month, day);
    },

    /**
     * Add days to a date (returns a new Date)
     * @param {Date} date - Base date
     * @param {number} days - Number of days to add (can be negative)
     * @returns {Date|null} New date or null if base date invalid
     */
    addDays(date, days = 0) {
        if (!(date instanceof Date) || isNaN(date.getTime())) {
            return null;
        }
        const result = new Date(date);
        result.setDate(result.getDate() + (Number.isFinite(days) ? days : 0));
        return result;
    },

    /**
     * Format date to MM/DD/YYYY
     * @param {Date} date - Date object
     * @returns {string} Formatted date string
     */
    formatDate(date) {
        if (!date) return '';
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    },

    /**
     * Format date to MMDDYYYY for filename
     * @param {Date} date - Date object
     * @returns {string} Formatted date string (MMDDYYYY)
     */
    formatDateForFilename(date) {
        if (!date) return '';
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${month}${day}${year}`;
    },

    /**
     * Get timezone offset in minutes for a given timezone
     * Properly handles DST using JavaScript's Intl API
     * @param {string} timezone - IANA timezone string (e.g., "America/New_York")
     * @param {Date} date - Date to get offset for (important for DST)
     * @returns {number} Offset in minutes from UTC (negative for behind UTC, positive for ahead)
     */
    getTimezoneOffset(timezone, date = new Date()) {
        try {
            // Use Intl.DateTimeFormat to get timezone offset parts
            // This is the most reliable way to get DST-aware offsets
            const formatter = new Intl.DateTimeFormat('en', {
                timeZone: timezone,
                timeZoneName: 'longOffset'
            });
            
            const parts = formatter.formatToParts(date);
            const offsetPart = parts.find(part => part.type === 'timeZoneName');
            
            if (offsetPart && offsetPart.value) {
                // Parse offset string like "GMT-5" or "GMT+5:30" or "GMT-05:00"
                const offsetStr = offsetPart.value.replace('GMT', '').trim();
                const match = offsetStr.match(/^([+-])(\d{1,2}):?(\d{2})?$/);
                
                if (match) {
                    const sign = match[1] === '-' ? -1 : 1;
                    const hours = parseInt(match[2], 10);
                    const minutes = parseInt(match[3] || '0', 10);
                    return sign * (hours * 60 + minutes);
                }
            }
            
            // Fallback: Calculate offset by comparing UTC and timezone times
            // Create a date at noon UTC to avoid day boundary issues
            const testDate = new Date(Date.UTC(
                date.getUTCFullYear(),
                date.getUTCMonth(),
                date.getUTCDate(),
                12, 0, 0, 0
            ));
            
            // Get what noon UTC is in the target timezone
            const tzFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            
            const utcFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'UTC',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            
            const utcParts = utcFormatter.formatToParts(testDate);
            const tzParts = tzFormatter.formatToParts(testDate);
            
            const getTime = (parts) => {
                const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
                const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
                return hour * 60 + minute;
            };
            
            const utcTime = getTime(utcParts);
            const tzTime = getTime(tzParts);
            
            // Calculate offset (tzTime - utcTime)
            // If tzTime is less, it means the timezone is behind UTC
            let offset = tzTime - utcTime;
            
            // Handle day rollover (shouldn't happen at noon, but just in case)
            if (offset < -720) offset += 1440;
            if (offset > 720) offset -= 1440;
            
            return offset;
        } catch (e) {
            console.warn(`Invalid timezone: ${timezone}, using fallback method`, e);
            // Final fallback: Use a known date and calculate manually
            try {
                // Use a known date (2024-01-01) to calculate offset
                const knownDate = new Date('2024-01-01T12:00:00Z');
                const utcTime = 12 * 60; // Noon UTC = 720 minutes
                
                const tzTimeStr = knownDate.toLocaleString('en-US', {
                    timeZone: timezone,
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
                
                const [tzHours, tzMins] = tzTimeStr.split(':').map(Number);
                const tzTime = tzHours * 60 + tzMins;
                
                return tzTime - utcTime;
            } catch (e2) {
                console.warn(`Fallback also failed, using local timezone offset`);
                return -date.getTimezoneOffset();
            }
        }
    },

    /**
     * Convert time from IST (Asia/Kolkata) to EST/EDT (America/New_York)
     * Properly handles DST by using actual date/time objects
     * Only converts if source is Asia/Kolkata, otherwise returns as-is
     * @param {number} minutes - Minutes since midnight in source timezone
     * @param {string} sourceTz - Source timezone (should be "Asia/Kolkata" or "America/New_York")
     * @param {string} dateStr - Date string in MM/DD/YYYY format
     * @returns {Object} {minutes: number, date: Date} - Minutes since midnight in EST/EDT and the date in EST/EDT
     */
    convertToESTWithDate(minutes, sourceTz, dateStr) {
        const TARGET_TZ = 'America/New_York';
        const SOURCE_TZ = 'Asia/Kolkata';
        
        // Normalize timezone names
        const normalizedSourceTz = this.normalizeTimezone(sourceTz);
        
        // If already in EST/EDT, return same time and date
        if (normalizedSourceTz === TARGET_TZ) {
            const date = this.parseDate(dateStr);
            return {
                minutes: minutes,
                date: date || new Date()
            };
        }
        
        // Only convert if source is Asia/Kolkata (IST)
        // If it's neither, default to no conversion (treat as EST)
        if (normalizedSourceTz !== SOURCE_TZ) {
            console.warn(`Unexpected timezone: "${sourceTz}" (normalized: "${normalizedSourceTz}"). Treating as EST/EDT.`);
            const date = this.parseDate(dateStr);
            return {
                minutes: minutes,
                date: date || new Date()
            };
        }

        try {
            // Parse the date
            const sourceDate = this.parseDate(dateStr);
            if (!sourceDate) {
                console.warn(`Could not parse date: ${dateStr}, using today`);
                return {
                    minutes: minutes,
                    date: new Date()
                };
            }

            // Convert from IST (Asia/Kolkata) to EST/EDT (America/New_York)
            // IST is UTC+5:30, EST is UTC-5 (winter) or UTC-4 (EDT, summer)
            // So IST is 9.5 hours ahead of EST or 10.5 hours ahead of EDT
            
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            const year = sourceDate.getFullYear();
            const month = sourceDate.getMonth();
            const day = sourceDate.getDate();
            
            // IST is UTC+5:30, so convert IST time to UTC first
            // Subtract 5.5 hours (330 minutes) from IST to get UTC
            let utcHours = hours;
            let utcMinutes = mins;
            utcMinutes -= 330; // Subtract 5.5 hours (330 minutes)
            
            // Handle minute rollover
            while (utcMinutes < 0) {
                utcMinutes += 60;
                utcHours -= 1;
            }
            while (utcMinutes >= 60) {
                utcMinutes -= 60;
                utcHours += 1;
            }
            
            // Handle hour rollover
            while (utcHours < 0) {
                utcHours += 24;
            }
            while (utcHours >= 24) {
                utcHours -= 24;
            }
            
            // Create UTC date
            let utcDate = new Date(Date.UTC(year, month, day, utcHours, utcMinutes, 0, 0));
            
            // Now convert UTC to EST/EDT using Intl.DateTimeFormat
            // This automatically handles DST based on the date
            const targetFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: TARGET_TZ,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            
            // Helper to extract minutes and date from formatted parts
            const getTimeAndDateFromParts = (parts) => {
                const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
                const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
                const year = parseInt(parts.find(p => p.type === 'year').value, 10);
                const month = parseInt(parts.find(p => p.type === 'month').value, 10) - 1; // Month is 0-indexed
                const day = parseInt(parts.find(p => p.type === 'day').value, 10);
                return {
                    minutes: hour * 60 + minute,
                    date: new Date(year, month, day)
                };
            };
            
            // Get the EST/EDT time and date for this UTC moment
            const targetParts = targetFormatter.formatToParts(utcDate);
            const targetTimeData = getTimeAndDateFromParts(targetParts);
            let converted = targetTimeData.minutes;
            
            // Handle day rollover
            if (converted < 0) {
                converted += 1440;
            } else if (converted >= 1440) {
                converted -= 1440;
            }
            
            // Clamp to valid range
            converted = Math.max(0, Math.min(1439, Math.round(converted)));
            
            return {
                minutes: converted,
                date: targetTimeData.date
            };
        } catch (e) {
            console.error(`Error converting IST to EST/EDT:`, e);
            // Fallback: use fixed offset (IST is 9.5 hours ahead of EST, 10.5 ahead of EDT)
            // For simplicity, use 9.5 hours (570 minutes) - this is approximate
            // DST handling in fallback is approximate
            try {
                const date = this.parseDate(dateStr) || new Date();
                // Check if date is in DST period (roughly March-November in US)
                const month = date.getMonth(); // 0-11
                const isDST = month >= 2 && month <= 10; // March (2) to November (10)
                const offsetMinutes = isDST ? 630 : 570; // 10.5 hours (EDT) or 9.5 hours (EST)
                
                let converted = minutes - offsetMinutes;
                if (converted < 0) converted += 1440;
                if (converted >= 1440) converted -= 1440;
                converted = Math.max(0, Math.min(1439, Math.round(converted)));
                
                return {
                    minutes: converted,
                    date: date
                };
            } catch (e2) {
                console.error(`Fallback conversion also failed:`, e2);
                const date = this.parseDate(dateStr) || new Date();
                return {
                    minutes: minutes,
                    date: date
                };
            }
        }
    },

    /**
     * Convert time from one timezone to EST/EDT (America/New_York)
     * Properly handles DST by using actual date/time objects
     * @param {number} minutes - Minutes since midnight in source timezone
     * @param {string} sourceTz - Source timezone (e.g., "Asia/Kolkata", "America/New_York")
     * @param {string} dateStr - Date string in MM/DD/YYYY format
     * @returns {number} Minutes since midnight in EST/EDT (America/New_York)
     * @deprecated Use convertToESTWithDate for date-aware conversion
     */
    convertToEST(minutes, sourceTz, dateStr) {
        // Use the new date-aware conversion and return just minutes for backward compatibility
        const result = this.convertToESTWithDate(minutes, sourceTz, dateStr);
        return result.minutes;
    },

    /**
     * Normalize timezone name - only handles "America_New_York" and "Asia/Kolkata"
     * @param {string} tz - Timezone string
     * @returns {string} Normalized timezone: "America/New_York" or "Asia/Kolkata"
     */
    normalizeTimezone(tz) {
        if (!tz) {
            console.warn('Timezone is empty, defaulting to America/New_York');
            return 'America/New_York';
        }
        
        let normalized = tz.trim();
        
        // Replace underscores with slashes (e.g., "America_New_York" -> "America/New_York")
        normalized = normalized.replace(/_/g, '/');
        
        // Convert to uppercase for comparison
        const upperNormalized = normalized.toUpperCase();
        
        // Check for America/New_York (EST/EDT) - case insensitive
        if (upperNormalized === 'AMERICA/NEW_YORK' || 
            upperNormalized === 'AMERICA/NEWYORK' ||
            upperNormalized === 'EST' ||
            upperNormalized === 'EDT' ||
            upperNormalized === 'EASTERN') {
            return 'America/New_York';
        }
        
        // Check for Asia/Kolkata (IST) - case insensitive
        if (upperNormalized === 'ASIA/KOLKATA' ||
            upperNormalized === 'ASIA/CALCUTTA' ||
            upperNormalized === 'IST' ||
            upperNormalized === 'INDIAN STANDARD TIME') {
            return 'Asia/Kolkata';
        }
        
        // If we can't identify it, default to America/New_York and log a warning
        console.warn(`Unknown timezone: "${tz}", normalized to: "${normalized}". Defaulting to America/New_York.`);
        return 'America/New_York';
    },

    /**
     * Convert time from one timezone to another (legacy method, kept for compatibility)
     * @param {number} minutes - Minutes since midnight in source timezone
     * @param {string} sourceTz - Source timezone
     * @param {string} targetTz - Target timezone
     * @param {Date} date - Reference date
     * @returns {number} Minutes since midnight in target timezone
     */
    convertTimezone(minutes, sourceTz, targetTz, date = new Date()) {
        if (sourceTz === targetTz) return minutes;
        
        const sourceOffset = this.getTimezoneOffset(sourceTz, date);
        const targetOffset = this.getTimezoneOffset(targetTz, date);
        const offsetDiff = targetOffset - sourceOffset;
        
        let converted = minutes + offsetDiff;
        
        // Handle day rollover
        if (converted < 0) {
            converted += 1440;
        } else if (converted >= 1440) {
            converted -= 1440;
        }
        
        return converted;
    }
};

