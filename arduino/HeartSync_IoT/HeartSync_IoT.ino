#include <WiFi.h>
#include <Wire.h>
#include <time.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include "DHT.h"
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// ═══════════════════════════════════════════════════════════════════════════
// WiFi & Firebase
// ═══════════════════════════════════════════════════════════════════════════
#define WIFI_SSID      "Thanuja"
#define WIFI_PASSWORD  "12345678"
#define FIREBASE_URL   "https://heartsync-3b608-default-rtdb.asia-southeast1.firebasedatabase.app/"
#define FIREBASE_KEY   "AIzaSyAccH7rClosmQwrreeseAmHpk3RhJN3M2I"

#define PATIENT_ID     "VZRKMomlf4V2NVG0XXCdCSCsjwn2"
#define SERIAL_NUMBER  "HS-001"
#define LOCATION_LAT   17.3850
#define LOCATION_LNG   78.4867

#define NTP_SERVER1    "pool.ntp.org"
#define NTP_SERVER2    "time.nist.gov"
#define GMT_OFFSET_SEC 19800
#define DST_OFFSET_SEC 0

// ═══════════════════════════════════════════════════════════════════════════
// Pin Definitions
// ═══════════════════════════════════════════════════════════════════════════
#define ECG_PIN     34   // ADC1 channel — safe with WiFi active
#define LO_PLUS     32
#define LO_MINUS    33
#define DHT_PIN      5
#define BUZZER_PIN  25
#define DHT_TYPE    DHT22
#define SDA_PIN     21
#define SCL_PIN     22
#define I2C_FREQ    100000

// ═══════════════════════════════════════════════════════════════════════════
// MAX30102 tuning
// ═══════════════════════════════════════════════════════════════════════════
#define MHET_LED_BRIGHTNESS  0x7F
#define MHET_SAMPLE_AVG      4
#define MHET_LED_MODE        2
#define MHET_SAMPLE_RATE     200
#define MHET_PULSE_WIDTH     411
#define MHET_ADC_RANGE       16384

#define FINGER_THRESHOLD_ABS_FALLBACK 50000UL
#define FINGER_THRESHOLD_MARGIN       25000UL
#define FINGER_THRESHOLD_FLOOR        30000UL

#define PI_MIN_PERCENT   1.0f

#define SPO2_HISTORY_LEN 5

// ═══════════════════════════════════════════════════════════════════════════
// Validation ranges
// ═══════════════════════════════════════════════════════════════════════════
#define SPO2_MIN_VALID   50
#define SPO2_MAX_VALID  100
#define TEMP_MIN_VALID  35.0
#define TEMP_MAX_VALID  42.0
#define HUM_MIN_VALID    0.0
#define HUM_MAX_VALID  100.0

// ═══════════════════════════════════════════════════════════════════════════
// Clinical Alert Thresholds — Adult defaults (18-64yr)
// ═══════════════════════════════════════════════════════════════════════════
#define BPM_NORMAL_LOW          60
#define BPM_NORMAL_HIGH        100
#define BPM_WARNING_LOW         50
#define BPM_WARNING_HIGH       120
#define BPM_CRITICAL_LOW        50
#define BPM_CRITICAL_HIGH      120
#define BPM_CRITICAL_SUSTAIN_MS 8000
#define BPM_FAULT_LOW            20
#define BPM_FAULT_HIGH          220

#define SPO2_NORMAL_LOW          95
#define SPO2_WARNING_LOW         90
#define SPO2_CRITICAL_LOW        90

#define TEMP_NORMAL_LOW        36.1
#define TEMP_NORMAL_HIGH       37.2
#define TEMP_WARNING_HIGH      38.5
#define TEMP_CRITICAL_HIGH     38.5
#define TEMP_CRITICAL_LOW      35.0

#define EXERCISE_SPO2_FLOOR      95
#define RECOVERY_WINDOW_MS   300000
#define RECOVERY_SPO2_FLOOR      92

// ═══════════════════════════════════════════════════════════════════════════
// Buffer sizes
// ═══════════════════════════════════════════════════════════════════════════
#define SPO2_BUF_LEN     100
#define ECG_BUF_SIZE      50
#define ECG_STREAM_LEN   250
#define DHT_HIST_LEN       4
#define DHT_MAX_DELTA_TEMP 5.0f
#define DHT_MAX_DELTA_HUM 15.0f

// ═══════════════════════════════════════════════════════════════════════════
// Pan-Tompkins QRS/R-peak detection config
// ═══════════════════════════════════════════════════════════════════════════
#define ECG_FS_HZ         250
#define MWI_WINDOW_N       30
#define REFRACTORY_SAMPLES ((int)(0.2 * ECG_FS_HZ))
#define BPM_MIN_SAMPLES    ((int)(60.0 * ECG_FS_HZ / 220.0))
#define BPM_MAX_SAMPLES    ((int)(60.0 * ECG_FS_HZ / 30.0))

#define SEARCHBACK_RR_MULT      1.66f
#define SEARCHBACK_THRESH_MULT  0.125f
#define NORMAL_THRESH_MULT      0.25f

#define RR_PLAUSIBILITY_FRAC    0.4f
#define RR_PLAUSIBILITY_MIN_HIST 3

