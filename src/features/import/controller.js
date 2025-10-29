const { getThemes, keyToExcelColumn } = require('./themeService');
const { generateTemplate } = require('./templateGenerator');
const { parseExcelFile, extractCrimeColumns } = require('./excelParser');
const { fetchLookups, validateRows } = require('./validator');
const { importRecords } = require('./importer');

/**
 * GET /import/crime-stats/themes
 * List all available crime themes
 */
exports.listThemes = async (req, res) => {
  try {
    const themes = getThemes();

    // Add Excel column names to each indicator
    const themesWithColumns = themes.map(theme => ({
      ...theme,
      indicators: theme.indicators.map(ind => ({
        ...ind,
        excelColumn: keyToExcelColumn(ind.key)
      }))
    }));

    res.json({
      themes: themesWithColumns,
      totalThemes: themes.length,
      totalIndicators: themes.reduce((sum, t) => sum + t.count, 0)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /import/crime-stats/template
 * Generate Excel template for selected theme(s)
 */
exports.downloadTemplate = async (req, res) => {
  try {
    const themesParam = req.query.themes;
    const year = req.query.year ? parseInt(req.query.year) : null;

    if (!themesParam) {
      return res.status(400).json({
        error: 'themes parameter is required',
        example: '/import/crime-stats/template?themes=Contact crimes'
      });
    }

    // Split themes by comma
    const themes = themesParam.split(',').map(t => t.trim());

    // Validate themes exist
    const availableThemes = getThemes();
    const availableThemeNames = availableThemes.map(t => t.theme);
    const invalidThemes = themes.filter(t => !availableThemeNames.includes(t));

    if (invalidThemes.length > 0) {
      return res.status(400).json({
        error: `Invalid theme(s): ${invalidThemes.join(', ')}`,
        availableThemes: availableThemeNames
      });
    }

    // Generate template
    const buffer = await generateTemplate(themes, year);

    // Send file
    const filename = `crime_stats_${themes.join('_').replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /import/crime-stats
 * Upload and import crime statistics
 */
exports.uploadCrimeStats = async (req, res) => {
  const startTime = Date.now();

  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Please attach an Excel file.' });
    }

    // Parse Excel file
    const rows = parseExcelFile(req.file.buffer);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty or has no data rows' });
    }

    // Extract crime columns
    const crimeColumns = extractCrimeColumns(rows);

    if (crimeColumns.length === 0) {
      return res.status(400).json({
        error: 'No crime indicator columns found in Excel file',
        hint: 'Columns should start with "Crime_" (e.g., Crime_Murder, Crime_Assault)'
      });
    }

    // Fetch lookup data
    const lookups = await fetchLookups();

    // Validate rows
    const { validRecords, errors } = validateRows(rows, crimeColumns, lookups);

    // If there are errors, return them
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        summary: {
          totalRows: rows.length,
          validRecords: validRecords.length,
          failed: errors.length
        },
        errors: errors.slice(0, 50) // Limit to first 50 errors
      });
    }

    // If no valid records, warn user
    if (validRecords.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid data to import. All cells were empty or zero.',
        hint: 'Make sure to enter positive numbers for the crime statistics you want to import.'
      });
    }

    // Import to database
    const { inserted, updated } = await importRecords(validRecords);

    // Calculate statistics
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

    const affectedMunicipalities = [...new Set(validRecords.map(r => r.entity_code))];
    const affectedIndicators = [...new Set(validRecords.map(r => r.indicator_id))];
    const affectedYears = [...new Set(validRecords.map(r => r.time_id))];

    // Get indicator keys for response
    const indicatorKeyMap = {};
    Object.entries(lookups.indicators).forEach(([key, id]) => {
      indicatorKeyMap[id] = key;
    });

    res.json({
      success: true,
      summary: {
        totalRows: rows.length,
        totalCells: rows.length * crimeColumns.length,
        cellsProcessed: validRecords.length,
        inserted,
        updated,
        skipped: (rows.length * crimeColumns.length) - validRecords.length,
        failed: 0,
        processingTime: `${processingTime}s`
      },
      details: {
        affectedMunicipalities: affectedMunicipalities,
        affectedIndicators: affectedIndicators.map(id => indicatorKeyMap[id]),
        affectedYears: affectedYears,
        scenario: 'saps_actual'
      }
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
