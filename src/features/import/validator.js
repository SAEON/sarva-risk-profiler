const { pool } = require('../../db/pool');
const { excelColumnToKey } = require('./themeService');

/**
 * Fetch all lookup data for validation
 * @returns {Object} Lookup maps
 */
async function fetchLookups() {
  // Fetch indicators
  const indicatorsResult = await pool.query(`
    SELECT id, key FROM catalog.indicator
    WHERE measure_type = 'indicator'
  `);
  const indicators = {};
  indicatorsResult.rows.forEach(row => {
    indicators[row.key] = row.id;
  });

  // Fetch time periods
  const timesResult = await pool.query(`
    SELECT id, period FROM dim.time WHERE granularity = 'year'
  `);
  const times = {};
  timesResult.rows.forEach(row => {
    times[row.period] = row.id;
  });

  // Fetch scenarios
  const scenariosResult = await pool.query(`
    SELECT id, key FROM dim.scenario
  `);
  const scenarios = {};
  scenariosResult.rows.forEach(row => {
    scenarios[row.key] = row.id;
  });

  // Fetch municipalities
  const munisResult = await pool.query(`
    SELECT code FROM admin.local_municipality_2018
  `);
  const municipalities = new Set();
  munisResult.rows.forEach(row => {
    municipalities.add(row.code);
  });

  return { indicators, times, scenarios, municipalities };
}

/**
 * Validate a single cell value
 * @param {*} cellValue - Cell value from Excel
 * @param {number} rowNum - Row number for error reporting
 * @param {string} columnName - Column name
 * @returns {Object} { shouldImport, value, error }
 */
function validateCellValue(cellValue, rowNum, columnName) {
  // Empty or null - skip
  if (cellValue === null || cellValue === undefined || cellValue === '') {
    return { shouldImport: false, reason: 'empty' };
  }

  // Try to parse as number
  const numValue = parseFloat(String(cellValue).trim());

  // Not a number
  if (isNaN(numValue)) {
    return {
      shouldImport: false,
      error: {
        row: rowNum,
        column: columnName,
        value: cellValue,
        error: 'Value must be numeric or left empty'
      }
    };
  }

  // Zero - skip (means no data)
  if (numValue === 0) {
    return { shouldImport: false, reason: 'zero' };
  }

  // Negative - error
  if (numValue < 0) {
    return {
      shouldImport: false,
      error: {
        row: rowNum,
        column: columnName,
        value: cellValue,
        error: 'Value cannot be negative. Crime statistics must be positive numbers.'
      }
    };
  }

  // Valid positive number
  return {
    shouldImport: true,
    value: numValue
  };
}

/**
 * Validate Excel rows
 * @param {Array} rows - Parsed Excel rows
 * @param {Array} crimeColumns - Crime indicator column names
 * @param {Object} lookups - Lookup data from database
 * @returns {Object} { validRecords, errors }
 */
function validateRows(rows, crimeColumns, lookups) {
  const validRecords = [];
  const errors = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2; // Excel row number (1-based + header)

    // Validate required fields
    if (!row.Municipality_Code) {
      errors.push({
        row: rowNum,
        column: 'Municipality_Code',
        value: row.Municipality_Code,
        error: 'Municipality code is required'
      });
      return; // Skip this row
    }

    if (!row.Year) {
      errors.push({
        row: rowNum,
        column: 'Year',
        value: row.Year,
        error: 'Year is required'
      });
      return;
    }

    // Validate municipality code exists
    if (!lookups.municipalities.has(row.Municipality_Code)) {
      errors.push({
        row: rowNum,
        column: 'Municipality_Code',
        value: row.Municipality_Code,
        error: `Municipality code '${row.Municipality_Code}' not found in database`
      });
      return;
    }

    // Validate year
    const year = parseInt(row.Year);
    if (isNaN(year)) {
      errors.push({
        row: rowNum,
        column: 'Year',
        value: row.Year,
        error: `Year must be a valid number`
      });
      return;
    }

    if (!lookups.times[year]) {
      const validYears = Object.keys(lookups.times).sort().join(', ');
      errors.push({
        row: rowNum,
        column: 'Year',
        value: row.Year,
        error: `Year '${row.Year}' is not available in the system. Valid years: ${validYears}`
      });
      return;
    }

    // Validate scenario (optional, defaults to saps_actual for crime data)
    const scenario = row.Scenario || 'saps_actual';
    if (!lookups.scenarios[scenario]) {
      errors.push({
        row: rowNum,
        column: 'Scenario',
        value: scenario,
        error: `Scenario '${scenario}' not found in database`
      });
      return;
    }

    // Process each crime column
    crimeColumns.forEach(columnName => {
      const cellValue = row[columnName];
      const validation = validateCellValue(cellValue, rowNum, columnName);

      if (validation.error) {
        errors.push(validation.error);
        return;
      }

      if (!validation.shouldImport) {
        // Skip this cell (empty or zero)
        return;
      }

      // Convert Excel column name to indicator key
      const indicatorKey = excelColumnToKey(columnName);

      // Validate indicator exists
      if (!lookups.indicators[indicatorKey]) {
        errors.push({
          row: rowNum,
          column: columnName,
          value: cellValue,
          error: `Unknown indicator '${indicatorKey}'`
        });
        return;
      }

      // Create valid record
      validRecords.push({
        indicator_id: lookups.indicators[indicatorKey],
        time_id: lookups.times[year],
        scenario_id: lookups.scenarios[scenario],
        entity_code: row.Municipality_Code,
        raw_value: validation.value,
        value_0_100: null
      });
    });
  });

  return { validRecords, errors };
}

module.exports = {
  fetchLookups,
  validateRows
};
