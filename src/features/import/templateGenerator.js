const XLSX = require('xlsx');
const { getIndicatorsByThemes, keyToExcelColumn } = require('./themeService');
const municipalities = require('../../../tmp/municipalities.json');
const { pool } = require('../../db/pool');

/**
 * Generate Excel template for selected theme(s)
 * @param {string|string[]} themes - Theme name(s)
 * @param {number} year - Optional year to pre-fill
 * @returns {Buffer} Excel file buffer
 */
async function generateTemplate(themes, year = null) {
  // Fetch available years from database
  const yearsResult = await pool.query(`
    SELECT period, label FROM dim.time
    WHERE granularity = 'year'
    ORDER BY period DESC
  `);
  const availableYears = yearsResult.rows;
  const themeArray = Array.isArray(themes) ? themes : [themes];
  const indicators = getIndicatorsByThemes(themeArray);

  // Sort indicators by sort_order
  indicators.sort((a, b) => (a.sort_order || 999) - (b.sort_order || 999));

  // Build header row
  const headers = [
    'Municipality_Code',
    'Municipality_Name',
    'Year',
    ...indicators.map(ind => keyToExcelColumn(ind.key)),
    'Scenario'
  ];

  // Build sample data row (with instructions as values)
  const sampleRow = [
    'JHB',
    'City of Johannesburg',
    year || 2024,
    ...indicators.map(() => ''),  // Empty cells for crime data
    'saps_actual'
  ];

  // Create worksheet data
  const wsData = [
    headers,
    sampleRow
  ];

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Sheet 1: Crime_Data
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 20 },  // Municipality_Code
    { wch: 30 },  // Municipality_Name
    { wch: 10 },  // Year
    ...indicators.map(() => ({ wch: 15 })),  // Crime columns
    { wch: 15 }   // Scenario
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Crime_Data');

  // Sheet 2: Available Years
  const yearsData = [
    ['Year', 'Label'],
    ...availableYears.map(y => [y.period, y.label || y.period])
  ];
  const wsYears = XLSX.utils.aoa_to_sheet(yearsData);
  wsYears['!cols'] = [{ wch: 10 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsYears, 'Available_Years');

  // Sheet 3: Municipalities Reference
  const munisData = [
    ['Municipality Code', 'Municipality Name'],
    ...municipalities.map(m => [m.code, m.name])
  ];
  const wsMunis = XLSX.utils.aoa_to_sheet(munisData);
  wsMunis['!cols'] = [{ wch: 20 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, wsMunis, 'Available_Municipalities');

  // Sheet 4: Instructions
  const yearsList = availableYears.map(y => y.period).join(', ');
  const instructions = [
    ['CRIME STATISTICS IMPORT TEMPLATE - INSTRUCTIONS'],
    [''],
    ['THEME(S): ' + themeArray.join(', ')],
    ['NUMBER OF INDICATORS: ' + indicators.length],
    [''],
    ['HOW TO USE:'],
    ['1. Fill in the Crime_Data sheet with your crime statistics'],
    ['2. Municipality_Code and Year are REQUIRED for each row'],
    ['3. Fill only the crime columns you have data for'],
    ['4. Leave cells EMPTY or enter 0 if you don\'t have data for that indicator'],
    ['5. Enter only POSITIVE numbers (raw counts or rates)'],
    ['6. Scenario defaults to "saps_actual" if left empty'],
    [''],
    ['IMPORTANT - VALID YEARS:'],
    ['You MUST use one of the following years (see Available_Years sheet):'],
    [yearsList],
    ['Using any other year will cause validation errors.'],
    [''],
    ['IMPORTANT - SCENARIO:'],
    ['The Scenario column should be "saps_actual" for SAPS crime data.'],
    ['If you leave it empty, it will default to "saps_actual".'],
    ['Available scenarios: saps_actual, actual, census 2022, census 2011, census 2001, census 1996'],
    [''],
    ['VALIDATION RULES:'],
    ['- Municipality codes must exist (see Available_Municipalities sheet)'],
    ['- Year must be one of the valid years listed above (see Available_Years sheet)'],
    ['- Crime values must be numeric (no text)'],
    ['- Negative numbers will cause errors (crime stats must be positive)'],
    ['- Empty cells and zeros are skipped (not imported, not an error)'],
    ['- If all crime columns in a row are empty/zero, the row is skipped'],
    [''],
    ['EXAMPLE:'],
    ['Municipality_Code: JHB'],
    ['Year: 2024'],
    ['Crime_Murder: 210  (will be imported)'],
    ['Crime_Assault_Gbh: 0  (will be skipped - zero means no data)'],
    ['Crime_Common_Assault: (empty - will be skipped)'],
    ['Scenario: saps_actual  (or leave empty for default)'],
    [''],
    ['INDICATORS IN THIS TEMPLATE:'],
    ...indicators.map(ind => [`${keyToExcelColumn(ind.key)}: ${ind.label} (${ind.unit})`])
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  wsInstructions['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

  // Generate buffer
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}

module.exports = { generateTemplate };
