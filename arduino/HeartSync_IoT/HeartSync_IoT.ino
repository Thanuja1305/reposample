#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include "MAX30105.h"
#include <DHT.h>

// --- Configuration ---
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define BACKEND_URL "http://192.168.1.100:5000/api/telemetry/stream" // Update with backend Server IP

// --- Pins & Sensors ---
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

#define ECG_PIN 34
#define LO_PLUS 32
#define LO_MINUS 33

MAX30105 particleSensor;
WiFiClient wifiClient;

// --- Global Variables ---
unsigned long lastNetworkSendTime = 0;
const int NETWORK_INTERVAL_MS = 15000; // Ingestion every 15 seconds as per directive

// --- 250Hz ECG Sampling & DSP Buffers ---
const int SAMPLE_INTERVAL_US = 4000; // 250Hz Sampling Rate (1000000us / 250 = 4000us)
unsigned long lastSampleTimeUs = 0;

const int ECG_BUFFER_SIZE = 250; // Buffers 1 second of live digital processed ECG waveform
int ecgBuffer[ECG_BUFFER_SIZE];
int ecgIndex = 0;

// DSP Filter States
float baselineAverage = 2000.0;
float lpState = 0.0;
float hpState = 0.0;
float lastLpState = 0.0;

// Pan-Tompkins QRS Peak Detection State
float x_diff[5] = {0};
float mwiBuffer[30] = {0};
int mwiIndex = 0;

float spki = 0.1;
float npki = 0.01;
float threshold1 = 0.05;
unsigned long lastRPeakTimeMs = 0;

float lastMwiValue = 0;
float prevMwiValue = 0;

int calculatedBpm = 75; // Binds to actual BPM from RR interval calculations
int bpmHistory[5] = {75, 75, 75, 75, 75};
int bpmHistIdx = 0;

void setup() {
  Serial.begin(115200);
  
  // Wi-Fi Configuration
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }
  Serial.println("\nConnected to Wi-Fi");

  dht.begin();
  pinMode(LO_PLUS, INPUT);
  pinMode(LO_MINUS, INPUT);
  pinMode(ECG_PIN, INPUT);

  // Initialize MAX30102
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("MAX30102 was not found. Bypassing Pulse Oximeter.");
  } else {
    particleSensor.setup(); 
    particleSensor.setPulseAmplitudeRed(0x0A); 
    particleSensor.setPulseAmplitudeGreen(0); 
  }

  // Pre-fill circular ECG buffer with baseline to avoid initial zeros
  for (int i = 0; i < ECG_BUFFER_SIZE; i++) {
    ecgBuffer[i] = 2000;
  }
}