// ═══════════════════════════════════════════════════════════════════════════
// Signal quality gate config
// ═══════════════════════════════════════════════════════════════════════════
#define QUALITY_WINDOW_N      250
#define QUALITY_MIN_STDDEV    3.0f
#define QUALITY_RAIL_LOW      50
#define QUALITY_RAIL_HIGH     4045
#define QUALITY_MAX_RAIL_FRAC 0.30f

// ═══════════════════════════════════════════════════════════════════════════
// Objects
// ═══════════════════════════════════════════════════════════════════════════
MAX30105     particleSensor;
DHT          dht(DHT_PIN, DHT_TYPE);
FirebaseData fbdo, fbdoHist, fbdoStream;
FirebaseAuth fbAuth;
FirebaseConfig fbConfig;

// SpO2 buffers
uint32_t irBuf[SPO2_BUF_LEN];
uint32_t redBuf[SPO2_BUF_LEN];
int      spo2Idx = 0, spo2BufCount = 0;
volatile int8_t spo2Valid = 0;

uint32_t fingerBaselineIR = 0;
uint32_t fingerThreshold  = FINGER_THRESHOLD_ABS_FALLBACK;

volatile int  newSpo2SampleCount = 0;
volatile bool spo2WindowReady    = false;

int   spo2History[SPO2_HISTORY_LEN];
bool  spo2HistValid[SPO2_HISTORY_LEN];
int   spo2HistIdx = 0, spo2HistCount = 0;

int   ecgBuf[ECG_BUF_SIZE];
int   ecgBufIdx = 0;

int      ecgStreamBuf[ECG_STREAM_LEN];
int      ecgStreamIdx = 0;
String   ecgStatusStream = "NOT_CONNECTED";
String   ecgQualityStream = "POOR_SIGNAL";
bool     ecgSignalGood = false;

struct Biquad {
  float b0, b1, b2, a1, a2;
  float x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  float process(float x) {
    float y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    return y;
  }
};
Biquad hpFilter = {0.99532387f, -1.99064774f, 0.99532387f, -1.99060302f, 0.99068293f};
Biquad lpFilter = {0.09758977f,  0.19517954f, 0.09758977f, -0.94657332f, 0.33747787f};
Biquad notchFilter = {0.96609843f, -0.61680890f, 0.96609843f, -0.61680890f, 0.93219687f};

float rawHist[5]     = {0, 0, 0, 0, 0};
float mwiRing[MWI_WINDOW_N] = {0};
int   mwiRingIdx     = 0;
float mwiSum         = 0;
uint32_t sampleCounter  = 0;
uint32_t lastPeakIdx    = 0;
bool  aboveThreshold    = false;
float peakVal           = 0;
uint32_t peakIdx        = 0;
float SPKI = 0, NPKI = 0;
bool  ptWarmedUp        = false;
uint32_t ptWarmupCount  = 0;

float avgRRSamples      = 0;
bool  searchBackActive  = false;

int   ecgBPM = 0;
int   bpmHist[8]; int bpmHIdx = 0, bpmHCount = 0;

float lastTemp = 0, lastHum = 0;
int   lastBPM  = 0, lastSPO2 = 0;
bool  fingerOn = false, leadOff = false;
bool  maxFound = false, fbReady = false;
uint32_t rawIR = 0, rawRed = 0;

float tempHist[DHT_HIST_LEN];
float humHist[DHT_HIST_LEN];
int   dhtHistIdx = 0, dhtHistCount = 0;

int    alertLevel   = 1;
bool   isAbnormal   = false, emergency = false, vitalAbnormal = false;
String alertReason  = "NORMAL", condition = "Stable";
String sensorStatus = "NOT_CONNECTED";

unsigned long bpmOutOfRangeSince = 0;
bool          bpmCriticalActive  = false;
unsigned long criticalEpisodeStart = 0;
bool          inCriticalEpisode  = false;
int           episodeMinSPO2     = 100;
bool          recoveryNoteFlag   = false;

unsigned long tDHT=0, tSPO2FB=0, tPrint=0, tAlert=0, tAnalyze=0, tEcgStream=0;

TaskHandle_t  SensorTaskHandle = NULL;
portMUX_TYPE  sensorMux        = portMUX_INITIALIZER_UNLOCKED;

int  buzzerPattern = 0, buzzerStep = 0;
unsigned long buzzerTimer = 0;

void buzzerOn()  { digitalWrite(BUZZER_PIN, HIGH); }
void buzzerOff() { digitalWrite(BUZZER_PIN, LOW);  }

void triggerBuzzer(int pattern) {
  if (buzzerPattern == 0 || pattern >= buzzerPattern) {
    buzzerPattern = pattern; buzzerStep = 0; buzzerTimer = millis();
  }
}

