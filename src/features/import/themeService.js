const crimeIndicators = require('../../../tmp/crime_indicators.json');
const { pool } = require('../../db/pool');
const { getDomainConfig } = require('./domainConfig');

/**
 * Get all crime themes with their indicators
 * Excludes calculated indicators (sub-indexes and totals)
 */
function getThemes() {
  // Filter to only raw indicators (exclude sub-indexes and totals)
  const rawIndicators = crimeIndicators.filter(ind =>
    ind.measure_type === 'indicator' &&
    !ind.key.includes('_total') &&
    !ind.label.toLowerCase().includes('total')
  );

  // Group by theme
  const grouped = {};
  rawIndicators.forEach(ind => {
    const theme = ind.theme || 'Other';
    if (!grouped[theme]) {
      grouped[theme] = [];
    }
    grouped[theme].push({
      id: ind.id,
      key: ind.key,
      label: ind.label,
      unit: ind.unit,
      polarity: ind.polarity,
      description: ind.description,
      sort_order: ind.sort_order
    });
  });

  // Convert to array and sort
  const themes = Object.keys(grouped).map(theme => ({
    theme,
    count: grouped[theme].length,
    indicators: grouped[theme].sort((a, b) => (a.sort_order || 999) - (b.sort_order || 999))
  }));

  // Sort themes alphabetically
  return themes.sort((a, b) => a.theme.localeCompare(b.theme));
}

/**
 * Get indicators for specific theme(s)
 * @param {string|string[]} themeNames - Theme name(s) to filter by
 * @returns {Array} Array of indicator objects
 */
function getIndicatorsByThemes(themeNames) {
  const themes = getThemes();
  const themeArray = Array.isArray(themeNames) ? themeNames : [themeNames];

  const selectedThemes = themes.filter(t => themeArray.includes(t.theme));

  const allIndicators = [];
  selectedThemes.forEach(t => {
    allIndicators.push(...t.indicators);
  });

  return allIndicators;
}

/**
 * Convert indicator key to Excel column name
 * Example: crime_murder → Crime_Murder
 */
function keyToExcelColumn(key) {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('_');
}

/**
 * Convert Excel column name to indicator key
 * Example: Crime_Murder → crime_murder
 */
function excelColumnToKey(columnName) {
  return columnName.toLowerCase();
}

// ============================================
// Socio-Economic Import Functions
// ============================================

/**
 * Get all socio-economic themes with their indicators from the database
 * Excludes sub_index indicators (only imports raw indicators)
 * @returns {Promise<Array>} Array of theme objects with indicators
 */
async function getSocioEconomicThemes() {
  const config = getDomainConfig('socio-economic');

  const result = await pool.query(`
    SELECT id, key, label, theme, unit, polarity, description, sort_order
    FROM catalog.indicator
    WHERE category = $1
      AND measure_type = 'indicator'
    ORDER BY theme, sort_order, id
  `, [config.category]);

  // Group by theme
  const grouped = {};
  result.rows.forEach(ind => {
    const theme = ind.theme || 'Other';
    if (!grouped[theme]) {
      grouped[theme] = [];
    }
    grouped[theme].push({
      id: ind.id,
      key: ind.key,
      label: ind.label,
      unit: ind.unit,
      polarity: ind.polarity,
      description: ind.description,
      sort_order: ind.sort_order
    });
  });

  // Convert to array and sort
  const themes = Object.keys(grouped).map(theme => ({
    theme,
    count: grouped[theme].length,
    indicators: grouped[theme].sort((a, b) => (a.sort_order || 999) - (b.sort_order || 999))
  }));

  // Sort themes alphabetically
  return themes.sort((a, b) => a.theme.localeCompare(b.theme));
}

/**
 * Get socio-economic indicators for specific theme(s)
 * @param {string|string[]} themeNames - Theme name(s) to filter by
 * @returns {Promise<Array>} Array of indicator objects
 */