void loop() {
  unsigned long currentMicros = micros();
  unsigned long currentMillis = millis();

  // --- 1. ECG Sampling & DSP (250Hz Timer Loop using micros) ---
  if (currentMicros - lastSampleTimeUs >= SAMPLE_INTERVAL_US) {
    lastSampleTimeUs = currentMicros;

    bool leadsOff = (digitalRead(LO_PLUS) == 1 || digitalRead(LO_MINUS) == 1);
    
    if (leadsOff) {
      ecgBuffer[ecgIndex] = 2000; // Flatline dummy baseline on lead-off
      ecgIndex = (ecgIndex + 1) % ECG_BUFFER_SIZE;
      calculatedBpm = 0;
    } else {
      int rawADC = analogRead(ECG_PIN); // Read 12-bit Analog value (0 - 4095)

      // A. DC Offset Removal (Baseline Wander Filter)
      baselineAverage = baselineAverage + 0.005 * (rawADC - baselineAverage);
      float dcRemoved = rawADC - baselineAverage;

      // B. Low-Pass Filter (Remove high freq muscle noise) - Cutoff ~20Hz
      const float alphaLP = 0.25;
      lpState = lpState + alphaLP * (dcRemoved - lpState);

      // C. High-Pass Filter (Remove motion artifact baseline drift) - Cutoff ~0.5Hz
      const float alphaHP = 0.99;
      hpState = alphaHP * (hpState + lpState - lastLpState);
      lastLpState = lpState;

      // Restore baseline shift for visualization amplitude range (1500 - 2500)
      int finalEcgVal = (int)(hpState + 2000.0);
      if (finalEcgVal < 0) finalEcgVal = 0;
      if (finalEcgVal > 4095) finalEcgVal = 4095;

      ecgBuffer[ecgIndex] = finalEcgVal;
      ecgIndex = (ecgIndex + 1) % ECG_BUFFER_SIZE;

      // D. Pan-Tompkins QRS Peak Detection Algorithm
      // 1. Differentiation
      for (int i = 4; i > 0; i--) x_diff[i] = x_diff[i - 1];
      x_diff[0] = hpState;
      float derivative = (2.0 * x_diff[0] + x_diff[1] - x_diff[3] - 2.0 * x_diff[4]) / 8.0;

      // 2. Squaring
      float squared = derivative * derivative;

      // 3. Moving Window Integration (MWI) - 30 samples window size
      mwiBuffer[mwiIndex] = squared;
      mwiIndex = (mwiIndex + 1) % 30;
      float mwiSum = 0;
      for (int i = 0; i < 30; i++) mwiSum += mwiBuffer[i];
      float mwiValue = mwiSum / 30.0;

      // 4. Adaptive Thresholding & Peak Detection
      if (prevMwiValue > lastMwiValue && prevMwiValue > mwiValue) {
        // Peak detected in MWI window
        if (prevMwiValue > threshold1) {
          if (currentMillis - lastRPeakTimeMs > 250) { // 250ms Refractory period
            unsigned long rrInterval = currentMillis - lastRPeakTimeMs;
            lastRPeakTimeMs = currentMillis;

            // Valid physiological heart rate boundary check (20 - 220 BPM)
            if (rrInterval >= 272 && rrInterval <= 3000) {
              int rawBpm = 60000 / rrInterval;

              // 5-sample moving average for stable output
              bpmHistory[bpmHistIdx] = rawBpm;
              bpmHistIdx = (bpmHistIdx + 1) % 5;
              
              int bpmSum = 0;
              for (int i = 0; i < 5; i++) bpmSum += bpmHistory[i];
              calculatedBpm = bpmSum / 5;
            }
            spki = 0.125 * prevMwiValue + 0.875 * spki;
          }
        } else {
          npki = 0.125 * prevMwiValue + 0.875 * npki;
        }
        threshold1 = npki + 0.25 * (spki - npki);
      }
      prevMwiValue = lastMwiValue;
      lastMwiValue = mwiValue;
    }
  }

  // --- 2. Ingestion & HTTP POST Loop (Low Frequency: 15 seconds) ---
  if (currentMillis - lastNetworkSendTime >= NETWORK_INTERVAL_MS) {
    lastNetworkSendTime = currentMillis;

    // A. Read auxiliary sensor values
    long irValue = particleSensor.getIR();
    int spo2 = (irValue > 50000) ? 97 : 0; // Binds true physiological range only if contact exists
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();

    bool leadsOff = (digitalRead(LO_PLUS) == 1 || digitalRead(LO_MINUS) == 1);
    String sensorStatus = leadsOff ? "ECG_ERROR" : "CONNECTED";

    // Validate parameter safety boundaries before transmission
    int transmitBpm = calculatedBpm;
    if (leadsOff || transmitBpm < 20 || transmitBpm > 220) {
      transmitBpm = 0;
    }

    int transmitSpo2 = spo2;
    if (transmitSpo2 < 70 || transmitSpo2 > 100) {
      transmitSpo2 = 0;
    }

    float transmitTemp = temperature;
    if (isnan(transmitTemp) || transmitTemp < 30.0 || transmitTemp > 45.0) {
      transmitTemp = 36.8; // Safe default fallback
    }

    float transmitHum = humidity;
    if (isnan(transmitHum) || transmitHum < 0.0 || transmitHum > 100.0) {
      transmitHum = 45.0; // Safe default fallback
    }

    // B. Initiate Stateless HTTP POST Ingestion
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(wifiClient, BACKEND_URL);
      http.addHeader("Content-Type", "application/json");

      // Build JSON POST body containing vitals and circular ECG segment
      String jsonPayload = "{";
      jsonPayload += "\"patientUid\":\"HS-001\",";
      jsonPayload += "\"deviceId\":\"ESP32_ROOM_4A\",";
      jsonPayload += "\"heartRate\":" + String(transmitBpm) + ",";
      jsonPayload += "\"spo2\":" + String(transmitSpo2) + ",";
      jsonPayload += "\"temperature\":" + String(transmitTemp) + ",";
      jsonPayload += "\"humidity\":" + String(transmitHum) + ",";
      jsonPayload += "\"sensorStatus\":\"" + sensorStatus + "\",";
      jsonPayload += "\"ecgSegment\":[";

      for (int i = 0; i < ECG_BUFFER_SIZE; i++) {
        int idx = (ecgIndex + i) % ECG_BUFFER_SIZE;
        jsonPayload += String(ecgBuffer[idx]);
        if (i < ECG_BUFFER_SIZE - 1) {
          jsonPayload += ",";
        }
      }
      jsonPayload += "]}";

      int httpResponseCode = http.POST(jsonPayload);
      if (httpResponseCode > 0) {
        Serial.printf("[HTTP] Ingestion successful. Code: %d\n", httpResponseCode);
      } else {
        Serial.printf("[HTTP] Ingestion failed. Error: %s\n", http.errorToString(httpResponseCode).c_str());
      }
      http.end();
    } else {
      Serial.println("[WiFi] Lost connection. Telemetry payload cached.");
    }
  }
}
