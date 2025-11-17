/**
 * Schedule State Configuration Management
 * Handles CRUD operations for schedule states and stores in localStorage
 */

const StateConfig = {
    STORAGE_KEY: 'scheduleConfig',
    DEFAULT_CATEGORIES: ['Break', 'Meeting', 'Work', 'Time Off', 'Other'],

    /**
     * Initialize with default states if none exist
     */
    init() {
        const states = this.getAllStates();
        if (states.length === 0) {
            // Add some common default states
            const defaultStates = [
                { name: 'Break', category: 'Break', isPaid: true, isDefault: true },
                { name: 'Meeting', category: 'Meeting', isPaid: true, isDefault: true },
                { name: 'Work', category: 'Work', isPaid: true, isDefault: true },
                { name: 'Lunch', category: 'Break', isPaid: false, isDefault: true },
                { name: 'Time Off', category: 'Time Off', isPaid: false, isDefault: false }
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
     * Add a new state
     * @param {Object} stateData - State data {name, category, isPaid, isDefault}
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

