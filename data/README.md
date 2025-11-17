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

## Example Files

- `Schedule_11172025.csv` - Previous schedule for November 17, 2025
- `Arise_Schedule_11172025.csv` - After Arise schedule for November 17, 2025

