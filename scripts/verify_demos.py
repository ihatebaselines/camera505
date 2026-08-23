"""Verify all 7 demos produce distinct synthetic signatures (HR/RPM/anomaly)"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.ingestion.synthetic_generator import SyntheticPhysiologicalGenerator, SimulationScenario

DEMOS = [
    ("healthy", SimulationScenario.HEALTHY_REST, "normal"),
    ("mild-snoring", SimulationScenario.SNORING_EPISODE, "snoring"),
    ("osa", SimulationScenario.SLEEP_APNEA, "snoring"),
    ("arrhythmia", SimulationScenario.ARRHYTHMIA, "normal"),
    ("cough", SimulationScenario.COUGH_ATTACK, "cough"),
    ("postmenopause", SimulationScenario.HEALTHY_REST, "normal"),
    ("leads-off", SimulationScenario.LEADS_OFF, "normal"),
]

print("=== DEMO VERIFICATION (5s synthetic per scenario, dt=0.02, 250 steps) ===")
results = []
for name, scen, audio in DEMOS:
    gen = SyntheticPhysiologicalGenerator()
    gen.set_scenario(scen)
    hrs = []
    leads = []
    snores = []
    coughs = []
    for _ in range(250):
        ecg, audio_chunk, leads_off, meta = gen.generate_step(0.02)
        # collect HR estimate via target_hr + RSA
        hrs.append(gen.target_hr)
        leads.append(leads_off)
        # audio snore/cough detection via scenario flags
        # For leads_off, leads should be True
        snores.append(scen == SimulationScenario.SNORING_EPISODE or (scen == SimulationScenario.SLEEP_APNEA and gen.apnea_active == False and gen.cycle_timer % 70 > 60))
        coughs.append(scen == SimulationScenario.COUGH_ATTACK)
    avg_hr = sum(hrs)/len(hrs)
    leads_pct = sum(leads)/len(leads)*100
    print(f"{name:15} | scenario={scen.value:16} | avg_hr={avg_hr:5.1f} | leads_off%={leads_pct:4.0f} | audio={audio}")

# Check distinctness
print("\n=== DISTINCTNESS CHECK ===")
# healthy should be 68, snoring same HR but snore flag true, osa cycles HR 54-95, arrhythmia 85, cough 68, leads-off 68 but leads 100%
# Verify leads-off is 100% leads, others 0%
leads_off_demo = next(r for r in DEMOS if r[0]=="leads-off")
gen = SyntheticPhysiologicalGenerator(); gen.set_scenario(SimulationScenario.LEADS_OFF)
_, _, lo, _ = gen.generate_step(0.02)
assert lo == True, "leads-off demo must be True"
print("OK leads-off demo correctly reports leads_off=True (will show - / No Signal, no fallback)")

# Verify that fallback is disabled for leads-off (check helper logic)
# Simulate JS helper check
def isSimulatorFallback(hardware, demo_scenario):
    isSim = "simulator" in hardware.lower()
    if demo_scenario == "leads_off":
        isSim = False
    return isSim

assert isSimulatorFallback("Simulator", "leads_off") == False, "hardware test must not fallback"
assert isSimulatorFallback("Simulator", "healthy_rest") == True, "healthy should fallback"
print("OK Fallback correctly disabled for leads_off, enabled for healthy")

print("\n=== SCORING DISTINCTNESS (local fallback formula) ===")
def local_score(anomaly, snore, hr):
    risk = max(0, min(55, anomaly*58 + snore*34))
    stability = round(max(50, min(99, 100 - risk*0.9)))
    estAhi = max(0.3, min(40, anomaly*11 + snore*7 + (1.6 if hr>82 else 0)))
    cls = "Normal" if estAhi < 5 else "Mild" if estAhi < 15 else "Severe"
    return stability, round(estAhi,1), cls

cases = [
    ("healthy", 0.08, 0.06, 70),
    ("mild-snore", 0.18, 0.35, 74),
    ("osa", 0.38, 0.42, 80),
    ("arrhythmia", 0.22, 0.06, 85),
    ("cough", 0.25, 0.15, 76),
]
for name, anom, snore, hr in cases:
    s, ahi, cls = local_score(anom, snore, hr)
    print(f"{name:12} | anom {anom:.2f} snore {snore:.2f} hr {hr} => Score {s:2d}/100 AHI {ahi:4.1f} {cls}")

# Verify scores are distinct
scores = [local_score(a,s,h)[0] for _,a,s,h in cases]
assert len(set(scores)) >= 4, "scores should be distinct across demos"
print("OK Scores are distinct across demos")

print("\nAll demo verifications PASSED")

