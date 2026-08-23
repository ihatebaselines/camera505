/*
 * ============================================================================
 * LIFE Platform - C++ Real-Time ESP32/Serial Hardware Interface
 * Fast raw byte parser and ring buffer for USB Serial communication.
 * Handles CSV, JSON, and Binary (8-byte) packet formats.
 * ============================================================================
 * Build: g++ -std=c++17 -O2 life_hardware_interface.cpp -o life_hw
 *        (Add -lpthread on Linux/macOS)
 *        (On Windows, link with ws2_32 for TCP socket mode)
 */

#include <iostream>
#include <string>
#include <vector>
#include <queue>
#include <thread>
#include <mutex>
#include <atomic>
#include <cstdint>
#include <chrono>
#include <sstream>
#include <cstring>
#include <cassert>

/* ============================================================================
 * EcgPacket: Parsed single ECG sample from hardware
 * ========================================================================== */
struct EcgPacket {
    uint64_t timestamp_ms;
    uint16_t ecg_raw;      // 0..4095 (12-bit ADC)
    bool     leads_off;
    uint16_t sequence_num;
};

/* ============================================================================
 * Thread-Safe Ring Buffer for lock-minimal high-throughput ingestion
 * Capacity must be power of 2
 * ========================================================================== */
template<typename T, size_t CAPACITY = 8192>
class RingBuffer {
    static_assert((CAPACITY & (CAPACITY - 1)) == 0, "CAPACITY must be power of 2");
    T        buf_[CAPACITY];
    std::atomic<size_t> head_{0}, tail_{0};

public:
    bool push(const T& val) {
        size_t head = head_.load(std::memory_order_relaxed);
        size_t next = (head + 1) & (CAPACITY - 1);
        if (next == tail_.load(std::memory_order_acquire)) return false; // full
        buf_[head] = val;
        head_.store(next, std::memory_order_release);
        return true;
    }

    bool pop(T& val) {
        size_t tail = tail_.load(std::memory_order_relaxed);
        if (tail == head_.load(std::memory_order_acquire)) return false; // empty
        val = buf_[tail];
        tail_.store((tail + 1) & (CAPACITY - 1), std::memory_order_release);
        return true;
    }

    bool empty() const {
        return tail_.load() == head_.load();
    }

    size_t size() const {
        return (head_.load() - tail_.load()) & (CAPACITY - 1);
    }
};

/* ============================================================================
 * PacketParser: Multi-format serial packet decoder
 * ========================================================================== */
class PacketParser {
public:
    /* CSV format: "val,lo_flag,ts_ms,seq\n" */
    static bool parseCSV(const std::string& line, EcgPacket& pkt) {
        if (line.empty() || line[0] == '#') return false;
        std::stringstream ss(line);
        std::string tok;
        std::vector<std::string> parts;
        while (std::getline(ss, tok, ',')) {
            tok.erase(0, tok.find_first_not_of(" \r\n\t"));
            tok.erase(tok.find_last_not_of(" \r\n\t") + 1);
            parts.push_back(tok);
        }
        if (parts.size() < 2) return false;
        try {
            pkt.ecg_raw    = (uint16_t)std::stoul(parts[0]);
            pkt.leads_off  = (std::stoi(parts[1]) != 0);
            pkt.timestamp_ms = parts.size() >= 3 ? (uint64_t)std::stoull(parts[2]) : 0;
            pkt.sequence_num = parts.size() >= 4 ? (uint16_t)std::stoul(parts[3]) : 0;
            return true;
        } catch (...) {
            return false;
        }
    }

    /* JSON format: {"t":12345,"v":2048,"lo":0,"seq":100} */
    static bool parseJSON(const std::string& line, EcgPacket& pkt) {
        if (line.empty() || line[0] != '{') return false;
        auto getVal = [&](const std::string& key) -> std::string {
            size_t pos = line.find("\"" + key + "\":");
            if (pos == std::string::npos) return "";
            pos += key.size() + 3;
            size_t end = line.find_first_of(",}", pos);
            return line.substr(pos, end - pos);
        };
        try {
            std::string v = getVal("v");
            std::string lo = getVal("lo");
            std::string t = getVal("t");
            std::string seq = getVal("seq");
            if (v.empty()) return false;
            pkt.ecg_raw      = (uint16_t)std::stoul(v);
            pkt.leads_off    = (!lo.empty() && std::stoi(lo) != 0);
            pkt.timestamp_ms = t.empty() ? 0 : (uint64_t)std::stoull(t);
            pkt.sequence_num = seq.empty() ? 0 : (uint16_t)std::stoul(seq);
            return true;
        } catch (...) {
            return false;
        }
    }

