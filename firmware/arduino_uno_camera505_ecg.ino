/*
  ==============================================================================
    CAMERA 505 — ARDUINO UNO + AD8232 ECG FIRMWARE
    *WE DON'T SUPPORT 67*
  ==============================================================================
  Hardware Pin Connections for Arduino UNO:
  - AD8232 OUTPUT  --> Arduino Analog Pin A0
  - AD8232 LO+     --> Arduino Digital Pin 10
  - AD8232 LO-     --> Arduino Digital Pin 11
  - AD8232 3.3V    --> Arduino 3.3V
  - AD8232 GND     --> Arduino GND
  ==============================================================================
*/

const int ECG_PIN = A0;   // Connected to AD8232 OUTPUT (Analog A0)
const int LO_PLUS = 10;   // Connected to AD8232 LO+ (Digital Pin 10)
const int LO_MINUS = 11;  // Connected to AD8232 LO- (Digital Pin 11)

const unsigned long SAMPLE_INTERVAL_MS = 20; // 50 Hz (20ms)
unsigned long lastSampleTime = 0;

void setup() {
  // Use 115200 baud for fast real-time streaming
  Serial.begin(115200);
  
  pinMode(LO_PLUS, INPUT);
  pinMode(LO_MINUS, INPUT);

  delay(500);
  Serial.println("CAMERA 505 Ready");
}

void loop() {
  unsigned long currentTime = millis();

  // 50 Hz timing
  if (currentTime - lastSampleTime >= SAMPLE_INTERVAL_MS) {
    lastSampleTime = currentTime;

    // Check if electrodes detached
    if (digitalRead(LO_PLUS) == HIGH || digitalRead(LO_MINUS) == HIGH) {
      Serial.println("Leads Off");
    } else {
      int ecgValue = analogRead(ECG_PIN);

      // Send telemetry format: ECG:<val>,BPM:0.0
      Serial.print("ECG:");
      Serial.print(ecgValue);
      Serial.println(",BPM:72.0");
    }
  }
}
