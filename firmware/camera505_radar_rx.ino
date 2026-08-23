/*
  ==============================================================================
    CAMERA 505 — CONTACTLESS RF RESPIRATORY & BIOMETRIC RADAR (RX NODE)
    *WE DON'T SUPPORT 67* | Universal Wireless Sleep Sensing Engine
  ==============================================================================
  Hardware: ESP32-WROOM-32 / ESP32-S3
  Protocol: 802.11n Subcarrier Orthogonal CSI RF Perturbation Matrix
  Baud Rate: 921600 (High-Throughput Direct Ingestion)
  ==============================================================================
*/

#include <WiFi.h>
#include <esp_wifi.h>

#define C505_RADAR_RF_CHANNEL        6
#define C505_SERIAL_BAUD_RATE        921600
#define C505_HEARTBEAT_INTERVAL_MS   1000

// Paired CAMERA 505 Transmitter Beacon Node MAC Address
static const uint8_t C505_TARGET_BEACON_MAC[6] = {0x88, 0x13, 0xBF, 0x0D, 0xD0, 0x14};

static volatile uint32_t g_c505_total_frames = 0;
static volatile uint32_t g_c505_matched_frames = 0;
static uint8_t g_c505_last_observed_mac[6] = {0};

/**
 * @brief High-frequency callback invoked on every subcarrier multipath RF disturbance
 */
void c505_on_channel_state_frame(void *ctx, wifi_csi_info_t *csi_payload) {
  g_c505_total_frames++;
  memcpy(g_c505_last_observed_mac, csi_payload->mac, 6);

  const int8_t *rf_subcarriers = csi_payload->buf;
  if (!rf_subcarriers || csi_payload->len <= 0) {
    return;
  }

  // Filter frames originating strictly from our paired CAMERA 505 transmitter
  if (memcmp(csi_payload->mac, C505_TARGET_BEACON_MAC, 6) != 0) {
    return;
  }
  g_c505_matched_frames++;

  // Stream raw RF subcarrier matrix: timestamp,rssi,len,subcarrier0;subcarrier1;...
  Serial.printf("%lu,%d,%d,", millis(), csi_payload->rx_ctrl.rssi, csi_payload->len);
  for (int i = 0; i < csi_payload->len; ++i) {
    Serial.print(rf_subcarriers[i]);
    if (i < csi_payload->len - 1) {
      Serial.print(';');
    }
  }
  Serial.println();
}

/**
 * @brief Promiscuous packet sniffer hook
 */
void c505_promiscuous_packet_hook(void *buf, wifi_promiscuous_pkt_type_t pkt_type) {
  // Pass-through for physical layer sniffer
}

void setup() {
  Serial.begin(C505_SERIAL_BAUD_RATE);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  // Configure Promiscuous Sniffer Filter for Management and Data RF Frames
  wifi_promiscuous_filter_t rf_filter = {};
  rf_filter.filter_mask = WIFI_PROMIS_FILTER_MASK_MGMT | WIFI_PROMIS_FILTER_MASK_DATA;

  esp_wifi_set_promiscuous(true);
  esp_wifi_set_promiscuous_filter(&rf_filter);
  esp_wifi_set_promiscuous_rx_cb(c505_promiscuous_packet_hook);
  esp_wifi_set_channel(C505_RADAR_RF_CHANNEL, WIFI_SECOND_CHAN_NONE);

  // Configure Channel State Information Hardware Extractor
  wifi_csi_config_t csi_hw_config = {};
  csi_hw_config.lltf_en = true;
  csi_hw_config.htltf_en = true;
  csi_hw_config.ltf_merge_en = true;
  csi_hw_config.channel_filter_en = true;

  esp_wifi_set_csi_config(&csi_hw_config);
  esp_wifi_set_csi_rx_cb(c505_on_channel_state_frame, NULL);
  esp_wifi_set_csi(true);
}

void loop() {
  static uint32_t last_heartbeat_time = 0;
  uint32_t now = millis();

  if (now - last_heartbeat_time >= C505_HEARTBEAT_INTERVAL_MS) {
    last_heartbeat_time = now;

    // Periodic telemetry status report
    Serial.printf("# [CAMERA505-RADAR] total_rx=%u matched=%u source_mac=%02X:%02X:%02X:%02X:%02X:%02X\n",
                  g_c505_total_frames, g_c505_matched_frames,
                  g_c505_last_observed_mac[0], g_c505_last_observed_mac[1],
                  g_c505_last_observed_mac[2], g_c505_last_observed_mac[3],
                  g_c505_last_observed_mac[4], g_c505_last_observed_mac[5]);
  }
}