    /* Binary format: [0xAA, 0x55, SEQ_L, SEQ_H, VAL_L, VAL_H, FLAGS, CHK] */
    static bool parseBinary(const uint8_t* bytes, size_t len, EcgPacket& pkt) {
        if (len < 8 || bytes[0] != 0xAA || bytes[1] != 0x55) return false;
        // Verify XOR checksum
        uint8_t chk = bytes[2] ^ bytes[3] ^ bytes[4] ^ bytes[5] ^ bytes[6];
        if (chk != bytes[7]) return false;
        pkt.sequence_num = (uint16_t)(bytes[2] | (bytes[3] << 8));
        pkt.ecg_raw      = (uint16_t)(bytes[4] | (bytes[5] << 8));
        pkt.leads_off    = (bytes[6] != 0);
        pkt.timestamp_ms = (uint64_t)std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
        return true;
    }
};

/* ============================================================================
 * SyntheticHardwareSource: Generates realistic ECG at 250Hz without hardware
 * ========================================================================== */
class SyntheticHardwareSource {
    double phase_ = 0.0;
    double resp_phase_ = 0.0;
    uint16_t seq_ = 0;
    double hr_freq_ = 1.2; // 72 BPM

public:
    EcgPacket nextSample() {
        EcgPacket pkt;
        phase_ += 2.0 * 3.14159265358979 * hr_freq_ / 250.0;
        resp_phase_ += 2.0 * 3.14159265358979 * 0.25 / 250.0; // 15 RPM

        double p = fmod(phase_, 2.0 * 3.14159265358979);
        double ecg = 2048.0 + 80.0 * sin(resp_phase_);

        if (p >= 0.4 && p < 0.8)
            ecg += 160.0 * sin((p - 0.4) / 0.4 * 3.14159265);
        else if (p >= 1.1 && p < 1.25)
            ecg += 1500.0 * sin((p - 1.1) / 0.15 * 3.14159265);
        else if (p >= 1.25 && p < 1.35)
            ecg -= 320.0 * sin((p - 1.25) / 0.1 * 3.14159265);
        else if (p >= 1.6 && p < 2.2)
            ecg += 340.0 * sin((p - 1.6) / 0.6 * 3.14159265);

        // Micro-noise
        ecg += (rand() % 21 - 10);

        if (ecg < 0) ecg = 0;
        if (ecg > 4095) ecg = 4095;

        pkt.ecg_raw  = (uint16_t)ecg;
        pkt.leads_off = false;
        pkt.timestamp_ms = (uint64_t)std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
        pkt.sequence_num = ++seq_;
        return pkt;
    }
};

/* ============================================================================
 * Simple Pan-Tompkins R-Peak Detector (C++ port of Python DSP module)
 * ========================================================================== */
class CPPPanTompkins {
    int fs_;
    int refractory_;
    double spki_ = 0.0, npki_ = 0.0, threshold_ = 0.0;
    int last_peak_sample_ = 0;
    int sample_idx_ = 0;
    double dx_[5] = {0};
    double mwi_sum_ = 0.0;
    std::vector<double> mwi_buf_;
    int mwi_win_;

public:
    explicit CPPPanTompkins(int fs = 250)
        : fs_(fs), refractory_(fs / 5), mwi_win_(fs * 150 / 1000) {
        mwi_buf_.resize(mwi_win_, 0.0);
    }

    bool processSample(double filt_val) {
        ++sample_idx_;

        // 5-point derivative
        dx_[0] = dx_[1]; dx_[1] = dx_[2]; dx_[2] = dx_[3]; dx_[3] = dx_[4];
        dx_[4] = filt_val;
        double deriv = (2*dx_[4] + dx_[3] - dx_[1] - 2*dx_[0]) / 8.0;

        // Square
        double sq = deriv * deriv;

        // MWI
        size_t old_idx = (size_t)(sample_idx_ % mwi_win_);
        mwi_sum_ -= mwi_buf_[old_idx];
        mwi_buf_[old_idx] = sq;
        mwi_sum_ += sq;
        double mwi = mwi_sum_ / mwi_win_;

        // Peak detection
        if (sample_idx_ < fs_ / 2) return false;

        if (spki_ == 0 && npki_ == 0) {
            spki_ = mwi * 2.0; npki_ = mwi * 0.5;
            threshold_ = npki_ + 0.25 * (spki_ - npki_);
        }

        bool is_peak = false;
        if (sample_idx_ - last_peak_sample_ > refractory_) {
            if (mwi > threshold_) {
                is_peak = true;
                last_peak_sample_ = sample_idx_;
                spki_ = 0.125 * mwi + 0.875 * spki_;
            } else {
                npki_ = 0.125 * mwi + 0.875 * npki_;
            }
            threshold_ = npki_ + 0.25 * (spki_ - npki_);
        }
        return is_peak;
    }
};

