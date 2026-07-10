"""Fourth probe: CNBC 5D minute-bar chart, requested right after a 5-minute
boundary so the rolling bar grid aligns to :00/:05 (TradingView's grid).
Also tries the micro contract symbol @MGC.1.
"""
import gzip
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def save(name, payload: bytes):
    with gzip.open(f"data/probe4_{name}.gz", "wb") as f:
        f.write(payload)
    print(f"saved probe4_{name} ({len(payload)} bytes)")


def get(name, url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            save(name, r.read())
    except urllib.error.HTTPError as e:
        save(name, (f"HTTP {e.code}\n").encode() + e.read()[:1000])
    except Exception as e:  # noqa: BLE001
        save(name, f"ERROR {e}".encode())


def main():
    os.makedirs("data", exist_ok=True)
    # wait for 10-40s past a 5-minute boundary
    while True:
        now = datetime.now(timezone.utc)
        if now.minute % 5 == 0 and 10 <= now.second <= 40:
            break
        time.sleep(2)
    print("firing at", datetime.now(timezone.utc).isoformat())
    get("cnbc_gc_5d_aligned",
        "https://ts-api.cnbc.com/harmony/app/charts/5D.json?symbol=%40GC.1")
    get("cnbc_mgc_5d_aligned",
        "https://ts-api.cnbc.com/harmony/app/charts/5D.json?symbol=%40MGC.1")


if __name__ == "__main__":
    main()