void updateBuzzer() {
  if (buzzerPattern == 0) { buzzerOff(); return; }
  unsigned long now = millis();
  if (now >= buzzerTimer) {
    if (buzzerPattern == 5) {
      switch (buzzerStep) {
        case 0: buzzerOn();  buzzerTimer = now + 100; buzzerStep = 1; break;
        case 1: buzzerOff(); buzzerTimer = now +  80; buzzerStep = 2; break;
        case 2: buzzerOn();  buzzerTimer = now + 100; buzzerStep = 3; break;
        case 3: buzzerOff(); buzzerTimer = now +  80; buzzerStep = 4; break;
        case 4: buzzerOn();  buzzerTimer = now + 300; buzzerStep = 5; break;
        default: buzzerOff(); buzzerPattern = 0; buzzerStep = 0; break;
      }
    } else if (buzzerPattern == 3) {
      if (buzzerStep < 6) {
        if (buzzerStep % 2 == 0) buzzerOn(); else buzzerOff();
        buzzerTimer = now + 180; buzzerStep++;
      } else { buzzerOff(); buzzerPattern = 0; buzzerStep = 0; }
    } else if (buzzerPattern == 4) {
      if (buzzerStep < 20) {
        if (buzzerStep % 2 == 0) buzzerOn(); else buzzerOff();
        buzzerTimer = now + 80; buzzerStep++;
      } else { buzzerOff(); buzzerPattern = 0; buzzerStep = 0; }
    }
  }
}

int filterECG(int raw) {
  float x = (float)raw;
  float h = hpFilter.process(x);
  float l = lpFilter.process(h);
  float n = notchFilter.process(l);
  int out = (int)(n + 2048.0f);
  if (out < 0) out = 0; if (out > 4095) out = 4095;
  return out;
}

void panTompkinsProcess(int filtered) {
  sampleCounter++;

  rawHist[4] = rawHist[3]; rawHist[3] = rawHist[2];
  rawHist[2] = rawHist[1]; rawHist[1] = rawHist[0];
  rawHist[0] = filtered;

  float deriv = (2.0f*rawHist[0] + rawHist[1] - rawHist[3] - 2.0f*rawHist[4]) / 8.0f;
  float squared = deriv * deriv;

  mwiSum -= mwiRing[mwiRingIdx];
  mwiRing[mwiRingIdx] = squared;
  mwiSum += squared;
  mwiRingIdx = (mwiRingIdx + 1) % MWI_WINDOW_N;
  float mwi = mwiSum / MWI_WINDOW_N;

  if (!ptWarmedUp) {
    ptWarmupCount++;
    NPKI = 0.9f * NPKI + 0.1f * mwi;
    if (ptWarmupCount > (uint32_t)(ECG_FS_HZ * 2)) {
      SPKI = NPKI * 4.0f;
      ptWarmedUp = true;
    }
    return;
  }

  if (!aboveThreshold && avgRRSamples > 0 && lastPeakIdx > 0) {
    uint32_t sinceLastPeak = sampleCounter - lastPeakIdx;
    if (sinceLastPeak > (uint32_t)(SEARCHBACK_RR_MULT * avgRRSamples)) {
      searchBackActive = true;
    }
  }
  float threshMult = searchBackActive ? SEARCHBACK_THRESH_MULT : NORMAL_THRESH_MULT;
  float threshold = NPKI + threshMult * (SPKI - NPKI);

  if (mwi > threshold) {
    if (!aboveThreshold) { aboveThreshold = true; peakVal = mwi; peakIdx = sampleCounter; }
    else if (mwi > peakVal) { peakVal = mwi; peakIdx = sampleCounter; }
  } else if (aboveThreshold) {
    aboveThreshold = false;
    searchBackActive = false;   
    uint32_t deltaSamples = (lastPeakIdx > 0) ? (peakIdx - lastPeakIdx) : 0;

    if (lastPeakIdx == 0) {
      lastPeakIdx = peakIdx;
      SPKI = 0.125f * peakVal + 0.875f * SPKI;
    } else if (deltaSamples < (uint32_t)REFRACTORY_SAMPLES) {
      NPKI = 0.125f * peakVal + 0.875f * NPKI;
    } else if (deltaSamples >= (uint32_t)BPM_MIN_SAMPLES && deltaSamples <= (uint32_t)BPM_MAX_SAMPLES) {
      int bpm = (int)((60.0f * ECG_FS_HZ) / (float)deltaSamples);

      bool plausible = true;
      if (bpmHCount >= RR_PLAUSIBILITY_MIN_HIST && ecgBPM > 0) {
        int diff = abs(bpm - ecgBPM);
        if (diff > (int)(RR_PLAUSIBILITY_FRAC * ecgBPM)) plausible = false;
      }

      if (plausible) {
        bpmHist[bpmHIdx % 8] = bpm; bpmHIdx++;
        bpmHCount = min(bpmHIdx, 8);
        long s = 0; for (int i = 0; i < bpmHCount; i++) s += bpmHist[i];
        ecgBPM = (int)(s / bpmHCount);
        avgRRSamples = (avgRRSamples <= 0) ? (float)deltaSamples
                                            : (0.875f * avgRRSamples + 0.125f * (float)deltaSamples);
        Serial.println("Filtered ECG: " + String(filtered));
        Serial.println("R-peak dSamples=" + String(deltaSamples) +
                        " instantBPM=" + String(bpm) + " avgBPM=" + String(ecgBPM));
      } else {
        Serial.println("[PT] Implausible RR jump (instant=" + String(bpm) +
                        " vs avg=" + String(ecgBPM) + ") - discarded from BPM average");
      }

      SPKI = 0.125f * peakVal + 0.875f * SPKI;
      lastPeakIdx = peakIdx;
    } else {
      NPKI = 0.125f * peakVal + 0.875f * NPKI;
    }
  }
}