/* ============================================================================
 * Main: Demo & Benchmark
 * ========================================================================== */
int main() {
    std::cout << "============================================================" << std::endl;
    std::cout << "  LIFE C++ Hardware Interface & Signal Processing Benchmark" << std::endl;
    std::cout << "============================================================" << std::endl;

    SyntheticHardwareSource source;
    CPPPanTompkins detector(250);
    RingBuffer<EcgPacket> ring;

    // Generate 10 seconds of synthetic ECG
    const int N = 2500;
    int r_peaks = 0;
    double sum_hr = 0.0;
    uint64_t last_peak_ts = 0;
    std::vector<double> rr_intervals;

    auto t_start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < N; i++) {
        EcgPacket pkt = source.nextSample();
        ring.push(pkt);

        EcgPacket popped;
        if (ring.pop(popped)) {
            // Simulate basic filtering: center at 0
            double filtered = (double)popped.ecg_raw - 2048.0;
            bool is_peak = detector.processSample(filtered);

            if (is_peak) {
                r_peaks++;
                if (last_peak_ts > 0) {
                    double rr = (double)(popped.timestamp_ms - last_peak_ts);
                    if (rr >= 300 && rr <= 2000) {
                        rr_intervals.push_back(rr);
                        sum_hr += 60000.0 / rr;
                    }
                }
                last_peak_ts = popped.timestamp_ms;
            }
        }
    }
    auto t_end = std::chrono::high_resolution_clock::now();

    double elapsed_ms = std::chrono::duration<double, std::milli>(t_end - t_start).count();
    double realtime_speedup = (N / 250.0 * 1000.0) / elapsed_ms;

    std::cout << "\n[RESULT] Processing " << N << " ECG samples in " << elapsed_ms << " ms" << std::endl;
    std::cout << "[RESULT] Realtime Speedup: " << realtime_speedup << "x" << std::endl;
    std::cout << "[RESULT] R-Peaks Detected: " << r_peaks << " (~72 BPM expected for 10s)" << std::endl;

    if (!rr_intervals.empty()) {
        double mean_hr = sum_hr / rr_intervals.size();
        double mean_rr = 0.0;
        for (auto rr : rr_intervals) mean_rr += rr;
        mean_rr /= rr_intervals.size();

        // RMSSD
        double rmssd = 0.0;
        for (size_t k = 1; k < rr_intervals.size(); k++) {
            double d = rr_intervals[k] - rr_intervals[k-1];
            rmssd += d * d;
        }
        rmssd = sqrt(rmssd / (rr_intervals.size() - 1));

        std::cout << "[RESULT] Mean HR: " << mean_hr << " BPM" << std::endl;
        std::cout << "[RESULT] RMSSD (HRV): " << rmssd << " ms" << std::endl;
    }

    // Test PacketParser CSV
    EcgPacket pkt_parsed;
    bool ok = PacketParser::parseCSV("2048,0,1700000001234,42", pkt_parsed);
    assert(ok);
    assert(pkt_parsed.ecg_raw == 2048);
    assert(!pkt_parsed.leads_off);
    std::cout << "\n[TEST] CSV Parser OK: val=" << pkt_parsed.ecg_raw << " lo=" << pkt_parsed.leads_off << std::endl;

    // Test Binary frame parsing
    uint8_t frame[8] = {0xAA, 0x55, 0x2A, 0x00, 0x00, 0x08, 0x00, 0x2A ^ 0x08};
    EcgPacket pkt_bin;
    ok = PacketParser::parseBinary(frame, 8, pkt_bin);
    assert(ok);
    assert(pkt_bin.ecg_raw == 2048);
    std::cout << "[TEST] Binary Parser OK: val=" << pkt_bin.ecg_raw << " seq=" << pkt_bin.sequence_num << std::endl;

    std::cout << "\n[DONE] All C++ tests passed." << std::endl;
    return 0;
}
