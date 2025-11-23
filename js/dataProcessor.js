/**
 * Data Processor
 * Transforms parsed CSV data into interval-based analytics
 */

const DataProcessor = {
    /**
     * Process schedule data into interval-based format
     * @param {Array} scheduleData - Parsed schedule data from CSV
     * @param {Date} targetDate - Target date in EST/EDT to filter entries (only include entries that fall on this date after conversion)
     * @returns {Object} Processed data with interval calculations
     */
    processScheduleData(scheduleData, targetDate = null) {
        if (!scheduleData || scheduleData.length === 0) {
            console.log('DataProcessor: No schedule data provided');
            return this._createEmptyResult();
        }

        console.log(`DataProcessor: Processing ${scheduleData.length} entries, target date:`, targetDate);

        const intervals = DateUtils.generateIntervals();
        const stateMap = new Map(); // Map to track state totals
        const processedEntries = []; // Array to store processed entry metadata for audit
        const intervalData = intervals.map(interval => {
            const stateData = new Map();
            return {
                interval: interval,
                states: stateData
            };
        });

        // Normalize target date for comparison (set to midnight EST/EDT)
        let targetDateEST = null;
        if (targetDate) {
            // Create a date object for the target date at midnight in EST/EDT
            const year = targetDate.getFullYear();
            const month = targetDate.getMonth();
            const day = targetDate.getDate();
            // We'll compare dates by year, month, day
            targetDateEST = { year, month, day };
        }

        // First pass: Identify agents who have "Day Off" with "Full Day" for the target date
        // These agents should be excluded from all other schedule states
        const agentsWithDayOff = new Set();
        const dayOffStates = new Set(['Day Off', 'Time Off', 'DayOff', 'TimeOff']); // Common variations
        
        scheduleData.forEach((entry) => {
            const stateName = StateConfig.findMatchingState(entry.scheduleState);
            const isFullDay = (entry.startTime && entry.startTime.trim().toUpperCase() === 'FULL DAY') ||
                             (entry.endTime && entry.endTime.trim().toUpperCase() === 'FULL DAY');
            
            // Check if this is a day off state
            const isDayOffState = dayOffStates.has(stateName) || 
                                 stateName.toLowerCase().includes('day off') ||
                                 stateName.toLowerCase().includes('time off');
            
            if (isDayOffState && isFullDay) {
                // Check if this entry falls on the target date
                // For day off entries, we need to check if they fall on the target date
                // after timezone conversion (if applicable)
                const entryDate = DateUtils.parseDate(entry.date);
                let shouldInclude = true;
                
                if (targetDateEST && entryDate) {
                    // For "Full Day" entries, we need to check if the date (after timezone conversion)
                    // matches the target date. Since it's a full day, we'll check the entry date
                    // and also consider timezone conversion if needed
                    const sourceTimezone = entry.timezone || 'UTC';
                    const normalizedTz = DateUtils.normalizeTimezone(sourceTimezone);
                    
                    // If not in EST/EDT, we need to check what date this full day becomes in EST/EDT
                    if (normalizedTz !== 'America/New_York') {
                        // For a full day entry, check what date it becomes in EST/EDT
                        // We'll use the start of the day (00:00) to check
                        const startConversion = DateUtils.convertToESTWithDate(0, normalizedTz, DateUtils.formatDate(entryDate));
                        if (startConversion && startConversion.date) {
                            const estDate = startConversion.date;
                            shouldInclude = estDate.getFullYear() === targetDateEST.year &&
                                           estDate.getMonth() === targetDateEST.month &&
                                           estDate.getDate() === targetDateEST.day;
                        }
                    } else {
                        // Already in EST/EDT, just check the entry date
                        shouldInclude = entryDate.getFullYear() === targetDateEST.year &&
                                       entryDate.getMonth() === targetDateEST.month &&
                                       entryDate.getDate() === targetDateEST.day;
                    }
                } else if (!targetDateEST) {
                    // No target date filter, include all day off entries
                    shouldInclude = true;
                }
                
                if (shouldInclude) {
                    agentsWithDayOff.add(entry.agent);
                }
            }
        });
        
        if (agentsWithDayOff.size > 0) {
            console.log(`DataProcessor: Found ${agentsWithDayOff.size} agents with Day Off (Full Day):`, Array.from(agentsWithDayOff));
        }

        // Process each schedule entry
        let processedCount = 0;
        let skippedCount = 0;
        scheduleData.forEach((entry, index) => {
            // Find matching state name (handles variations like "break- 10 minutes" → "Break")
            const stateName = StateConfig.findMatchingState(entry.scheduleState);
            
            // Check if this agent has a Day Off (Full Day) - if so, exclude from all other states
            const isDayOffState = dayOffStates.has(stateName) || 
                                 stateName.toLowerCase().includes('day off') ||
                                 stateName.toLowerCase().includes('time off');
            
            // If agent has day off and this is NOT a day off state, skip this entry
            if (agentsWithDayOff.has(entry.agent) && !isDayOffState) {
                skippedCount++;
                if (index < 5) {
                    console.log(`DataProcessor: Skipping entry ${index} - agent ${entry.agent} has Day Off (Full Day):`, entry);
                }
                return; // Skip this entry
            }
            
            const startParsed = DateUtils.parseTimeWithDayOffset(entry.startTime);
            const endParsed = DateUtils.parseTimeWithDayOffset(entry.endTime);
            let startMinutes = startParsed.minutes;
            let endMinutes = endParsed.minutes;
            const startDayOffset = startParsed.dayOffset || 0;
            const endDayOffset = endParsed.dayOffset || 0;
            
            // Handle "Full Day" entries - they span the entire day (00:00 to 23:59)
            if (entry.startTime && entry.startTime.trim().toUpperCase() === 'FULL DAY' ||
                entry.endTime && entry.endTime.trim().toUpperCase() === 'FULL DAY') {
                startMinutes = 0; // Start of day
                endMinutes = 1439; // End of day (23:59)
            }

            if (startMinutes === null || endMinutes === null) {
                // Skip entries where we can't determine time range
                skippedCount++;
                if (index < 5) {
                    console.log(`DataProcessor: Skipping entry ${index} - invalid time range:`, entry);
                }
                return;
            }

            // Convert times to EST/EDT (America/New_York) if needed
            // Dashboard always displays in EST/EDT timezone
            // This conversion properly handles DST (Daylight Saving Time)
            // AND returns the date in EST/EDT after conversion
            const sourceTimezone = entry.timezone || 'UTC';
            const normalizedTz = DateUtils.normalizeTimezone(sourceTimezone);
            const entryDateBase = DateUtils.parseDate(entry.date) || new Date();
            const startSourceDate = DateUtils.addDays(entryDateBase, startDayOffset);
            const endSourceDate = DateUtils.addDays(entryDateBase, endDayOffset);
            const startDateStr = DateUtils.formatDate(startSourceDate);
            const endDateStr = DateUtils.formatDate(endSourceDate);
            
            let startDateEST, endDateEST;
            
            try {
                if (normalizedTz !== 'America/New_York') {
                    // Convert to EST/EDT (handles DST automatically and returns date)
                    // Use normalized timezone for conversion (handles underscores, aliases, etc.)
                    const startConversion = DateUtils.convertToESTWithDate(startMinutes, normalizedTz, startDateStr);
                    const endConversion = DateUtils.convertToESTWithDate(endMinutes, normalizedTz, endDateStr);
                    
                    // Validate conversion results
                    if (!startConversion || !endConversion || 
                        typeof startConversion.minutes !== 'number' || 
                        typeof endConversion.minutes !== 'number' ||
                        !startConversion.date || !endConversion.date) {
                        console.warn(`Invalid timezone conversion result for entry:`, entry);
                        // Fallback: use original times and dates
                        startDateEST = startSourceDate;
                        endDateEST = endSourceDate;
                    } else {
                        startMinutes = startConversion.minutes;
                        endMinutes = endConversion.minutes;
                        startDateEST = startConversion.date;
                        endDateEST = endConversion.date;
                    }
                } else {
                    // Already in EST/EDT, use the adjusted dates
                    startDateEST = startSourceDate;
                    endDateEST = endSourceDate;
                }
            } catch (error) {
                console.error(`Error converting timezone "${sourceTimezone}" (normalized: "${normalizedTz}") for entry:`, entry, error);
                // Fallback: use original times and assume date matches entry date (plus offsets)
                startDateEST = startSourceDate;
                endDateEST = endSourceDate;
            }

            // Filter by target date if specified
            // Only include entries that overlap with the target date in EST/EDT
            // This is critical: after timezone conversion, the date might change
            // Example: 11:30 PM IST on Nov 15 becomes Nov 16 in EST
            if (targetDateEST) {
                // Helper to check if a date matches the target date
                const dateMatches = (date) => {
                    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
                        return false;
                    }
                    return date.getFullYear() === targetDateEST.year &&
                           date.getMonth() === targetDateEST.month &&
                           date.getDate() === targetDateEST.day;
                };
                
                // Also check the original entry date from CSV
                const entryDate = DateUtils.parseDate(entry.date);
                const entryDateMatches = entryDate && dateMatches(entryDate);
                
                const startDateMatch = dateMatches(startDateEST);
                const endDateMatch = dateMatches(endDateEST);
                
                // Include entry if:
                // 1. Original entry date matches target date, OR
                // 2. Start date (after conversion) matches target date, OR
                // 3. End date (after conversion) matches target date, OR
                // 4. Entry overlaps with any part of the target date
                if (!entryDateMatches && !startDateMatch && !endDateMatch) {
                    // Check if entry overlaps with the target date
                    const targetDateStart = new Date(targetDateEST.year, targetDateEST.month, targetDateEST.day, 0, 0, 0, 0);
                    const targetDateEnd = new Date(targetDateEST.year, targetDateEST.month, targetDateEST.day, 23, 59, 59, 999);
                    
                    // Create full datetime objects for comparison
                    // Use the converted dates and times
                    const startDateTime = new Date(startDateEST);
                    if (!isNaN(startDateTime.getTime())) {
                        startDateTime.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
                    } else {
                        // Fallback: use target date with converted time
                        startDateTime.setTime(targetDateStart.getTime());
                        startDateTime.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
                    }
                    
                    const endDateTime = new Date(endDateEST);
                    if (!isNaN(endDateTime.getTime())) {
                        endDateTime.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
                    } else {
                        // Fallback: use target date with converted time
                        endDateTime.setTime(targetDateStart.getTime());
                        endDateTime.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
                    }
                    
                    // If end is before start, it's next day
                    if (endMinutes < startMinutes) {
                        endDateTime.setDate(endDateTime.getDate() + 1);
                    }
                    
                    // Check if entry overlaps with target date
                    // Entry overlaps if:
                    // - It starts before target date ends AND ends after target date starts
                    const overlaps = startDateTime <= targetDateEnd && endDateTime >= targetDateStart;
                    
                    if (!overlaps) {
                        // Entry doesn't overlap with target date, skip it
                        skippedCount++;
                        if (index < 5) {
                            console.log(`DataProcessor: Skipping entry ${index} - doesn't overlap target date:`, {
                                entryDate: entry.date,
                                timezone: entry.timezone,
                                normalizedTz: normalizedTz,
                                startDateEST: startDateEST,
                                endDateEST: endDateEST,
                                startDateTime: startDateTime,
                                endDateTime: endDateTime,
                                targetDate: targetDateEST,
                                targetDateStart: targetDateStart,
                                targetDateEnd: targetDateEnd
                            });
                        }
                        return;
                    }
                }
            }

            // Clamp times to target date boundaries if filtering by date
            // This ensures we only count the portion of entries that fall within the selected date
            let clampedStartMinutes = startMinutes;
            let clampedEndMinutes = endMinutes;
            
            if (targetDateEST) {
                // Helper to check if a date matches target
                const dateMatches = (date) => {
                    return date.getFullYear() === targetDateEST.year &&
                           date.getMonth() === targetDateEST.month &&
                           date.getDate() === targetDateEST.day;
                };
                
                // Clamp start time to target date boundaries
                if (!dateMatches(startDateEST)) {
                    // Start is before target date, clamp to 00:00
                    clampedStartMinutes = 0;
                }
                
                // Clamp end time to target date boundaries
                if (!dateMatches(endDateEST)) {
                    // End is after target date, clamp to 23:59
                    clampedEndMinutes = 1439;
                } else if (endMinutes < startMinutes && dateMatches(startDateEST)) {
                    // End is next day but start is on target date
                    clampedEndMinutes = 1439;
                }
            }

            // ------------------------------------------------------------------
            // DURATION CALCULATION STRATEGY
            //
            // IMPORTANT: The CSV Duration column is the source of truth.
            //  - We only use times / timezones to decide WHERE the duration
            //    falls on the EST timeline (which day, which intervals).
            //  - We DO NOT recompute the "amount" of duration from EST times
            //    except as a sanity check.
            //
            // Steps:
            //  1) Build EST Date objects for start and end.
            //  2) Compute the full EST span in minutes (spanMinutesEST).
            //  3) Parse CSV duration into minutes (csvDurationMinutes).
            //  4) For this specific target date, compute how many EST minutes
            //     of the span fall on that date (dayOverlapMinutes).
            //  5) Allocate a proportional share of csvDurationMinutes to this
            //     day and its 30‑minute intervals:
            //        scale = csvDurationMinutes / spanMinutesEST
            //        contributionForDay = dayOverlapMinutes * scale
            // ------------------------------------------------------------------

            // 1) Build EST Date objects from converted minutes
            const startDateTime = new Date(startDateEST);
            startDateTime.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
            
            const endDateTime = new Date(endDateEST);
            endDateTime.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
            
            // If end time is earlier than or equal to start time on the same date,
            // treat it as next day (span that crosses midnight).
            if (endDateTime.getTime() <= startDateTime.getTime()) {
                endDateTime.setDate(endDateTime.getDate() + 1);
            }
            
            // 2) Full EST span in minutes
            const fullSpanMs = endDateTime.getTime() - startDateTime.getTime();
            let spanMinutesEST = Math.round(fullSpanMs / (1000 * 60));
            if (!Number.isFinite(spanMinutesEST) || spanMinutesEST <= 0) {
                // Fallback: treat as at least 1 minute to avoid division by zero
                spanMinutesEST = 1;
            }

            // 3) Parse CSV duration into minutes (source of truth)
            let csvDurationMinutes = null;
            if (entry.duration && typeof entry.duration === 'string') {
                const durationStr = entry.duration.trim();
                if (durationStr) {
                    // Expect formats like "H:MM", "HH:MM", "275:50", optionally with seconds "H:MM:SS"
                    const durationMatch = durationStr.match(/^(-?\d+):(\d{2})(?::(\d{2}))?$/);
                    if (durationMatch) {
                        const hours = parseInt(durationMatch[1], 10) || 0;
                        const mins = parseInt(durationMatch[2], 10) || 0;
                        const secs = parseInt(durationMatch[3] || '0', 10) || 0;
                        csvDurationMinutes = hours * 60 + mins + Math.round(secs / 60);
                    }
                }
            }

            // If CSV duration is missing or unparsable, fall back to EST span
            if (csvDurationMinutes === null) {
                csvDurationMinutes = spanMinutesEST;
            }

            // 4) For state totals on this target date, use clamped times to get
            //    how many EST minutes of this span overlap the selected day.
            let actualEndMinutes = clampedEndMinutes;
            if (clampedEndMinutes < clampedStartMinutes) {
                actualEndMinutes = clampedEndMinutes + 1440; // Add 24 hours
            }
            const dayOverlapMinutes = Math.max(0, actualEndMinutes - clampedStartMinutes);

            // Calculate allocation scale: CSV minutes per EST minute of span
            // This is needed for both state totals and interval allocation
            const allocationScale = spanMinutesEST > 0 ? csvDurationMinutes / spanMinutesEST : 0;

            // CRITICAL FIX: Use CSV duration directly when row falls entirely on target date
            // Only use proportional allocation when row spans multiple days
            let durationForTotals;
            
            // Check if row was clamped (meaning it spans beyond the target date)
            const wasClamped = (clampedStartMinutes !== startMinutes || clampedEndMinutes !== endMinutes);
            
            if (!wasClamped && targetDateEST) {
                // Row falls entirely on target date - use CSV duration directly (no allocation needed)
                durationForTotals = csvDurationMinutes;
            } else if (!targetDateEST) {
                // No date filter (audit page) - use CSV duration directly
                durationForTotals = csvDurationMinutes;
            } else {
                // Row spans multiple days - use proportional allocation
                durationForTotals = Math.round(dayOverlapMinutes * allocationScale);
            }
            
            // Create entry metadata for audit page
            const entryMetadata = {
                // Original CSV data
                site: entry.site || '',
                team: entry.team || '',
                agent: entry.agent || '',
                date: entry.date || '',
                scheduleState: entry.scheduleState || '',
                normalizedState: stateName,
                startTime: entry.startTime || '',
                endTime: entry.endTime || '',
                duration: entry.duration || '', // Original CSV duration string
                paidHours: entry.paidHours || '',
                timezone: entry.timezone || '',
                normalizedTimezone: normalizedTz,
                
                // Source duration (from CSV - this is the truth)
                durationSourceMinutes: csvDurationMinutes,
                
                // EST/EDT converted values
                // For display, use actual EST times (not clamped)
                startESTMinutes: startMinutes,
                endESTMinutes: endMinutes,
                startESTDate: DateUtils.formatDate(startDateEST),
                startESTTime: DateUtils.minutesToTimeString(startMinutes),
                endESTDate: DateUtils.formatDate(endDateEST),
                endESTTime: DateUtils.minutesToTimeString(endMinutes),
                
                // Calculated EST duration
                // NOTE: Duration does NOT change with timezone, so this should
                //       always match durationSourceMinutes when CSV is correct.
                durationESTMinutes: csvDurationMinutes,
                
                // Comparison: difference between EST span and CSV duration.
                // This surfaces data issues without affecting totals.
                durationDifference: spanMinutesEST - csvDurationMinutes,
                
                // Processing flags
                wasClamped: clampedStartMinutes !== startMinutes || clampedEndMinutes !== endMinutes,
                wasTimezoneConverted: normalizedTz !== 'America/New_York',
                dayOffsetApplied: startDayOffset !== 0 || endDayOffset !== 0,
                originalStartMinutes: startMinutes,
                originalEndMinutes: endMinutes
            };
            
            // Add to processed entries array
            processedEntries.push(entryMetadata);
            
            if (!stateMap.has(stateName)) {
                stateMap.set(stateName, {
                    totalDuration: 0,
                    totalAgents: new Set(),
                    totalCount: 0
                });
            }
            const stateStats = stateMap.get(stateName);
            stateStats.totalDuration += durationForTotals;
            stateStats.totalAgents.add(entry.agent);
            stateStats.totalCount += 1;

            // Calculate which intervals this entry overlaps
            // Use clamped times to ensure we only count overlap within the target date
            intervals.forEach((interval, index) => {
                // Calculate overlap using clamped times
                // This gives us how many EST minutes of this entry fall into the interval
                const overlap = DateUtils.calculateOverlap(
                    clampedStartMinutes,
                    actualEndMinutes,
                    interval.startMinutes,
                    interval.endMinutes
                );

                    if (overlap > 0) {
                    // Additional check: if we have a target date, verify the interval date matches
                    // Since intervals are always for the selected date, we just need to ensure
                    // the entry's time range (after conversion) overlaps with the day
                    const intervalEntry = intervalData[index];
                    if (!intervalEntry.states.has(stateName)) {
                        intervalEntry.states.set(stateName, {
                            totalDuration: 0,
                            agentSet: new Set()
                        });
                    }

                    const stateEntry = intervalEntry.states.get(stateName);
                    // Allocate a proportional share of the CSV duration to this interval
                    stateEntry.totalDuration += overlap * allocationScale;
                    stateEntry.agentSet.add(entry.agent);
                }
            });
        });
        
        console.log(`DataProcessor: Processed ${processedCount} entries, skipped ${skippedCount} entries`);
        console.log(`DataProcessor: State totals found:`, Array.from(stateMap.keys()));
        console.log(`DataProcessor: Total unique states:`, stateMap.size);

        // Convert Maps to plain objects for serialization
        const processedIntervals = intervalData.map(item => {
            const states = {};
            item.states.forEach((value, key) => {
                states[key] = {
                    totalDuration: value.totalDuration,
                    agentCount: value.agentSet.size,
                    agents: Array.from(value.agentSet)
                };
            });
            return {
                interval: item.interval,
                states: states
            };
        });

        // Convert state totals
        const stateTotals = {};
        stateMap.forEach((value, key) => {
            stateTotals[key] = {
                totalDuration: value.totalDuration,
                totalAgents: value.totalAgents.size,
                totalCount: value.totalCount
            };
        });

        return {
            intervals: processedIntervals,
            stateTotals: stateTotals,
            processedEntries: processedEntries, // Metadata for audit page
            metadata: {
                totalEntries: scheduleData.length,
                processedEntries: processedCount,
                skippedEntries: skippedCount,
                uniqueAgents: new Set(scheduleData.map(e => e.agent)).size,
                uniqueStates: Array.from(stateMap.keys()),
                dateRange: this._getDateRange(scheduleData)
            }
        };
    },

    /**
     * Create empty result structure
     * @private
     */
    _createEmptyResult() {
        const intervals = DateUtils.generateIntervals();
        return {
            intervals: intervals.map(interval => ({
                interval: interval,
                states: {}
            })),
            stateTotals: {},
            metadata: {
                totalEntries: 0,
                uniqueAgents: 0,
                uniqueStates: [],
                dateRange: null
            }
        };
    },

    /**
     * Get date range from schedule data
     * @private
     */
    _getDateRange(scheduleData) {
        if (!scheduleData || scheduleData.length === 0) {
            return null;
        }

        const dates = scheduleData
            .map(e => DateUtils.parseDate(e.date))
            .filter(d => d !== null)
            .sort((a, b) => a - b);

        if (dates.length === 0) {
            return null;
        }

        return {
            start: dates[0],
            end: dates[dates.length - 1]
        };
    },

    /**
     * Filter processed data by state names
     * @param {Object} processedData - Processed schedule data
     * @param {Array} stateNames - Array of state names to include
     * @returns {Object} Filtered processed data
     */
    filterByStates(processedData, stateNames) {
        if (!stateNames || stateNames.length === 0) {
            return processedData;
        }

        const stateSet = new Set(stateNames.map(s => s.toLowerCase()));

        const filteredIntervals = processedData.intervals.map(item => {
            const filteredStates = {};
            Object.keys(item.states).forEach(stateName => {
                if (stateSet.has(stateName.toLowerCase())) {
                    filteredStates[stateName] = item.states[stateName];
                }
            });
            return {
                interval: item.interval,
                states: filteredStates
            };
        });

        const filteredTotals = {};
        Object.keys(processedData.stateTotals).forEach(stateName => {
            if (stateSet.has(stateName.toLowerCase())) {
                filteredTotals[stateName] = processedData.stateTotals[stateName];
            }
        });

        return {
            intervals: filteredIntervals,
            stateTotals: filteredTotals,
            metadata: processedData.metadata
        };
    },

    /**
     * Compare two processed schedule datasets
     * @param {Object} previousData - Previous schedule data
     * @param {Object} updatedData - Updated schedule data
     * @returns {Object} Comparison results
     */
    compareSchedules(previousData, updatedData) {
        const comparison = {
            intervals: [],
            stateComparisons: {},
            summary: {
                totalStatesPrevious: Object.keys(previousData.stateTotals).length,
                totalStatesUpdated: Object.keys(updatedData.stateTotals).length,
                commonStates: [],
                uniqueToPrevious: [],
                uniqueToUpdated: []
            }
        };

        // Compare intervals
        const intervals = DateUtils.generateIntervals();
        comparison.intervals = intervals.map((interval, index) => {
            const prevInterval = previousData.intervals[index];
            const updatedInterval = updatedData.intervals[index];

            const states = {};
            const allStateNames = new Set([
                ...Object.keys(prevInterval.states),
                ...Object.keys(updatedInterval.states)
            ]);

            allStateNames.forEach(stateName => {
                const prev = prevInterval.states[stateName] || { totalDuration: 0, agentCount: 0 };
                const updated = updatedInterval.states[stateName] || { totalDuration: 0, agentCount: 0 };

                states[stateName] = {
                    previous: prev,
                    updated: updated,
                    difference: {
                        duration: updated.totalDuration - prev.totalDuration,
                        agentCount: updated.agentCount - prev.agentCount
                    }
                };
            });

            return {
                interval: interval,
                states: states
            };
        });

        // Compare state totals
        const allStates = new Set([
            ...Object.keys(previousData.stateTotals),
            ...Object.keys(updatedData.stateTotals)
        ]);

        allStates.forEach(stateName => {
            const prev = previousData.stateTotals[stateName] || { totalDuration: 0, totalAgents: 0 };
            const updated = updatedData.stateTotals[stateName] || { totalDuration: 0, totalAgents: 0 };

            comparison.stateComparisons[stateName] = {
                previous: prev,
                updated: updated,
                difference: {
                    duration: updated.totalDuration - prev.totalDuration,
                    agents: updated.totalAgents - prev.totalAgents
                }
            };

            if (prev.totalDuration > 0 && updated.totalDuration > 0) {
                comparison.summary.commonStates.push(stateName);
            } else if (prev.totalDuration > 0) {
                comparison.summary.uniqueToPrevious.push(stateName);
            } else if (updated.totalDuration > 0) {
                comparison.summary.uniqueToUpdated.push(stateName);
            }
        });

        return comparison;
    }
};

