/*
 * ============================================================================
 * LIFE: Multimodal Physiological Monitoring Platform
 * ESP32 + AD8232 ECG Sensor Firmware
 * ============================================================================
 * 
 * Hardware Connections:
 *   AD8232 OUTPUT  --> ESP32 GPIO 34 (or GPIO 36 / VP)
 *   AD8232 LO+     ---> ESP32 GPIO 33  (Lead-Off Positive Detection) ← matches kit
 *   AD8232 LO-     ---> ESP32 GPIO 32  (Lead-Off Negative Detection) ← matches kit
 *   AD8232 SDN     --> ESP32 3.3V    (Shutdown pin - HIGH for normal operation)
 *   AD8232 3.3V    --> ESP32 3.3V
 *   AD8232 GND     --> ESP32 GND
 *
 * Baud Rate: 115200 (recommended) or 9600
 * Sampling Frequency: 250 Hz (Default) or 500 Hz
 * 
 * Communication Protocols:
 *   1. CSV / Text Line: "val,lo_flag,timestamp_ms"
 *   2. JSON Mode: {"t": 12345, "v": 1980, "lo": 0}
 *   3. Binary Frame: [0xAA, 0x55, SEQ_L, SEQ_H, VAL_L, VAL_H, FLAGS, CHK]
 * ============================================================================
 */

#include <Arduino.h>

// ================= Pin Configuration =================
#if defined(ESP32)
  const int ECG_PIN    = 34; // ADC1 Channel 6 (GPIO 34 is ADC-only, clean for analog)
  const int LO_POS_PIN = 33; // Leads-off positive (LO+)  ← confirmed from hardware kit
  const int LO_NEG_PIN = 32; // Leads-off negative (LO-)  ← confirmed from hardware kit
  const int LED_PIN    = 2;  // Built-in status LED
#else
  // Arduino Uno / Nano fallback
  const int ECG_PIN    = A0;
  const int LO_POS_PIN = 8;
  const int LO_NEG_PIN = 9;
  const int LED_PIN    = 13;
#endif

// ================= Sampling Configuration =================
const unsigned long SAMPLING_FREQ_HZ = 250; 
const unsigned long SAMPLE_INTERVAL_US = 1000000UL / SAMPLING_FREQ_HZ; // 4000 microseconds

// Output format modes
enum OutputMode {
  FORMAT_CSV = 0,     // e.g. "2048,0,12345678"
  FORMAT_JSON = 1,    // e.g. {"t":12345,"v":2048,"lo":0}
  FORMAT_RAW = 2,     // e.g. "2048" (Plotter compatible)
  FORMAT_BINARY = 3   // 8-byte structured binary frame
};

OutputMode currentMode = FORMAT_CSV;
bool testGeneratorMode = false;
bool streamingActive = true;

// Timing and sequence state
unsigned long lastSampleTimeUs = 0;
uint16_t packetSequence = 0;
float testPhase = 0.0;

// Synthetic ECG Waveform generator (for offline verification)
int generateSyntheticECG(float phase) {
  // Synthesizes P-Q-R-S-T wave
  float val = 2048.0; // Baseline at mid-rail (12-bit ADC: 0..4095)
  float p = fmod(phase, 2.0 * PI);
  
  if (p > 0.4 && p < 0.8) {
    // P wave
    val += 150.0 * sin((p - 0.4) / 0.4 * PI);
  } else if (p >= 1.0 && p < 1.1) {
    // Q wave
    val -= 100.0 * sin((p - 1.0) / 0.1 * PI);
  } else if (p >= 1.1 && p < 1.25) {
    // R peak (sharp upward deflection)
    val += 1400.0 * sin((p - 1.1) / 0.15 * PI);
  } else if (p >= 1.25 && p < 1.35) {
    // S wave
    val -= 300.0 * sin((p - 1.25) / 0.1 * PI);
  } else if (p >= 1.6 && p < 2.2) {
    // T wave
    val += 320.0 * sin((p - 1.6) / 0.6 * PI);
  }
  
  // Add small baseline wander (respiratory modulation ~0.25 Hz)
  val += 60.0 * sin(phase * 0.18);
  // Add realistic micro-noise
  val += (float)(random(-15, 15));
  
  if (val < 0) val = 0;
  if (val > 4095) val = 4095;
  return (int)val;
}

