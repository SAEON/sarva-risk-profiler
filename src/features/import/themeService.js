const crimeIndicators = require('../../../tmp/crime_indicators.json');

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

module.exports = {
  getThemes,
  getIndicatorsByThemes,
  keyToExcelColumn,
  excelColumnToKey
};
