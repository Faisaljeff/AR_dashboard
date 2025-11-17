/**
 * Schedule State Configuration Management
 * Handles CRUD operations for schedule states and stores in localStorage
 */

const StateConfig = {
    STORAGE_KEY: 'scheduleConfig',
    CATEGORIES_KEY: 'scheduleCategories',
    DASHBOARD_VISIBILITY_KEY: 'dashboardVisibility',
    DEFAULT_CATEGORIES: ['Break', 'Meeting', 'Work', 'Time Off', 'Training', 'Supervisor Time', 'Loan', 'Coaching', 'Other'],
    DEFAULT_GROUPS: [
        'MEETING, TRAINING and COACHING',
        'OTHER DUTIES',
        'PAID TIME OFF',
        'SYSTEM',
        'UNSCHEDULED TIME',
        'OUTBOUND',
        'OTHER LEAVE',
        'NEW HIRE TRAINING',
        'MISCELLANEOUS',
        'LATE AND UNKNOWN',
        'INBOUND ACTIVITY',
        'DAY OFF',
        'CCA ACTIVITY',
        'BREAK',
        'BCP EVENT',
        'ABSENCE'
    ],

    /**
     * Mapping of keywords to groups for auto-assignment
     * @private
     */
    _GROUP_KEYWORDS: {
        'MEETING, TRAINING and COACHING': ['meeting', 'training', 'coaching', 'coach', 'train', 'seminar', 'workshop', 'session'],
        'BREAK': ['break', 'lunch', 'meal', 'rest'],
        'INBOUND ACTIVITY': ['work', 'inbound', 'call', 'handle', 'service', 'support', 'agent'],
        'PAID TIME OFF': ['time off', 'pto', 'vacation', 'holiday', 'paid time'],
        'OUTBOUND': ['outbound', 'outbound', 'call out', 'out call'],
        'OTHER DUTIES': ['duty', 'task', 'assignment', 'other duty', 'admin', 'administrative'],
        'SYSTEM': ['system', 'maintenance', 'update', 'downtime'],
        'UNSCHEDULED TIME': ['unscheduled', 'unplanned', 'ad-hoc'],
        'OTHER LEAVE': ['leave', 'sick', 'sick leave', 'personal leave', 'unpaid leave'],
        'NEW HIRE TRAINING': ['new hire', 'onboarding', 'orientation', 'new employee'],
        'MISCELLANEOUS': ['misc', 'miscellaneous', 'other', 'general'],
        'LATE AND UNKNOWN': ['late', 'unknown', 'unidentified', 'tardy'],
        'DAY OFF': ['day off', 'off day', 'rest day'],
        'CCA ACTIVITY': ['cca', 'customer care', 'care activity'],
        'BCP EVENT': ['bcp', 'business continuity', 'continuity plan'],
        'ABSENCE': ['absence', 'absent', 'no show', 'absentee']
    },

    /**
     * Initialize with default states if none exist
     */
    init() {
        const states = this.getAllStates();
        if (states.length === 0) {
            // Add some common default states
            const defaultStates = [
                { name: 'Break', category: 'Break', group: 'BREAK', isPaid: true, isDefault: true },
                { name: 'Meeting', category: 'Meeting', group: 'MEETING, TRAINING and COACHING', isPaid: true, isDefault: true },
                { name: 'Work', category: 'Work', group: 'INBOUND ACTIVITY', isPaid: true, isDefault: true },
                { name: 'Lunch', category: 'Break', group: 'BREAK', isPaid: false, isDefault: true },
                { name: 'Time Off', category: 'Time Off', group: 'PAID TIME OFF', isPaid: false, isDefault: false }
            ];
            
            defaultStates.forEach(state => this.addState(state));
        }
    },

    /**
     * Get all configured states
     * @returns {Array} Array of state objects
     */
    getAllStates() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('Error reading state config:', e);
            return [];
        }
    },

    /**
     * Get a specific state by ID
     * @param {string} id - State ID
     * @returns {Object|null} State object or null
     */
    getState(id) {
        const states = this.getAllStates();
        return states.find(s => s.id === id) || null;
    },

    /**
     * Get a state by name (case-insensitive)
     * @param {string} name - State name
     * @returns {Object|null} State object or null
     */
    getStateByName(name) {
        const states = this.getAllStates();
        return states.find(s => s.name.toLowerCase() === name.toLowerCase()) || null;
    },

    /**
     * Find matching state for a given state name from CSV
     * First checks for exact match, then checks for keyword matches
     * @param {string} stateName - State name from CSV (e.g., "break- 10 minutes", "Break 15 Mins / 2:00 - 2:30")
     * @returns {string} Matching configured state name (e.g., "Break") or original name if no match found
     */
    findMatchingState(stateName) {
        if (!stateName || typeof stateName !== 'string') {
            return stateName;
        }

        const normalizedInput = stateName.trim();
        if (!normalizedInput) {
            return stateName;
        }

        const allStates = this.getAllStates();
        
        // Step 1: Check for exact match (case-insensitive)
        const exactMatch = allStates.find(s => 
            s.name.toLowerCase() === normalizedInput.toLowerCase()
        );
        
        if (exactMatch) {
            return exactMatch.name; // Return the configured state name (preserves casing)
        }

        // Step 2: Check for keyword matches
        // Extract base keywords from state names and check if input contains them
        const normalizedInputLower = normalizedInput.toLowerCase();
        
        // Sort states by name length (longer names first) to match more specific states first
        // This ensures "Break Time" is checked before "Break"
        const sortedStates = [...allStates].sort((a, b) => b.name.length - a.name.length);
        
        for (const state of sortedStates) {
            // Extract base words from state name (remove special chars, numbers, etc.)
            // For "Break", extract ["break"]
            // For "Break Time", extract ["break", "time", "breaktime"]
            const baseWords = this._extractBaseWords(state.name);
            
            // Check if any base word from the state name appears in the input
            // Use word boundary matching to avoid false positives (e.g., "breakfast" shouldn't match "Break")
            for (const word of baseWords) {
                if (word.length >= 3) {
                    // Escape special regex characters in the word
                    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    
                    // Create a regex pattern that matches the word as a whole word or after special chars
                    // This matches "break" in "break- 10 minutes" or "Break 15 Mins"
                    // Pattern: word at start, or after non-letter, and followed by non-letter or end
                    const wordPattern = new RegExp(`(^|[^a-z])${escapedWord}([^a-z]|$)`, 'i');
                    
                    if (wordPattern.test(normalizedInput)) {
                        // Found a keyword match
                        console.log(`State matching: "${stateName}" → "${state.name}" (matched keyword: "${word}")`);
                        return state.name; // Return the configured state name
                    }
                }
            }
        }

        // Step 3: No match found, return original name
        // This allows the system to still process states that aren't configured
        console.log(`State matching: "${stateName}" → No match found, using original name`);
        return normalizedInput;
    },

    /**
     * Extract base words from a state name for keyword matching
     * Removes special characters, numbers, and extracts meaningful words
     * @private
     * @param {string} stateName - State name (e.g., "Break", "Meeting", "Time Off")
     * @returns {Array<string>} Array of base words
     */
    _extractBaseWords(stateName) {
        if (!stateName) return [];
        
        const words = [];
        
        // First, extract individual words (split by spaces, dashes, slashes, colons)
        const parts = stateName
            .split(/[\s\/\-:]+/)
            .map(part => part.trim())
            .filter(part => part.length > 0);
        
        // Extract meaningful words from each part
        for (const part of parts) {
            // Remove numbers and special characters, keep only letters
            const cleaned = part.replace(/[^a-zA-Z]/g, '');
            
            if (cleaned.length >= 3) {
                // Add lowercase version for matching
                words.push(cleaned.toLowerCase());
            }
        }
        
        // Also check if the full state name (without numbers/special chars) is a good keyword
        const fullCleaned = stateName
            .replace(/[0-9]/g, '')
            .replace(/[\/\-:]/g, ' ')
            .replace(/[^\w\s]/g, '')
            .trim()
            .replace(/\s+/g, ''); // Remove spaces to get single word
        
        if (fullCleaned.length >= 3) {
            words.push(fullCleaned.toLowerCase());
        }
        
        // Remove duplicates and return
        return [...new Set(words)];
    },

    /**
     * Add a new state
     * @param {Object} stateData - State data {name, category, group, isPaid, isDefault}
     * @returns {string} ID of created state
     */
    addState(stateData) {
        if (!stateData.name || !stateData.category) {
            throw new Error('State name and category are required');
        }

        // Check for duplicate names
        const existing = this.getStateByName(stateData.name);
        if (existing) {
            throw new Error(`State "${stateData.name}" already exists`);
        }

        const states = this.getAllStates();
        const newState = {
            id: this._generateId(),
            name: stateData.name.trim(),
            category: stateData.category,
            group: stateData.group || '',
            isPaid: stateData.isPaid !== undefined ? stateData.isPaid : true,
            isDefault: stateData.isDefault !== undefined ? stateData.isDefault : false,
            createdAt: new Date().toISOString()
        };

        states.push(newState);
        this._saveStates(states);
        return newState.id;
    },

    /**
     * Update an existing state
     * @param {string} id - State ID
     * @param {Object} stateData - Updated state data
     */
    updateState(id, stateData) {
        const states = this.getAllStates();
        const index = states.findIndex(s => s.id === id);
        
        if (index === -1) {
            throw new Error('State not found');
        }

        // Check for duplicate names (excluding current state)
        const existing = this.getStateByName(stateData.name);
        if (existing && existing.id !== id) {
            throw new Error(`State "${stateData.name}" already exists`);
        }

        states[index] = {
            ...states[index],
            name: stateData.name.trim(),
            category: stateData.category,
            group: stateData.group !== undefined ? stateData.group : states[index].group || '',
            isPaid: stateData.isPaid !== undefined ? stateData.isPaid : states[index].isPaid,
            isDefault: stateData.isDefault !== undefined ? stateData.isDefault : states[index].isDefault,
            updatedAt: new Date().toISOString()
        };

        this._saveStates(states);
    },

    /**
     * Delete a state
     * @param {string} id - State ID
     */
    deleteState(id) {
        const states = this.getAllStates();
        const filtered = states.filter(s => s.id !== id);
        
        if (filtered.length === states.length) {
            throw new Error('State not found');
        }

        this._saveStates(filtered);
    },

    /**
     * Get default states (states marked as default)
     * @returns {Array} Array of default state objects
     */
    getDefaultStates() {
        return this.getAllStates().filter(s => s.isDefault);
    },

    /**
     * Get states by category
     * @param {string} category - Category name
     * @returns {Array} Array of state objects
     */
    getStatesByCategory(category) {
        return this.getAllStates().filter(s => s.category === category);
    },

    /**
     * Save states to localStorage
     * @private
     */
    _saveStates(states) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(states));
        } catch (e) {
            console.error('Error saving state config:', e);
            throw new Error('Failed to save configuration. LocalStorage may be full.');
        }
    },

    /**
     * Get all available categories (default + custom)
     * @returns {Array} Array of category names
     */
    getAllCategories() {
        const customCategories = this.getCustomCategories();
        const allCategories = [...this.DEFAULT_CATEGORIES, ...customCategories];
        // Remove duplicates and sort
        return [...new Set(allCategories)].sort();
    },

    /**
     * Get custom categories from localStorage
     * @returns {Array} Array of custom category names
     */
    getCustomCategories() {
        try {
            const stored = localStorage.getItem(this.CATEGORIES_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('Error reading custom categories:', e);
            return [];
        }
    },

    /**
     * Add a custom category
     * @param {string} categoryName - Name of the category
     */
    addCustomCategory(categoryName) {
        if (!categoryName || categoryName.trim() === '') {
            throw new Error('Category name is required');
        }

        const trimmed = categoryName.trim();
        
        // Check if it's already a default category
        if (this.DEFAULT_CATEGORIES.includes(trimmed)) {
            throw new Error(`"${trimmed}" is already a default category`);
        }

        const customCategories = this.getCustomCategories();
        
        // Check for duplicates (case-insensitive)
        if (customCategories.some(cat => cat.toLowerCase() === trimmed.toLowerCase())) {
            throw new Error(`Category "${trimmed}" already exists`);
        }

        customCategories.push(trimmed);
        this._saveCustomCategories(customCategories);
    },

    /**
     * Delete a custom category
     * @param {string} categoryName - Name of the category to delete
     */
    deleteCustomCategory(categoryName) {
        const customCategories = this.getCustomCategories();
        const filtered = customCategories.filter(cat => cat !== categoryName);
        
        if (filtered.length === customCategories.length) {
            throw new Error('Category not found');
        }

        // Check if any states are using this category
        const states = this.getAllStates();
        const statesUsingCategory = states.filter(s => s.category === categoryName);
        
        if (statesUsingCategory.length > 0) {
            throw new Error(`Cannot delete category "${categoryName}" - ${statesUsingCategory.length} state(s) are using it. Please update those states first.`);
        }

        this._saveCustomCategories(filtered);
    },

    /**
     * Save custom categories to localStorage
     * @private
     */
    _saveCustomCategories(categories) {
        try {
            localStorage.setItem(this.CATEGORIES_KEY, JSON.stringify(categories));
        } catch (e) {
            console.error('Error saving custom categories:', e);
            throw new Error('Failed to save categories. LocalStorage may be full.');
        }
    },

    /**
     * Get all available groups (default + custom)
     * @returns {Array} Array of group names
     */
    getAllGroups() {
        const customGroups = this.getCustomGroups();
        const allGroups = [...this.DEFAULT_GROUPS, ...customGroups];
        // Remove duplicates and sort
        return [...new Set(allGroups)].sort();
    },

    /**
     * Get custom groups from localStorage
     * @returns {Array} Array of custom group names
     */
    getCustomGroups() {
        try {
            const stored = localStorage.getItem('scheduleGroups');
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('Error reading custom groups:', e);
            return [];
        }
    },

    /**
     * Add a custom group
     * @param {string} groupName - Name of the group
     */
    addCustomGroup(groupName) {
        if (!groupName || groupName.trim() === '') {
            throw new Error('Group name is required');
        }

        const trimmed = groupName.trim();
        
        // Check if it's already a default group
        if (this.DEFAULT_GROUPS.includes(trimmed)) {
            throw new Error(`"${trimmed}" is already a default group`);
        }

        const customGroups = this.getCustomGroups();
        
        // Check for duplicates (case-insensitive)
        if (customGroups.some(grp => grp.toLowerCase() === trimmed.toLowerCase())) {
            throw new Error(`Group "${trimmed}" already exists`);
        }

        customGroups.push(trimmed);
        this._saveCustomGroups(customGroups);
    },

    /**
     * Delete a custom group
     * @param {string} groupName - Name of the group to delete
     */
    deleteCustomGroup(groupName) {
        const customGroups = this.getCustomGroups();
        const filtered = customGroups.filter(grp => grp !== groupName);
        
        if (filtered.length === customGroups.length) {
            throw new Error('Group not found');
        }

        // Check if any states are using this group
        const states = this.getAllStates();
        const statesUsingGroup = states.filter(s => s.group === groupName);
        
        if (statesUsingGroup.length > 0) {
            throw new Error(`Cannot delete group "${groupName}" - ${statesUsingGroup.length} state(s) are using it. Please update those states first.`);
        }

        this._saveCustomGroups(filtered);
    },

    /**
     * Save custom groups to localStorage
     * @private
     */
    _saveCustomGroups(groups) {
        try {
            localStorage.setItem('scheduleGroups', JSON.stringify(groups));
        } catch (e) {
            console.error('Error saving custom groups:', e);
            throw new Error('Failed to save groups. LocalStorage may be full.');
        }
    },

    /**
     * Get dashboard visibility settings
     * @returns {Object} Map of group name to visibility (true/false)
     */
    getDashboardVisibility() {
        try {
            const stored = localStorage.getItem(this.DASHBOARD_VISIBILITY_KEY);
            if (stored) {
                return JSON.parse(stored);
            }
            // Default: all dashboards visible
            const defaultVisibility = {};
            this.DEFAULT_GROUPS.forEach(group => {
                defaultVisibility[group] = true;
            });
            return defaultVisibility;
        } catch (e) {
            console.error('Error reading dashboard visibility:', e);
            return {};
        }
    },

    /**
     * Set dashboard visibility for a group
     * @param {string} groupName - Name of the group
     * @param {boolean} visible - Whether the dashboard should be visible
     */
    setDashboardVisibility(groupName, visible) {
        const visibility = this.getDashboardVisibility();
        visibility[groupName] = visible;
        this._saveDashboardVisibility(visibility);
    },

    /**
     * Get all visible dashboard groups
     * @returns {Array} Array of group names that should be visible
     */
    getVisibleDashboardGroups() {
        const visibility = this.getDashboardVisibility();
        return Object.keys(visibility).filter(group => visibility[group] === true);
    },

    /**
     * Save dashboard visibility settings
     * @private
     */
    _saveDashboardVisibility(visibility) {
        try {
            localStorage.setItem(this.DASHBOARD_VISIBILITY_KEY, JSON.stringify(visibility));
        } catch (e) {
            console.error('Error saving dashboard visibility:', e);
            throw new Error('Failed to save dashboard visibility. LocalStorage may be full.');
        }
    },

    /**
     * Get states by group
     * @param {string} groupName - Name of the group
     * @returns {Array} Array of state objects in that group
     */
    getStatesByGroup(groupName) {
        const states = this.getAllStates();
        return states.filter(state => state.group === groupName);
    },

    /**
     * Auto-assign group to a state based on its name
     * @param {string} stateName - Name of the state
     * @returns {string|null} Group name or null if no match
     */
    autoAssignGroup(stateName) {
        if (!stateName) return null;
        
        const stateNameLower = stateName.toLowerCase().trim();
        
        // Check each group's keywords
        for (const [groupName, keywords] of Object.entries(this._GROUP_KEYWORDS)) {
            for (const keyword of keywords) {
                if (stateNameLower.includes(keyword.toLowerCase())) {
                    return groupName;
                }
            }
        }
        
        return null; // No match found
    },

    /**
     * Auto-assign groups to all existing states that don't have a group
     * @returns {number} Number of states updated
     */
    autoAssignGroupsToExistingStates() {
        const states = this.getAllStates();
        let updated = 0;
        
        states.forEach(state => {
            // Only assign if state doesn't have a group
            if (!state.group || state.group.trim() === '') {
                const assignedGroup = this.autoAssignGroup(state.name);
                if (assignedGroup) {
                    try {
                        this.updateState(state.id, {
                            ...state,
                            group: assignedGroup
                        });
                        updated++;
                    } catch (error) {
                        console.error(`Error updating state ${state.name}:`, error);
                    }
                }
            }
        });
        
        return updated;
    },

    /**
     * Generate a unique ID for a state
     * @private
     */
    _generateId() {
        return 'state_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
};

// Initialize on load
if (typeof window !== 'undefined') {
    StateConfig.init();
}

