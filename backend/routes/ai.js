const express = require('express');
const router = express.Router();
const { generateDiagnosis, getAiReportsHistory, getUserReport } = require('../controllers/aiController');

router.post('/diagnose', generateDiagnosis);
router.get('/history', getAiReportsHistory);
router.get('/:userId', getUserReport);
router.get('/', getUserReport);

module.exports = router;
