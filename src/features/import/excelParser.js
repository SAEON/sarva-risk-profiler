const XLSX = require('xlsx');
const { getDomainConfig } = require('./domainConfig');

/**
 * Parse Excel file and extract crime data
 * @param {Buffer} buffer - Excel file buffer
 * @returns {Array} Array of row objects
 */
function parseExcelFile(buffer) {
  try {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true
    });

    // Check if Crime_Data sheet exists
    if (!workbook.SheetNames.includes('Crime_Data')) {
      throw new Error('Sheet "Crime_Data" not found in Excel file');
    }

    const worksheet = workbook.Sheets['Crime_Data'];

    // Convert sheet to JSON
    const data = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: null
    });

    return data;
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
}

/**
 * Extract crime indicator columns from parsed data
 * @param {Array} rows - Parsed Excel rows
 * @returns {Array} Array of crime indicator column names
 */
function extractCrimeColumns(rows) {
  if (rows.length === 0) return [];

  const firstRow = rows[0];
  const columns = Object.keys(firstRow);

  // Filter to only Crime_* columns
  return columns.filter(col =>
    col.startsWith('Crime_') || col.startsWith('crime_')
  );
}

// ============================================
// Socio-Economic Parsing Functions
// ============================================

/**
 * Parse Excel file and extract socio-economic data
 * @param {Buffer} buffer - Excel file buffer
 * @returns {Array} Array of row objects
 */
function parseSocioEconomicExcelFile(buffer) {
  const config = getDomainConfig('socio-economic');

  try {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true
    });

    // Check if Socio_Economic_Data sheet exists
    if (!workbook.SheetNames.includes(config.sheetName)) {
      throw new Error(`Sheet "${config.sheetName}" not found in Excel file`);
    }

    const worksheet = workbook.Sheets[config.sheetName];

    // Convert sheet to JSON
    const data = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: null
    });

    return data;
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
}

/**
 * Extract socio-economic indicator columns from parsed data
 * Excludes metadata columns (Municipality_Code, Municipality_Name, Year, Scenario)
 * @param {Array} rows - Parsed Excel rows
 * @returns {Array} Array of socio-economic indicator column names
 */
function extractSocioEconomicColumns(rows) {
  if (rows.length === 0) return [];

  const firstRow = rows[0];
  const columns = Object.keys(firstRow);

  // Exclude known metadata columns
  const metadataColumns = ['municipality_code', 'municipality_name', 'year', 'scenario'];
  return columns.filter(col =>
    !metadataColumns.includes(col.toLowerCase())
  );
}

module.exports = {
  // Crime imports
  parseExcelFile,
  extractCrimeColumns,
  // Socio-economic imports
  parseSocioEconomicExcelFile,
  extractSocioEconomicColumns
};
