# Data Folder

This folder contains CSV schedule files that are automatically loaded by the dashboard.

## File Naming Convention

Place your schedule CSV files in this folder with the following naming pattern:

- **Previous Schedule**: `Schedule_MMDDYYYY.csv`
  - Example: `Schedule_01012025.csv` for January 1, 2025
  - Example: `Schedule_11172025.csv` for November 17, 2025

- **After Arise Schedule**: `Arise_Schedule_MMDDYYYY.csv`
  - Example: `Arise_Schedule_01012025.csv` for January 1, 2025
  - Example: `Arise_Schedule_11172025.csv` for November 17, 2025

## Date Format

- **MM** = Two-digit month (01-12)
- **DD** = Two-digit day (01-31)
- **YYYY** = Four-digit year (e.g., 2025)

## How It Works

1. When you select a date in the dashboard, the system automatically looks for files matching that date in this folder.
2. If files are found, they are automatically loaded and parsed.
3. If files are not found, the system will:
   - Check localStorage for previously loaded data
   - Allow manual file upload as a fallback

## CSV File Structure

Your CSV files should have the following columns (in order):

1. **Site** - Site name where agents are based
2. **Time zone** - Timezone (e.g., "Asia/Kolkata", "America/New_York")
3. **Team** - Team name (can be "TeamName - LeaderName" or just "TeamName")
4. **Agent** - Agent/employee name (REQUIRED)
5. **Date** - Date in MM/DD/YYYY format (REQUIRED)
6. **Schedule State** - State name (e.g., "Break", "Meeting", "Work") (REQUIRED)
7. **Start Time** - Start time in format "12:30:00 AM" or "4:00 PM" (REQUIRED - rows without this are skipped)
8. **End Time** - End time in format "12:30:00 AM" or "4:00 PM" (REQUIRED - rows without this are skipped)
9. **Duration** - Duration in format "12:30:00 AM" (optional)
10. **Paid Hours** - Paid duration in format "12:30:00 AM" (optional)

**Important Notes:**
- The Employee ID column has been removed. All columns after Team have shifted left by one position.
- **Start Time and End Time are REQUIRED** - rows with empty Start Time or End Time will be skipped from calculations (they cannot be used to determine which intervals to calculate).
- "Full Day" is a valid value for Start Time/End Time (e.g., for "Day Off" states).
- If team name contains "-", only the part before "-" is used; otherwise the full team name is used.

## Example Files

- `Schedule_11172025.csv` - Previous schedule for November 17, 2025
- `Arise_Schedule_11172025.csv` - After Arise schedule for November 17, 2025