bool checkEcgQuality(int *buf, int len, String &qualityOut) {
  if (len == 0) { qualityOut = "POOR_SIGNAL"; return false; }
  long sum = 0;
  int mn = 4095, mx = 0, railCount = 0;
  for (int i = 0; i < len; i++) {
    sum += buf[i];
    if (buf[i] < mn) mn = buf[i];
    if (buf[i] > mx) mx = buf[i];
    if (buf[i] <= QUALITY_RAIL_LOW || buf[i] >= QUALITY_RAIL_HIGH) railCount++;
  }
  float mean = (float)sum / len;
  float variance = 0;
  for (int i = 0; i < len; i++) { float d = buf[i] - mean; variance += d * d; }
  variance /= len;
  float stddev = sqrtf(variance);
  float railFrac = (float)railCount / len;

  bool flat   = (stddev < QUALITY_MIN_STDDEV);
  bool railed = (railFrac > QUALITY_MAX_RAIL_FRAC);

  if (flat || railed) { qualityOut = "POOR_SIGNAL"; return false; }
  qualityOut = "GOOD";
  return true;
}

void updateEcgQuality() {
  int buf[ECG_STREAM_LEN];
  String status, quality;
  portENTER_CRITICAL(&sensorMux);
  for (int i = 0; i < ECG_STREAM_LEN; i++) buf[i] = ecgStreamBuf[i];
  status = sensorStatus;
  portEXIT_CRITICAL(&sensorMux);

  bool ok = checkEcgQuality(buf, ECG_STREAM_LEN, quality);
  ecgQualityStream = quality;
  ecgStatusStream  = leadOff ? "NOT_CONNECTED" : status;
  ecgSignalGood = ok && !leadOff;
}

bool computeSpo2Window(uint32_t *ir, uint32_t *red, int len, int &spo2Out, float &piOut) {
  int32_t sv = 0; int8_t svi = 0, hrvi = 0; int32_t hv = 0;
  maxim_heart_rate_and_oxygen_saturation(ir, len, red, &sv, &svi, &hv, &hrvi);
  if (sv > 100) sv = 100;

  uint32_t mn = 0xFFFFFFFFUL, mx = 0;
  double sum = 0;
  for (int i = 0; i < len; i++) {
    if (ir[i] < mn) mn = ir[i];
    if (ir[i] > mx) mx = ir[i];
    sum += ir[i];
  }
  double dc = sum / len;
  double ac = (double)(mx - mn);
  piOut = (dc > 0) ? (float)((ac / dc) * 100.0) : 0.0f;

  bool valid = svi && sv >= SPO2_MIN_VALID && sv <= SPO2_MAX_VALID;
  bool goodPerfusion = piOut >= PI_MIN_PERCENT;

  if (!valid) {
    Serial.println("[SpO2] Window invalid (algorithm flag) - discarded");
    return false;
  }
  if (!goodPerfusion) {
    Serial.println("[SpO2] Window discarded - low perfusion index (" + String(piOut, 2) + "%)");
    return false;
  }

  spo2Out = sv;
  return true;
}

void updateSensorStatus() {
  portENTER_CRITICAL(&sensorMux);
  bool fin = fingerOn; bool lo = leadOff;
  portEXIT_CRITICAL(&sensorMux);

  if (!maxFound)      sensorStatus = "NOT_CONNECTED";
  else if (!fin)       sensorStatus = "NO_FINGER";
  else if (lo)          sensorStatus = "ECG_NOT_CONNECTED";
  else                   sensorStatus = "CONNECTED";
}

