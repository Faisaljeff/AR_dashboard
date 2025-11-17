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
     * Note: This is a simplified version. For production, consider using a library like date-fns-tz
     * @param {string} timezone - IANA timezone string (e.g., "America/New_York")
     * @param {Date} date - Date to get offset for
     * @returns {number} Offset in minutes
     */
    getTimezoneOffset(timezone, date = new Date()) {
        // For now, we'll use a simplified approach
        // In production, you might want to use a proper timezone library
        try {
            const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
            const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
            return (tzDate - utcDate) / (1000 * 60);
        } catch (e) {
            console.warn(`Invalid timezone: ${timezone}, using local timezone`);
            return -date.getTimezoneOffset();
        }
    },

    /**
     * Convert time from one timezone to another (simplified)
     * For this dashboard, we'll primarily work with the timezone from the CSV
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

