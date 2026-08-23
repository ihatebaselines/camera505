/*
  ==============================================================================
    CAMERA 505 — ESP32-S + AD8232 ECG BIOMETRIC TELEMETRY FIRMWARE
    *WE DON'T SUPPORT 67*
  ==============================================================================
  Hardware Pinout:
  - ESP32-S GPIO 32  <--> AD8232 OUTPUT (ECG Analog Voltage)
  - ESP32-S GPIO 34  <--> AD8232 LO+    (Leads-Off Detection Positive)
  - ESP32-S GPIO 35  <--> AD8232 LO-    (Leads-Off Detection Negative)
  - ESP32-S 3.3V     <--> AD8232 3.3V
  - ESP32-S GND      <--> AD8232 GND
  ==============================================================================
*/

// Pin Setup for ESP-32S
const int ECG_PIN = 32;   // Connected to AD8232 OUTPUT
const int LO_PLUS = 34;   // Connected to AD8232 LO+
const int LO_MINUS = 35;  // Connected to AD8232 LO-

// Sampling configuration (50 Hz = 20ms period)
const unsigned long SAMPLE_INTERVAL_MS = 20;
unsigned long lastSampleTime = 0;

// Peak detection variables
unsigned long lastBeatTime = 0;
int threshold = 2000;
bool peakDetected = false;
float bpm = 0.0;

void setup() {
  Serial.begin(115200);
  delay(500);

  // Configure Analog & Digital Input Pins
  pinMode(ECG_PIN, INPUT);
  pinMode(LO_PLUS, INPUT);
  pinMode(LO_MINUS, INPUT);

  // Setup ESP32 ADC Resolution to 12-Bit (0-4095)
  analogReadResolution(12);

  // Ready handshake
  Serial.println("ESP-32S Ready");
}

void loop() {
  unsigned long currentTime = millis();

  // Enforce precise 50 Hz sampling rate (20ms interval)
  if (currentTime - lastSampleTime >= SAMPLE_INTERVAL_MS) {
    lastSampleTime = currentTime;

    // Check if electrodes are detached from body (Leads-Off)
    if (digitalRead(LO_PLUS) == HIGH || digitalRead(LO_MINUS) == HIGH) {
      Serial.println("Leads Off");
      bpm = 0.0;
    } else {
      int ecgValue = analogRead(ECG_PIN);

      // Real-time R-Peak Detection Algorithm
      if (ecgValue > threshold && !peakDetected) {
        peakDetected = true;
        unsigned long duration = currentTime - lastBeatTime;

        // Valid physiological HR interval (30 BPM - 200 BPM)
        if (duration > 300 && duration < 2000) {
          bpm = 60000.0 / (float)duration;
        }
        lastBeatTime = currentTime;
      }

      if (ecgValue < (threshold - 150)) {
        peakDetected = false;
      }

      // Output formatted for CAMERA 505 Ingestion Engine & Serial Plotter
      Serial.print("ECG:");
      Serial.print(ecgValue);
      Serial.print(",BPM:");
      Serial.println(bpm, 1);
    }
  }
}
