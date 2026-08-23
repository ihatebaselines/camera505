/*
 * ============================================================================
 * LIFE: Multimodal Physiological Monitoring Platform
 * ESP32 BLE GATT Telemetry Server
 * ============================================================================
 * 
 * Provides Bluetooth Low Energy (BLE) peripheral service to stream
 * live ECG telemetry directly to mobile phones or web Bluetooth without wires.
 *
 * BLE Service UUID: 4fafc201-1fb5-459e-8fcc-c5c9c331914b
 * Telemetry Characteristic UUID: beb5483e-36e1-4688-b7f5-ea07361b26a8
 * ============================================================================
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

const int ECG_PIN    = 34;
const int LO_POS_PIN = 4;
const int LO_NEG_PIN = 5;

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// 200 Hz for BLE transmission batching (10 samples per packet = 20 packets/sec)
#define SAMPLES_PER_PACKET 10
uint16_t sampleBatch[SAMPLES_PER_PACKET];
uint8_t batchIndex = 0;
uint16_t bleSequence = 0;

class ServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println(F("[BLE] Client Connected!"));
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println(F("[BLE] Client Disconnected!"));
    }
};

void setup() {
  Serial.begin(115200);
  pinMode(LO_POS_PIN, INPUT);
  pinMode(LO_NEG_PIN, INPUT);
  
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  Serial.println(F("[BLE] Initializing LIFE ECG BLE Server..."));
  BLEDevice::init("LIFE-ECG-ESP32");

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_NOTIFY |
                      BLECharacteristic::PROPERTY_INDICATE
                    );

  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);  // set value for iPhone connections
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.println(F("[BLE] Advertising started. Ready for connection!"));
}

void loop() {
  // Read sensor at ~200Hz
  int loPos = digitalRead(LO_POS_PIN);
  int loNeg = digitalRead(LO_NEG_PIN);
  bool leadsOff = (loPos == HIGH || loNeg == HIGH);
  
  uint16_t ecgVal = leadsOff ? 0 : analogRead(ECG_PIN);
  sampleBatch[batchIndex++] = ecgVal;

  if (batchIndex >= SAMPLES_PER_PACKET) {
    batchIndex = 0;
    bleSequence++;

    if (deviceConnected) {
      // Packet format: [seq_lo, seq_hi, lo_flag, num_samples, sample0_lo, sample0_hi, ...]
      uint8_t payload[4 + SAMPLES_PER_PACKET * 2];
      payload[0] = (uint8_t)(bleSequence & 0xFF);
      payload[1] = (uint8_t)((bleSequence >> 8) & 0xFF);
      payload[2] = leadsOff ? 1 : 0;
      payload[3] = SAMPLES_PER_PACKET;
      
      for (int i = 0; i < SAMPLES_PER_PACKET; i++) {
        payload[4 + i * 2]     = (uint8_t)(sampleBatch[i] & 0xFF);
        payload[4 + i * 2 + 1] = (uint8_t)((sampleBatch[i] >> 8) & 0xFF);
      }
      
      pCharacteristic->setValue(payload, sizeof(payload));
      pCharacteristic->notify();
    }
  }

  // Handle BLE reconnection state
  if (!deviceConnected && oldDeviceConnected) {
    delay(500); // Give bluetooth stack time
    pServer->startAdvertising(); // restart advertising
    Serial.println(F("[BLE] Restarting advertising..."));
    oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }

  delayMicroseconds(5000); // 200 Hz
}
