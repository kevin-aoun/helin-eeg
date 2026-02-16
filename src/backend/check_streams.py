"""Check for available LSL streams and print as JSON."""
import json
import sys

try:
    from pylsl import resolve_streams
    streams = resolve_streams(wait_time=1.0)
    result = []
    for s in streams:
        result.append({
            "name": s.name(),
            "type": s.type(),
            "channels": s.channel_count(),
            "srate": s.nominal_srate(),
            "source_id": s.source_id(),
        })
    print(json.dumps(result))
except ImportError:
    print(json.dumps([]))
except Exception:
    print(json.dumps([]))
