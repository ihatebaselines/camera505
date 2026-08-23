/*
  ==============================================================================
    CAMERA 505 — WIRELESS RF PROBE & BEACON TRANSMITTER (TX NODE)
    *WE DON'T SUPPORT 67* | High-Frequency Wi-Fi Multipath Generator
  ==============================================================================
  Hardware: ESP32-WROOM-32 / ESP32-S3
  Protocol: ESP-NOW High-Rate RF Broadcast (Channel 6)
  Baud Rate: 115200
  ==============================================================================
*/

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

#define C505_BEACON_CHANNEL          6
#define C505_TRANSMIT_DELAY_MS       10
#define C505_TELEMETRY_INTERVAL_MS   1000

// Universal Broadcast Address for Room-Wide RF Field Coverage
static const uint8_t C505_BROADCAST_MAC[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

static uint32_t g_c505_packet_sequence = 0;
static volatile uint32_t g_c505_tx_success_count = 0;
static volatile uint32_t g_c505_tx_error_count = 0;

/**
 * @brief Transmission completion status callback
 */
void c505_on_rf_packet_sent(const wifi_tx_info_t *tx_info, esp_now_send_status_t status) {
  if (status == ESP_NOW_SEND_SUCCESS) {
    g_c505_tx_success_count++;
  } else {
    g_c505_tx_error_count++;
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("[CAMERA 505] RF Beacon Node Initializing...");

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  WiFi.setSleep(false); // Maintain continuous active RF oscillator

  esp_err_t channel_status = esp_wifi_set_channel(C505_BEACON_CHANNEL, WIFI_SECOND_CHAN_NONE);
  Serial.printf("[CAMERA 505] RF Channel %d Assigned: %s\n", C505_BEACON_CHANNEL, esp_err_to_name(channel_status));

  if (esp_now_init() != ESP_OK) {
    Serial.println("[ERROR] ESP-NOW stack initialization failed!");
    while (true) {
      delay(1000);
    }
  }
  esp_now_register_send_cb(c505_on_rf_packet_sent);

  // Configure Broadcast Peer
  esp_now_peer_info_t beacon_peer = {};
  memcpy(beacon_peer.peer_addr, C505_BROADCAST_MAC, 6);
  beacon_peer.channel = C505_BEACON_CHANNEL;
  beacon_peer.ifidx = WIFI_IF_STA;
  beacon_peer.encrypt = false;

  esp_err_t peer_status = esp_now_add_peer(&beacon_peer);
  Serial.printf("[CAMERA 505] Broadcast Peer Added: %s\n", esp_err_to_name(peer_status));

  // Configure PHY Rate for optimal multipath resolution (MCS0 Long Guard Interval)
  esp_now_rate_config_t phy_rate_config = {};
  phy_rate_config.phymode = WIFI_PHY_MODE_HT20;
  phy_rate_config.rate = WIFI_PHY_RATE_MCS0_LGI;
  phy_rate_config.ersu = false;
  phy_rate_config.dcm = false;

  esp_now_set_peer_rate_config(C505_BROADCAST_MAC, &phy_rate_config);

  Serial.printf("[CAMERA 505] Active Transmitter MAC: %s\n", WiFi.macAddress().c_str());
  Serial.println("[CAMERA 505] RF Multipath Stream Active.");
}

void loop() {
  static uint32_t last_telemetry_time = 0;
  static uint32_t send_failure_counter = 0;

  g_c505_packet_sequence++;

  // Transmit 32-bit timestamp sequence token across the room
  if (esp_now_send(C505_BROADCAST_MAC, (uint8_t *)&g_c505_packet_sequence, sizeof(g_c505_packet_sequence)) != ESP_OK) {
    send_failure_counter++;
  }

  uint32_t now = millis();
  if (now - last_telemetry_time >= C505_TELEMETRY_INTERVAL_MS) {
    last_telemetry_time = now;

    uint8_t active_ch;
    wifi_second_chan_t sec_ch;
    esp_wifi_get_channel(&active_ch, &sec_ch);

    Serial.printf("[CAMERA 505 BEACON] seq=%u sent=%u fail=%u ch=%u\n",
                  g_c505_packet_sequence, g_c505_tx_success_count, g_c505_tx_error_count, active_ch);
  }

  delay(C505_TRANSMIT_DELAY_MS);
}