void setup() {
  Serial.begin(115200);
  
  pinMode(LO_POS_PIN, INPUT);
  pinMode(LO_NEG_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

#if defined(ESP32)
  // Configure 12-bit ADC and 11dB attenuation (up to ~3.3V)
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
#endif

  // Initial welcome handshake
  Serial.println(F("# LIFE ESP32 AD8232 ECG System Initialized"));
  Serial.print(F("# Sampling Rate: "));
  Serial.print(SAMPLING_FREQ_HZ);
  Serial.println(F(" Hz"));
  Serial.println(F("# Commands: 'JSON', 'CSV', 'RAW', 'BIN', 'TEST_ON', 'TEST_OFF', 'START', 'STOP'"));
  
  lastSampleTimeUs = micros();
}

void handleSerialCommands() {
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();
    
    if (cmd == "JSON") {
      currentMode = FORMAT_JSON;
      Serial.println(F("# Mode set to JSON"));
    } else if (cmd == "CSV") {
      currentMode = FORMAT_CSV;
      Serial.println(F("# Mode set to CSV"));
    } else if (cmd == "RAW") {
      currentMode = FORMAT_RAW;
      Serial.println(F("# Mode set to RAW"));
    } else if (cmd == "BIN") {
      currentMode = FORMAT_BINARY;
    } else if (cmd == "TEST_ON") {
      testGeneratorMode = true;
      Serial.println(F("# Synthetic ECG Generator ENABLED"));
    } else if (cmd == "TEST_OFF") {
      testGeneratorMode = false;
      Serial.println(F("# Synthetic ECG Generator DISABLED (Reading AD8232 Pin)"));
    } else if (cmd == "START") {
      streamingActive = true;
      Serial.println(F("# Streaming STARTED"));
    } else if (cmd == "STOP") {
      streamingActive = false;
      Serial.println(F("# Streaming STOPPED"));
    }
  }
}

void loop() {
  handleSerialCommands();
  
  if (!streamingActive) {
    delay(10);
    return;
  }

  unsigned long currentUs = micros();
  if (currentUs - lastSampleTimeUs >= SAMPLE_INTERVAL_US) {
    lastSampleTimeUs += SAMPLE_INTERVAL_US;
    if (currentUs - lastSampleTimeUs > SAMPLE_INTERVAL_US) {
      lastSampleTimeUs = currentUs; // Catch up if lagging
    }
    
    packetSequence++;
    unsigned long timestampMs = millis();
    
    // Check Leads-off pins
    int loPos = digitalRead(LO_POS_PIN);
    int loNeg = digitalRead(LO_NEG_PIN);
    uint8_t leadsOffFlag = (loPos == HIGH || loNeg == HIGH) ? 1 : 0;
    
    // Read sensor or generate synthetic signal
    int ecgValue = 0;
    if (testGeneratorMode) {
      // 1.2 Hz = 72 BPM heart rate synthetic simulation
      testPhase += 2.0 * PI * 1.2 / (float)SAMPLING_FREQ_HZ;
      if (testPhase > 1000.0) testPhase = 0;
      ecgValue = generateSyntheticECG(testPhase);
      leadsOffFlag = 0;
    } else {
      if (leadsOffFlag) {
        ecgValue = 0; // Sensor lead disconnected
        digitalWrite(LED_PIN, (packetSequence % 20 < 10) ? HIGH : LOW); // Blink warning
      } else {
        ecgValue = analogRead(ECG_PIN);
        digitalWrite(LED_PIN, HIGH);
      }
    }
    
    // Transmit according to selected format
    switch (currentMode) {
      case FORMAT_CSV:
        // Format: val,leads_off,timestamp_ms,seq
        Serial.print(ecgValue);
        Serial.print(',');
        Serial.print(leadsOffFlag);
        Serial.print(',');
        Serial.print(timestampMs);
        Serial.print(',');
        Serial.println(packetSequence);
        break;
        
      case FORMAT_JSON:
        Serial.print(F("{\"t\":"));
        Serial.print(timestampMs);
        Serial.print(F(",\"v\":"));
        Serial.print(ecgValue);
        Serial.print(F(",\"lo\":"));
        Serial.print(leadsOffFlag);
        Serial.print(F(",\"seq\":"));
        Serial.print(packetSequence);
        Serial.println(F("}"));
        break;
        
      case FORMAT_RAW:
        if (leadsOffFlag) {
          Serial.println('!');
        } else {
          Serial.println(ecgValue);
        }
        break;
        
      case FORMAT_BINARY: {
        // 8-byte Binary Packet:
        // [0xAA, 0x55, SEQ_LO, SEQ_HI, VAL_LO, VAL_HI, FLAGS, CHKSUM]
        uint8_t frame[8];
        frame[0] = 0xAA;
        frame[1] = 0x55;
        frame[2] = (uint8_t)(packetSequence & 0xFF);
        frame[3] = (uint8_t)((packetSequence >> 8) & 0xFF);
        frame[4] = (uint8_t)(ecgValue & 0xFF);
        frame[5] = (uint8_t)((ecgValue >> 8) & 0xFF);
        frame[6] = leadsOffFlag;
        frame[7] = frame[2] ^ frame[3] ^ frame[4] ^ frame[5] ^ frame[6]; // XOR checksum
        Serial.write(frame, 8);
        break;
      }
    }
  }
}