void analyzeMedical() {
  unsigned long now = millis();
  alertLevel = 1; isAbnormal = false; vitalAbnormal = false;
  emergency = false; alertReason = "NORMAL"; condition = "Stable";
  recoveryNoteFlag = false;

  portENTER_CRITICAL(&sensorMux);
  int lb = lastBPM; int ls = lastSPO2; bool sv = spo2Valid; bool lo = leadOff;
  portEXIT_CRITICAL(&sensorMux);
  float lt = lastTemp;

  bool bpmFault = (lb != 0 && (lb < BPM_FAULT_LOW || lb > BPM_FAULT_HIGH));
  if (bpmFault) {
    portENTER_CRITICAL(&sensorMux); lastBPM = 0; portEXIT_CRITICAL(&sensorMux);
    lb = 0;
    Serial.println("[FAULT] BPM out of hardware-plausible range - packet rejected");
  }

  if (lb != 0 && !ecgSignalGood) {
    portENTER_CRITICAL(&sensorMux); lastBPM = 0; portEXIT_CRITICAL(&sensorMux);
    lb = 0;
    Serial.println("[QUALITY] ECG signal poor - BPM suppressed until signal is clean");
  }

  int bpmZone = 0, spo2Zone = 0;
  bool bpmOutOfNormal = (lb > 0) && (lb < BPM_NORMAL_LOW || lb > BPM_NORMAL_HIGH);

  bool bpmInCriticalRange = (lb > 0) && (lb < BPM_CRITICAL_LOW || lb > BPM_CRITICAL_HIGH);
  if (bpmInCriticalRange) {
    if (bpmOutOfRangeSince == 0) bpmOutOfRangeSince = now;
    bpmCriticalActive = (now - bpmOutOfRangeSince >= BPM_CRITICAL_SUSTAIN_MS);
  } else { bpmOutOfRangeSince = 0; bpmCriticalActive = false; }

  if (lb > 0) {
    if (bpmCriticalActive) bpmZone = 2;
    else if (bpmOutOfNormal) bpmZone = 1;
  }

  if (sv && ls > 0) {
    if (ls < SPO2_CRITICAL_LOW) spo2Zone = 2;
    else if (ls < SPO2_NORMAL_LOW) spo2Zone = 1;
  }

  bool exercisePattern = (lb > BPM_NORMAL_HIGH && lb <= 140) && sv && ls >= EXERCISE_SPO2_FLOOR;
  if (exercisePattern && bpmZone == 2) bpmZone = 1;

  bool currentlyCritical = (bpmZone == 2) || (spo2Zone == 2);
  if (currentlyCritical) {
    if (!inCriticalEpisode) { inCriticalEpisode = true; criticalEpisodeStart = now; episodeMinSPO2 = (sv ? ls : 100); }
    if (sv && ls < episodeMinSPO2) episodeMinSPO2 = ls;
  } else if (inCriticalEpisode) {
    unsigned long episodeDuration = now - criticalEpisodeStart;
    if (episodeDuration <= RECOVERY_WINDOW_MS && episodeMinSPO2 >= RECOVERY_SPO2_FLOOR) {
      recoveryNoteFlag = true;
      Serial.println("[RECOVERY] Normalized within window - recovery_note flagged");
    }
    inCriticalEpisode = false; episodeMinSPO2 = 100;
  }

  if (bpmZone == 2) {
    alertLevel = 3; isAbnormal = true; vitalAbnormal = true; condition = "Critical";
    alertReason = "CRITICAL_BPM:" + String(lb) + "_sustained8s";
  } else if (bpmZone == 1) {
    if (alertLevel < 2) { alertLevel = 2; isAbnormal = true; }
    if (alertReason == "NORMAL") alertReason = "WARNING_BPM:" + String(lb);
    if (condition == "Stable") condition = "Warning";
  }

  if (spo2Zone == 2) {
    alertLevel = max(alertLevel, 3); isAbnormal = true; vitalAbnormal = true; condition = "Critical";
    if (alertReason == "NORMAL" || !alertReason.startsWith("CRITICAL"))
      alertReason = "CRITICAL_SPO2:" + String(ls) + "%";
  } else if (spo2Zone == 1) {
    if (alertLevel < 2) { alertLevel = 2; isAbnormal = true; }
    if (alertReason == "NORMAL") alertReason = "WARNING_SPO2:" + String(ls) + "%";
    if (condition == "Stable") condition = "Warning";
  }

  if (lt > 0) {
    if (lt > TEMP_CRITICAL_HIGH || lt < TEMP_CRITICAL_LOW) {
      if (alertReason == "NORMAL") alertReason = "TEMP_OUT_OF_RANGE:" + String(lt, 1) + "C";
    } else if (lt > TEMP_NORMAL_HIGH) {
      Serial.println("[LOG] Temp warning zone (no buzzer): " + String(lt, 1) + "C");
    }
  }

  bool trueEmergency =
      (bpmZone >= 1 && spo2Zone == 2 && !exercisePattern) ||
      (lb > 0 && lb < BPM_CRITICAL_LOW && bpmCriticalActive);
  if (trueEmergency) {
    alertLevel = 4; emergency = true; isAbnormal = true; vitalAbnormal = true;
    condition = "Emergency";
    alertReason = "EMERGENCY_PATTERN_BPM:" + String(lb) + "_SPO2:" + String(ls) + "%";
  }

  if (!lo && ecgBPM == 0 && sampleCounter > (uint32_t)(ECG_FS_HZ * 5)) {
    if (alertReason == "NORMAL") alertReason = "WEAK_ECG_SIGNAL_CHECK_ELECTRODES";
  }

  updateSensorStatus();

  if (now - tAlert > 10000 && vitalAbnormal) {
    if (alertLevel == 4) { tAlert = now; triggerBuzzer(4); Serial.println("!!! EMERGENCY !!!"); }
    else if (alertLevel == 3) { tAlert = now; triggerBuzzer(3); Serial.println("!! CRITICAL !!"); }
    else if (alertLevel == 2) { tAlert = now; triggerBuzzer(3); Serial.println("!! WARNING !!"); }
  }
}

