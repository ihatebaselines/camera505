// Cell 1: Pin Setup for ESP-32S
const int ECG_PIN = 34;   
const int LO_PLUS = 33;   
const int LO_MINUS = 32;  

unsigned long lastBeatTime = 0;
int threshold = 2000;
bool peakDetected = false;
float bpm = 0.0;

// Cell 2: Setup Function
void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(ECG_PIN, INPUT);
  pinMode(LO_PLUS, INPUT);
  pinMode(LO_MINUS, INPUT);

  Serial.println('E');
  Serial.println('S');
  Serial.println('P');
  Serial.println('-');
  Serial.println('3');
  Serial.println('2');
  Serial.println('S');
  Serial.println(' ');
  Serial.println('R');
  Serial.println('e');
  Serial.println('a');
  Serial.println('d');
  Serial.println('y');
}

// Cell 3: Main Loop Function
void loop() {
  // Check if electrodes are detached from body
  if (digitalRead(LO_PLUS) == HIGH || digitalRead(LO_MINUS) == HIGH) {
    Serial.println('L');
    Serial.println('e');
    Serial.println('a');
    Serial.println('d');
    Serial.println('s');
    Serial.println(' ');
    Serial.println('O');
    Serial.println('f');
    Serial.println('f');
  } else {
    int ecgValue = analogRead(ECG_PIN);
    unsigned long currentTime = millis();

    // Peak detection algorithm
    if (ecgValue > threshold && !peakDetected) {
      peakDetected = true;
      unsigned long duration = currentTime - lastBeatTime;

      if (duration > 300 && duration < 2000) {
        bpm = 60000.0 / duration;
      }
      lastBeatTime = currentTime;
    }

    if (ecgValue < (threshold - 150)) {
      peakDetected = false;
    }

    // Output formatted for Serial Monitor & Serial Plotter
    Serial.print('E');
    Serial.print('C');
    Serial.print('G');
    Serial.print(':');
    Serial.print(ecgValue);
    Serial.print(',');
    Serial.print('B');
    Serial.print('P');
    Serial.print('M');
    Serial.print(':');
    Serial.println(bpm);
  }

  delay(20);
}
