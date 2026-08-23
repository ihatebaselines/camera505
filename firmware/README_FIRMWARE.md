# 🔌 LIFE Hardware & Firmware Setup Guide

This guide describes how to connect the **AD8232 Single-Lead ECG Front-End** to the **ESP32 Microcontroller** and flash the firmware.

---

## 1. Pin Connections

| AD8232 ECG Pin | ESP32 Pin | Description |
| :--- | :--- | :--- |
| **OUTPUT** | **GPIO 34** (or `GPIO 36 / VP`) | Analog ECG signal (0 - 3.3V) |
| **LO+** | **GPIO 4** (or `GPIO 8`) | Leads-off detector Positive |
| **LO-** | **GPIO 5** (or `GPIO 9`) | Leads-off detector Negative |
| **SDN** | **3.3V** | Shutdown control (Connect to 3.3V to keep sensor active) |
| **3.3V** | **3.3V** | Sensor power supply |
| **GND** | **GND** | Ground reference |

> [!NOTE]
> On the ESP32, **GPIO 34, 35, 36, and 39** are input-only pins connected directly to ADC1, making them the cleanest analog pins with zero Wi-Fi/Bluetooth interference.

---

## 2. Electrode Placement (3-Lead Einthoven Setup)

Your AD8232 cable has 3 color-coded electrode snap leads:

```
          [ RA ]  (Red / Right Clavicle)        [ LA ] (Yellow / Left Clavicle)
             \                                    /
              \                                  /
               \               ❤️               /
                \            HEART             /
                 \                            /
                  \                          /
                   \                        /
                    \                      /
                     \                    /
                      [ RL / COM ] (Green / Right Lower Rib / Hip)
```

1. **RA (Right Arm / Red)**: Place under the right clavicle (collarbone).
2. **LA (Left Arm / Yellow)**: Place under the left clavicle.
3. **RL (Right Leg / Reference / Green)**: Place on the lower right abdomen/rib cage as a ground reference.

---

## 3. How to Flash the Firmware

1. Open the [Arduino IDE](https://www.arduino.cc/en/software).
2. Install the **ESP32 board package** (via Boards Manager: `esp32 by Espressif Systems`).
3. Select board: **ESP32 Dev Module** (or your specific board model).
4. Connect the ESP32 to your PC using the blue micro-USB / USB-C cable.
5. Select the correct **COM Port** (e.g. `COM3`, `COM4`, etc.).
6. Open `life_esp32_ad8232.ino` and click **Upload**.
7. Open the Serial Monitor at **115200 baud** to see real-time streaming data.

---

## 4. Testing without Electrodes

If electrodes are not attached yet, send the command:
```text
TEST_ON
```
in the Serial Monitor. The firmware will generate a synthetic 72 BPM human cardiac waveform with respiratory sinus arrhythmia and baseline modulation for immediate end-to-end testing!
Send `TEST_OFF` to return to live analog sensor reading.
