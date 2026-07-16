const express = require('express');
const router = express.Router();
const { 
  handleEmergencyAlert, 
  handleCallAmbulance,
  getEmergencyHistory,
  resolveEmergencyAlert
} = require('../controllers/emergencyController');

router.post('/send-alert', handleEmergencyAlert);
router.post('/call-ambulance', handleCallAmbulance);
router.get('/history', getEmergencyHistory);
router.post('/resolve', resolveEmergencyAlert);

module.exports = router;