void sendFirebase() {
  if (!fbReady || !Firebase.ready()) return;

  portENTER_CRITICAL(&sensorMux);
  int lb = lastBPM; int ls = lastSPO2;
  int buf[ECG_BUF_SIZE]; int bi = ecgBufIdx;
  for (int i = 0; i < ECG_BUF_SIZE; i++) buf[i] = ecgBuf[i];
  portEXIT_CRITICAL(&sensorMux);

  FirebaseJsonArray ecgArr;
  for (int i = 0; i < ECG_BUF_SIZE; i++) ecgArr.add(buf[(bi + i) % ECG_BUF_SIZE]);

  time_t nowEpoch = time(nullptr);

  FirebaseJson loc;
  loc.set("lat", LOCATION_LAT); loc.set("lng", LOCATION_LNG);

  FirebaseJson live;
  live.set("serialNumber",  SERIAL_NUMBER);
  live.set("bpm",           lb);
  live.set("spo2",          ls);
  live.set("temperature",   lastTemp);
  live.set("humidity",      lastHum);
  live.set("ecg",           ecgArr);
  live.set("sensorStatus",  sensorStatus);
  live.set("alertLevel",    alertLevel);
  live.set("isAbnormal",    isAbnormal);
  live.set("vitalAbnormal", vitalAbnormal);
  live.set("emergency",     emergency);
  live.set("alertReason",   alertReason);
  live.set("condition",     condition);
  live.set("recovery_note", recoveryNoteFlag);
  live.set("location",      loc);
  live.set("timestamp",     (double)nowEpoch);

  String livePath = "/users/" + String(PATIENT_ID) + "/liveReading";
  if (Firebase.RTDB.setJSON(&fbdo, livePath.c_str(), &live))
    Serial.println("[Firebase] Sent (15s cycle)");
  else
    Serial.println("[Firebase] ERROR " + fbdo.errorReason());

  FirebaseJson hist;
  hist.set("bpm",          lb);
  hist.set("spo2",         ls);
  hist.set("temperature",  lastTemp);
  hist.set("humidity",     lastHum);
  hist.set("sensorStatus", sensorStatus);
  hist.set("alertLevel",   alertLevel);
  hist.set("alertReason",  alertReason);
  hist.set("condition",    condition);
  hist.set("timestamp",    (double)nowEpoch);
  Firebase.RTDB.pushJSON(&fbdoHist,
    "/users/" + String(PATIENT_ID) + "/readingsHistory", &hist);
}

void sendEcgStream() {
  if (!fbReady || !Firebase.ready()) return;

  int buf[ECG_STREAM_LEN];
  int idx;
  String status, quality;
  portENTER_CRITICAL(&sensorMux);
  for (int i = 0; i < ECG_STREAM_LEN; i++) buf[i] = ecgStreamBuf[i];
  idx = ecgStreamIdx;
  status = sensorStatus;
  portEXIT_CRITICAL(&sensorMux);

  bool ok = checkEcgQuality(buf, ECG_STREAM_LEN, quality);
  ecgQualityStream = quality;
  ecgStatusStream  = leadOff ? "NOT_CONNECTED" : status;

  FirebaseJson stream;
  stream.set("samplingRate", ECG_FS_HZ);
  stream.set("timestamp", (double)time(nullptr));
  stream.set("ecgStatus", leadOff ? "NOT_CONNECTED" : status);
  stream.set("ecgQuality", quality);

  if (!leadOff && ok) {
    FirebaseJsonArray arr;
    for (int i = 0; i < ECG_STREAM_LEN; i++) arr.add(buf[(idx + i) % ECG_STREAM_LEN]);
    stream.set("ecg", arr);
  }

  String path = "/users/" + String(PATIENT_ID) + "/liveReading/ecgStream";
  if (!Firebase.RTDB.setJSON(&fbdoStream, path.c_str(), &stream)) {
    Serial.println("[Firebase] ecgStream ERROR " + fbdoStream.errorReason());
  }
}

void printObject() {
  portENTER_CRITICAL(&sensorMux);
  int lb = lastBPM; int ls = lastSPO2;
  bool lf = fingerOn; bool ll = leadOff; uint32_t lir = rawIR;
  portEXIT_CRITICAL(&sensorMux);

  Serial.println("\nHEARTSYNC v9.2 | quality-gated BPM + PI-gated SpO2 + adaptive finger detect");
  Serial.println("bpm (ECG)      : " + String(lb) + " bpm");
  Serial.println("spo2 (PPG)     : " + String(ls) + "%  (avg of " + String(spo2HistCount) + " windows)");
  Serial.println("temperature    : " + String(lastTemp, 1) + "C  (avg of " + String(dhtHistCount) + ")");
  Serial.println("humidity       : " + String(lastHum, 1) + "%");
  Serial.println("fingerOn       : " + String(lf ? "true" : "false") + "  IR=" + String(lir) +
                  "  thresh=" + String(fingerThreshold));
  Serial.println("leadOff        : " + String(ll ? "true" : "false"));
  Serial.println("sensorStatus   : " + sensorStatus);
  Serial.println("ecgQuality     : " + ecgQualityStream);
  Serial.println("alertLevel     : L" + String(alertLevel));
  Serial.println("alertReason    : " + alertReason);
  Serial.println("condition      : " + condition);
}

#define ECG_LIVE_DECIMATE 4
static uint32_t ecgLiveTick = 0;

