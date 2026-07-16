const express = require('express');
const router = express.Router();
const { getTelemetryHistory, addTelemetryEntry } = require('../controllers/telemetryController');

router.get('/history', getTelemetryHistory);
router.post('/log', addTelemetryEntry);

module.exports = router;
