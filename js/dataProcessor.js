/**
 * Data Processor
 * Transforms parsed CSV data into interval-based analytics
 */

const DataProcessor = {
    /**
     * Process schedule data into interval-based format
     * @param {Array} scheduleData - Parsed schedule data from CSV
     * @returns {Object} Processed data with interval calculations
     */
    processScheduleData(scheduleData) {
        if (!scheduleData || scheduleData.length === 0) {
            return this._createEmptyResult();
        }

        const intervals = DateUtils.generateIntervals();
        const stateMap = new Map(); // Map to track state totals
        const intervalData = intervals.map(interval => {
            const stateData = new Map();
            return {
                interval: interval,
                states: stateData
            };
        });

        // Process each schedule entry
        scheduleData.forEach(entry => {
            const stateName = entry.scheduleState;
            let startMinutes = DateUtils.parseTimeToMinutes(entry.startTime);
            let endMinutes = DateUtils.parseTimeToMinutes(entry.endTime);
            
            // Handle "Full Day" entries - they span the entire day (00:00 to 23:59)
            if (entry.startTime && entry.startTime.trim().toUpperCase() === 'FULL DAY' ||
                entry.endTime && entry.endTime.trim().toUpperCase() === 'FULL DAY') {
                startMinutes = 0; // Start of day
                endMinutes = 1439; // End of day (23:59)
            }

            if (startMinutes === null || endMinutes === null) {
                // Skip entries where we can't determine time range
                return;
            }

            // Handle end time that might be next day
            let actualEndMinutes = endMinutes;
            if (endMinutes < startMinutes) {
                actualEndMinutes = endMinutes + 1440; // Add 24 hours
            }

            // Update state totals
            const duration = actualEndMinutes - startMinutes;
            if (!stateMap.has(stateName)) {
                stateMap.set(stateName, {
                    totalDuration: 0,
                    totalAgents: new Set(),
                    totalCount: 0
                });
            }
            const stateStats = stateMap.get(stateName);
            stateStats.totalDuration += duration;
            stateStats.totalAgents.add(entry.agent);
            stateStats.totalCount += 1;

            // Calculate which intervals this entry overlaps
            intervals.forEach((interval, index) => {
                const overlap = DateUtils.calculateOverlap(
                    startMinutes,
                    actualEndMinutes,
                    interval.startMinutes,
                    interval.endMinutes
                );

                if (overlap > 0) {
                    const intervalEntry = intervalData[index];
                    if (!intervalEntry.states.has(stateName)) {
                        intervalEntry.states.set(stateName, {
                            totalDuration: 0,
                            agentSet: new Set()
                        });
                    }

                    const stateEntry = intervalEntry.states.get(stateName);
                    stateEntry.totalDuration += overlap;
                    stateEntry.agentSet.add(entry.agent);
                }
            });
        });

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
            metadata: {
                totalEntries: scheduleData.length,
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
     * @param {Object} ariseData - After Arise schedule data
     * @returns {Object} Comparison results
     */
    compareSchedules(previousData, ariseData) {
        const comparison = {
            intervals: [],
            stateComparisons: {},
            summary: {
                totalStatesPrevious: Object.keys(previousData.stateTotals).length,
                totalStatesArise: Object.keys(ariseData.stateTotals).length,
                commonStates: [],
                uniqueToPrevious: [],
                uniqueToArise: []
            }
        };

        // Compare intervals
        const intervals = DateUtils.generateIntervals();
        comparison.intervals = intervals.map((interval, index) => {
            const prevInterval = previousData.intervals[index];
            const ariseInterval = ariseData.intervals[index];

            const states = {};
            const allStateNames = new Set([
                ...Object.keys(prevInterval.states),
                ...Object.keys(ariseInterval.states)
            ]);

            allStateNames.forEach(stateName => {
                const prev = prevInterval.states[stateName] || { totalDuration: 0, agentCount: 0 };
                const arise = ariseInterval.states[stateName] || { totalDuration: 0, agentCount: 0 };

                states[stateName] = {
                    previous: prev,
                    arise: arise,
                    difference: {
                        duration: arise.totalDuration - prev.totalDuration,
                        agentCount: arise.agentCount - prev.agentCount
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
            ...Object.keys(ariseData.stateTotals)
        ]);

        allStates.forEach(stateName => {
            const prev = previousData.stateTotals[stateName] || { totalDuration: 0, totalAgents: 0 };
            const arise = ariseData.stateTotals[stateName] || { totalDuration: 0, totalAgents: 0 };

            comparison.stateComparisons[stateName] = {
                previous: prev,
                arise: arise,
                difference: {
                    duration: arise.totalDuration - prev.totalDuration,
                    agents: arise.totalAgents - prev.totalAgents
                }
            };

            if (prev.totalDuration > 0 && arise.totalDuration > 0) {
                comparison.summary.commonStates.push(stateName);
            } else if (prev.totalDuration > 0) {
                comparison.summary.uniqueToPrevious.push(stateName);
            } else if (arise.totalDuration > 0) {
                comparison.summary.uniqueToArise.push(stateName);
            }
        });

        return comparison;
    }
};

