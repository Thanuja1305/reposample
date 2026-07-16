const express = require('express');
const router = express.Router();
const { generateDiagnosis, getAiReportsHistory } = require('../controllers/aiController');

router.post('/diagnose', generateDiagnosis);
router.get('/history', getAiReportsHistory);

module.exports = router;
