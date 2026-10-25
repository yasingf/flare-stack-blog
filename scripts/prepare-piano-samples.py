"""Prepare the freely licensed University of Iowa Steinway B samples.

Run manually with Python 3 and ffmpeg; not part of builds. Original recordings:
https://theremin.music.uiowa.edu/MISpiano.html
Permission: https://theremin.music.uiowa.edu/MIS.html (any project, no restrictions).
"""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent / "public/piano/steinway"
ROOT.mkdir(parents=True, exist_ok=True)
NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]


def prepare(item):
    midi, layer = item
    note = f"{NAMES[midi % 12]}{midi // 12 - 1}"
    source = "https://theremin.music.uiowa.edu/sound%20files/MIS/Piano_Other/piano/" + urllib.parse.quote(f"Piano.{layer}.{note}.aiff")
    target = ROOT / f"{midi}-{layer}.mp3"
    if not target.exists():
        with tempfile.TemporaryDirectory(prefix="piano-sample-") as temp:
            raw = Path(temp) / "original.aiff"
            with urllib.request.urlopen(source, timeout=90) as response:
                raw.write_bytes(response.read())
            subprocess.run([
                "ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(raw),
                "-af", "silenceremove=start_periods=1:start_duration=0.003:start_threshold=-55dB:start_silence=0.002,atrim=duration=12,afade=t=out:st=11.3:d=0.7",
                "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame", "-q:a", "5", str(target),
            ], check=True)
    print(f"Prepared {target.name}", flush=True)
    return {"midi": midi, "layer": layer, "source": source, "file": target.name, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}


if __name__ == "__main__":
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        samples = list(pool.map(prepare, [(n, layer) for n in [23, *range(24, 109, 3)] for layer in ["pp", "mf", "ff"]]))
    (ROOT / "sources.json").write_text(json.dumps(samples, indent=2) + "\n")