void SensorTask(void *pvParameters) {
  TickType_t xLast = xTaskGetTickCount();
  for (;;) {
    int raw  = analogRead(ECG_PIN);
    int pv   = digitalRead(LO_PLUS);
    int mv   = digitalRead(LO_MINUS);
    bool lo  = (pv == HIGH || mv == HIGH);
    int rawClamped = lo ? 0 : raw;

    int filtered = 0;
    if (rawClamped > 0) {
      filtered = filterECG(rawClamped);
      panTompkinsProcess(filtered);
    } else {
      filtered = 2048;
    }

    portENTER_CRITICAL(&sensorMux);
    leadOff = lo;
    if (rawClamped > 0) {
      ecgBuf[ecgBufIdx] = filtered; ecgBufIdx = (ecgBufIdx + 1) % ECG_BUF_SIZE;
      ecgStreamBuf[ecgStreamIdx] = filtered; ecgStreamIdx = (ecgStreamIdx + 1) % ECG_STREAM_LEN;
    }
    lastBPM = ecgBPM;
    portEXIT_CRITICAL(&sensorMux);

    ecgLiveTick++;
    if (ecgLiveTick % ECG_LIVE_DECIMATE == 0) {
      Serial.println(lo ? "ECG:0" : ("ECG:" + String(filtered)));
    }

    if (maxFound) {
      particleSensor.check();
      while (particleSensor.available()) {
        uint32_t ir  = particleSensor.getIR();
        uint32_t red = particleSensor.getRed();
        particleSensor.nextSample();

        bool fin = (ir > fingerThreshold);

        portENTER_CRITICAL(&sensorMux);
        fingerOn = fin;
        rawIR = ir; rawRed = red;
        irBuf[spo2Idx]  = ir;
        redBuf[spo2Idx] = red;
        spo2Idx = (spo2Idx + 1) % SPO2_BUF_LEN;
        if (spo2BufCount < SPO2_BUF_LEN) spo2BufCount++;

        newSpo2SampleCount++;
        if (newSpo2SampleCount >= SPO2_BUF_LEN) {
          newSpo2SampleCount = 0;
          spo2WindowReady = true;
        }
        portEXIT_CRITICAL(&sensorMux);
      }
    }

    updateBuzzer();
    vTaskDelayUntil(&xLast, pdMS_TO_TICKS(4));
  }
}

void pollSpo2Window() {
  bool ready, fin;
  portENTER_CRITICAL(&sensorMux);
  ready = spo2WindowReady;
  fin   = fingerOn;
  if (ready) spo2WindowReady = false;
  portEXIT_CRITICAL(&sensorMux);

  if (!ready || !fin) return;

  uint32_t tIR[SPO2_BUF_LEN], tRed[SPO2_BUF_LEN];
  portENTER_CRITICAL(&sensorMux);
  for (int i = 0; i < SPO2_BUF_LEN; i++) {
    tIR[i]  = irBuf[(spo2Idx  + i) % SPO2_BUF_LEN];
    tRed[i] = redBuf[(spo2Idx + i) % SPO2_BUF_LEN];
  }
  portEXIT_CRITICAL(&sensorMux);

  int spo2Val; float pi;
  if (computeSpo2Window(tIR, tRed, SPO2_BUF_LEN, spo2Val, pi)) {
    spo2History[spo2HistIdx] = spo2Val;
    spo2HistValid[spo2HistIdx] = true;
    spo2HistIdx = (spo2HistIdx + 1) % SPO2_HISTORY_LEN;
    if (spo2HistCount < SPO2_HISTORY_LEN) spo2HistCount++;
    Serial.println("[SpO2] Window ok: " + String(spo2Val) + "%  PI=" + String(pi, 2) + "%");
  }
}

void resolveSpo2Report() {
  if (spo2HistCount == 0) {
    portENTER_CRITICAL(&sensorMux);
    lastSPO2 = 0; spo2Valid = 0;
    portEXIT_CRITICAL(&sensorMux);
  } else {
    long sum = 0;
    for (int i = 0; i < spo2HistCount; i++) sum += spo2History[i];
    int avg = (int)(sum / spo2HistCount);
    portENTER_CRITICAL(&sensorMux);
    lastSPO2 = avg; spo2Valid = 1;
    portEXIT_CRITICAL(&sensorMux);
    Serial.println("[SpO2] Reporting average of " + String(spo2HistCount) + " window(s): " + String(avg) + "%");
  }

  spo2HistCount = 0; spo2HistIdx = 0;
  for (int i = 0; i < SPO2_HISTORY_LEN; i++) spo2HistValid[i] = false;
}

