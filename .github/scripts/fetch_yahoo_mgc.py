"""Fetch MGC=F intraday bars from Yahoo Finance chart API.

Pulls 1m bars in <=7-day chunks plus a full-range 5m series for
2026-06-21 17:00 ET .. 2026-07-08 00:00 ET and writes the raw JSON
responses (gzipped) under data/. Downstream cleaning/aggregation is
done in-repo by scripts/build_mgc_bars.py.
"""
import gzip
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def et(y, m, d, hh=0, mm=0):
    return int(datetime(y, m, d, hh, mm, tzinfo=ET).timestamp())


def fetch(symbol, p1, p2, interval):
    last_err = None
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        for attempt in range(3):
            url = (f"https://{host}/v8/finance/chart/{urllib.parse.quote(symbol)}"
                   f"?period1={p1}&period2={p2}&interval={interval}&includePrePost=true")
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = json.load(r)
                if data.get("chart", {}).get("result"):
                    return data
                last_err = data.get("chart", {}).get("error")
            except Exception as e:  # noqa: BLE001
                last_err = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"fetch failed {symbol} {interval} {p1}-{p2}: {last_err}")


def main():
    os.makedirs("data", exist_ok=True)
    chunks_1m = [
        (et(2026, 6, 21, 17, 0), et(2026, 6, 27, 18, 0)),
        (et(2026, 6, 27, 18, 0), et(2026, 7, 3, 18, 0)),
        (et(2026, 7, 3, 18, 0), et(2026, 7, 8, 0, 0)),
        # Yahoo caps 1m responses at ~5 trading days; refill the holes
        (et(2026, 7, 2, 17, 0), et(2026, 7, 3, 18, 0)),
        (et(2026, 6, 28, 16, 0), et(2026, 6, 29, 1, 0)),
    ]
    for i, (p1, p2) in enumerate(chunks_1m, 1):
        out = f"data/mgc_1m_chunk{i}.json.gz"
        if os.path.exists(out):
            print(f"1m chunk {i}: exists, skipping")
            continue
        data = fetch("MGC=F", p1, p2, "1m")
        n = len(data["chart"]["result"][0].get("timestamp", []))
        print(f"1m chunk {i}: {n} bars")
        with gzip.open(out, "wt") as f:
            json.dump(data, f)
    # MGC=F has no Yahoo intraday data for the Jul 3 holiday session or the
    # first minutes of the Jun 28 Sunday open; try the GC=F stream for those.
    gc_windows = {
        "gc_1m_jul3": (et(2026, 7, 2, 17, 0), et(2026, 7, 3, 18, 0)),
        "gc_1m_jun28": (et(2026, 6, 28, 16, 0), et(2026, 6, 29, 1, 0)),
        # GC=F week-1 1m: independent stream used to recover wicks that the
        # 4173.2 contaminant wiped from the MGC chunk1 response
        "gc_1m_wk1": (et(2026, 6, 21, 17, 0), et(2026, 6, 27, 18, 0)),
    }
    for name, (p1, p2) in gc_windows.items():
        out = f"data/{name}.json.gz"
        if os.path.exists(out):
            continue
        try:
            data = fetch("GC=F", p1, p2, "1m")
        except RuntimeError as e:
            print(f"{name}: {e}")
            continue
        n = len(data["chart"]["result"][0].get("timestamp", []))
        print(f"{name}: {n} bars")
        with gzip.open(out, "wt") as f:
            json.dump(data, f)
    if not os.path.exists("data/mgc_5m_full.json.gz"):
        data = fetch("MGC=F", chunks_1m[0][0], et(2026, 7, 8, 0, 0), "5m")
        n = len(data["chart"]["result"][0].get("timestamp", []))
        print(f"5m full: {n} bars")
        with gzip.open("data/mgc_5m_full.json.gz", "wt") as f:
            json.dump(data, f)


if __name__ == "__main__":
    main()
