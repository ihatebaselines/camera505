"""Ingestion and stream management package."""
from .synthetic_generator import SyntheticPhysiologicalGenerator, SimulationScenario
from .serial_stream import SerialEcgReader, list_available_com_ports

# Lazy import for StreamManager to avoid importing torch in lightweight scripts
def get_stream_manager():
    from .stream_manager import StreamManager
    return StreamManager

__all__ = [
    "SyntheticPhysiologicalGenerator",
    "SimulationScenario",
    "SerialEcgReader",
    "list_available_com_ports",
    "get_stream_manager"
]