async function getSocioEconomicIndicatorsByThemes(themeNames) {
  const themes = await getSocioEconomicThemes();
  const themeArray = Array.isArray(themeNames) ? themeNames : [themeNames];

  const selectedThemes = themes.filter(t => themeArray.includes(t.theme));

  const allIndicators = [];
  selectedThemes.forEach(t => {
    allIndicators.push(...t.indicators);
  });

  return allIndicators;
}

/**
 * Sanitize a label for use as an Excel column name
 * - Replaces spaces with underscores
 * - Removes special characters (parentheses, plus signs, etc.)
 * - Keeps alphanumeric and underscores only
 * Example: "Elderly (65+ years)" → "Elderly_65_Years"
 */
function sanitizeLabelForExcel(label) {
  return label
    .replace(/\s+/g, '_')           // Replace spaces with underscores
    .replace(/[()]/g, '')           // Remove parentheses
    .replace(/\+/g, '')             // Remove plus signs
    .replace(/[^a-zA-Z0-9_]/g, '_') // Replace other special chars with underscore
    .replace(/_+/g, '_')            // Collapse multiple underscores
    .replace(/^_|_$/g, '');         // Remove leading/trailing underscores
}

/**
 * Convert indicator label to Socio-Economic Excel column name
 * Example: "Elderly (65+ years)" → "Elderly_65_years"
 */
function socioLabelToExcelColumn(label) {
  return sanitizeLabelForExcel(label);
}

/**
 * Build a mapping from Excel column names to indicator keys
 * This is needed to reverse-lookup the key from a label-based column name
 * @param {Array} indicators - Array of indicator objects with key and label
 * @returns {Object} Map of Excel column name (lowercase) → indicator key
 */
function buildColumnToKeyMap(indicators) {
  const map = {};
  indicators.forEach(ind => {
    const excelColumn = socioLabelToExcelColumn(ind.label);
    map[excelColumn.toLowerCase()] = ind.key;
  });
  return map;
}

/**
 * Get column-to-key mapping for all socio-economic indicators
 * @returns {Promise<Object>} Map of Excel column name (lowercase) → indicator key
 */
async function getSocioEconomicColumnToKeyMap() {
  const themes = await getSocioEconomicThemes();
  const allIndicators = [];
  themes.forEach(t => allIndicators.push(...t.indicators));
  return buildColumnToKeyMap(allIndicators);
}

/**
 * Convert indicator key to Socio-Economic Excel column name (DEPRECATED - use socioLabelToExcelColumn)
 * Example: population_total → Socio_Population_Total
 */
function socioKeyToExcelColumn(key) {
  const config = getDomainConfig('socio-economic');
  const titleCase = key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('_');
  return config.columnPrefix + titleCase;
}

/**
 * Convert Socio-Economic Excel column name to indicator key
 * Uses the column-to-key map for label-based columns
 * Falls back to lowercase conversion if not found in map
 * @param {string} columnName - Excel column name
 * @param {Object} columnToKeyMap - Map from column names to keys (optional)
 */
function socioExcelColumnToKey(columnName, columnToKeyMap = null) {
  // If we have a mapping, use it for label-based columns
  if (columnToKeyMap) {
    const key = columnToKeyMap[columnName.toLowerCase()];
    if (key) return key;
  }

  // Fallback: convert to lowercase (for backwards compatibility)
  return columnName.toLowerCase();
}

module.exports = {
  // Crime imports
  getThemes,
  getIndicatorsByThemes,
  keyToExcelColumn,
  excelColumnToKey,
  // Socio-economic imports
  getSocioEconomicThemes,
  getSocioEconomicIndicatorsByThemes,
  socioKeyToExcelColumn,
  socioLabelToExcelColumn,
  socioExcelColumnToKey,
  getSocioEconomicColumnToKeyMap,
  buildColumnToKeyMap
};
