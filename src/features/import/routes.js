const express = require('express');
const multer = require('multer');
const controller = require('./controller');

const router = express.Router();

// Configure multer for file upload (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only Excel files
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload an Excel file (.xlsx or .xls)'));
    }
  }
});

// ============================================
// Crime Statistics Import Routes
// ============================================

// GET /import/crime-stats/themes - List available themes
router.get('/import/crime-stats/themes', controller.listThemes);

// GET /import/crime-stats/template - Download Excel template
router.get('/import/crime-stats/template', controller.downloadTemplate);

// POST /import/crime-stats - Upload and import crime data
router.post('/import/crime-stats', upload.single('file'), controller.uploadCrimeStats);

// ============================================
// Socio-Economic Import Routes
// ============================================

// GET /import/socio-economic/themes - List available socio-economic themes
router.get('/import/socio-economic/themes', controller.listSocioEconomicThemes);

// GET /import/socio-economic/template - Download Excel template
router.get('/import/socio-economic/template', controller.downloadSocioEconomicTemplate);

// POST /import/socio-economic - Upload and import socio-economic data
router.post('/import/socio-economic', upload.single('file'), controller.uploadSocioEconomic);

module.exports = router;