void pushDhtReading(float t, float h) {
  if (dhtHistCount > 0) {
    float dt = fabs(t - lastTemp);
    float dh = fabs(h - lastHum);
    if (dt > DHT_MAX_DELTA_TEMP || dh > DHT_MAX_DELTA_HUM) {
      Serial.println("[DHT] Glitch rejected: t=" + String(t,1) + "C h=" + String(h,1) +
                      "% (jumped too far from last accepted reading)");
      return;
    }
  }
  tempHist[dhtHistIdx] = t;
  humHist[dhtHistIdx]  = h;
  dhtHistIdx = (dhtHistIdx + 1) % DHT_HIST_LEN;
  if (dhtHistCount < DHT_HIST_LEN) dhtHistCount++;

  float ts = 0, hs = 0;
  for (int i = 0; i < dhtHistCount; i++) { ts += tempHist[i]; hs += humHist[i]; }
  lastTemp = ts / dhtHistCount;
  lastHum  = hs / dhtHistCount;
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n=== HEARTSYNC v9.2 | Quality-gated BPM + PI-gated SpO2 + adaptive finger detect ===");

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  memset(ecgBuf, 0, sizeof(ecgBuf));
  memset(ecgStreamBuf, 0, sizeof(ecgStreamBuf));
  memset(spo2HistValid, 0, sizeof(spo2HistValid));
  pinMode(LO_PLUS,    INPUT);
  pinMode(LO_MINUS,   INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  buzzerOff();

  Serial.print("[WiFi] Connecting");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print("."); }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected " + WiFi.localIP().toString());
    configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, NTP_SERVER1, NTP_SERVER2);
  } else {
    Serial.println("\n[WiFi] Offline - running local-only");
  }

  if (WiFi.status() == WL_CONNECTED) {
    fbConfig.api_key      = FIREBASE_KEY;
    fbConfig.database_url = FIREBASE_URL;
    fbConfig.token_status_callback = tokenStatusCallback;

    if (Firebase.signUp(&fbConfig, &fbAuth, "", "")) { Serial.println("[Firebase] Auth OK"); fbReady = true; }
    else Serial.println("[Firebase] Auth FAILED " + String(fbConfig.signer.signupError.message.c_str()));
    Firebase.begin(&fbConfig, &fbAuth);
    Firebase.reconnectWiFi(true);
    fbdo.setResponseSize(4096);
    fbdoHist.setResponseSize(4096);
    fbdoStream.setResponseSize(8192);
    Serial.print("[Firebase] Waiting");
    for (int i = 0; i < 20 && !Firebase.ready(); i++) { delay(500); Serial.print("."); }
    if (Firebase.ready()) { Serial.println(" Ready!"); fbReady = true; }
    else Serial.println(" Timeout - will retry in loop()");
  }

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(I2C_FREQ);
  Serial.print("[I2C] Scanning: ");
  int found = 0;
  for (byte a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) { Serial.print("0x"); Serial.print(a, HEX); Serial.print(" "); found++; }
  }
  Serial.println(found == 0 ? "NONE! Check wiring" : "OK (expect 0x57)");

  Serial.print("[MAX30102] Init... ");
  if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    Serial.println("NOT FOUND!");
    maxFound = false;
  } else {
    particleSensor.setup(MHET_LED_BRIGHTNESS, MHET_SAMPLE_AVG, MHET_LED_MODE,
                          MHET_SAMPLE_RATE, MHET_PULSE_WIDTH, MHET_ADC_RANGE);
    particleSensor.setPulseAmplitudeRed(MHET_LED_BRIGHTNESS);
    particleSensor.setPulseAmplitudeIR(MHET_LED_BRIGHTNESS);
    particleSensor.setPulseAmplitudeGreen(0);
    particleSensor.setPROXINTTHRESH(0);

    Serial.print("Calibrating finger-detect baseline (keep finger OFF sensor)");
    uint64_t irSum = 0; int irSamples = 0;
    for (int i = 0; i < 100; i++) {
      while (!particleSensor.available()) particleSensor.check();
      uint32_t ir = particleSensor.getIR();
      irSum += ir; irSamples++;
      particleSensor.nextSample();
      if (i % 25 == 0) Serial.print(".");
    }
    fingerBaselineIR = (irSamples > 0) ? (uint32_t)(irSum / irSamples) : 0;
    uint32_t adaptive = fingerBaselineIR + FINGER_THRESHOLD_MARGIN;
    fingerThreshold = max(adaptive, (uint32_t)FINGER_THRESHOLD_FLOOR);
    maxFound = true;
    Serial.println(" Ready! Baseline IR=" + String(fingerBaselineIR) +
                    "  fingerThreshold=" + String(fingerThreshold) +
                    "  Place fingertip on RED/IR window");
  }

  Serial.print("[DHT] Init (check DHT_TYPE/DHT_PIN match your physical sensor)... ");
  dht.begin();
  delay(2500);
  for (int i = 0; i < 8; i++) {
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && !isnan(h)) {
      pushDhtReading(t, h);
      Serial.println(String(t,1) + "C  " + String(h,1) + "%");
      break;
    }
    delay(700);
  }

  Serial.print("[ECG AD8232] GPIO" + String(ECG_PIN) + " = ");
  int ev = analogRead(ECG_PIN);
  Serial.println(ev > 4090 ? "FLOATING! Check RA/LA/RL electrode wiring" : (String(ev) + " OK"));

  xTaskCreatePinnedToCore(SensorTask, "SensorTask", 4096, NULL, 3, &SensorTaskHandle, 0);
  triggerBuzzer(5);

  Serial.println("\n[LIVE] ECG@250Hz filtered  R-peak=quality-gated  Summary=1s  ecgStream=1s  SpO2=continuous/avg every 15s");
  Serial.println("=====================================================");
}

void loop() {
  unsigned long now = millis();

  pollSpo2Window();

  if (now - tEcgStream >= 1000) {
    tEcgStream = now;
    updateEcgQuality();
    sendEcgStream();
  }

  if (now - tSPO2FB >= 15000) {
    tSPO2FB = now;
    resolveSpo2Report();
    analyzeMedical();
    sendFirebase();
  }

  portENTER_CRITICAL(&sensorMux);
  bool lf = fingerOn;
  portEXIT_CRITICAL(&sensorMux);
  if (!lf) {
    portENTER_CRITICAL(&sensorMux);
    lastSPO2 = 0; spo2Valid = 0;
    portEXIT_CRITICAL(&sensorMux);
  }

  if (now - tDHT >= 10000) {
    tDHT = now;
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && t >= TEMP_MIN_VALID && t <= TEMP_MAX_VALID &&
        !isnan(h) && h >= HUM_MIN_VALID  && h <= HUM_MAX_VALID) {
      pushDhtReading(t, h);
    }
  }

  if (WiFi.status() == WL_CONNECTED && !fbReady && Firebase.ready()) fbReady = true;

  if (now - tAnalyze >= 200)  { tAnalyze = now; analyzeMedical(); }
  if (now - tPrint   >= 1000) { tPrint   = now; printObject();    }

  delay(2);
}
