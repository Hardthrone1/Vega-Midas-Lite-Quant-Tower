"""Fifth probe: Yahoo 2m/15m rollups for Jun 22 midday.

The 12:45 Jun 22 1m bar's low was destroyed by the response artifact in both
the MGC=F and GC=F 1m streams. The 2m and 15m rollups are separate responses
with independent artifact positions; either may retain the true wick.
"""
import gzip
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def get(name, url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = r.read()
    except urllib.error.HTTPError as e:
        payload = (f"HTTP {e.code}\n").encode() + e.read()[:1000]
    except Exception as e:  # noqa: BLE001
        payload = f"ERROR {e}".encode()
    with gzip.open(f"data/probe5_{name}.gz", "wb") as f:
        f.write(payload)
    print(f"saved probe5_{name} ({len(payload)} bytes)")


def main():
    os.makedirs("data", exist_ok=True)
    p1 = int(datetime(2026, 6, 22, 10, 0, tzinfo=ET).timestamp())
    p2 = int(datetime(2026, 6, 22, 14, 0, tzinfo=ET).timestamp())
    for name, sym, iv in [("mgc_2m_jun22", "MGC=F", "2m"),
                          ("mgc_15m_jun22", "MGC=F", "15m"),
                          ("gc_2m_jun22", "GC=F", "2m"),
                          ("gc_15m_jun22", "GC=F", "15m")]:
        url = (f"https://query1.finance.yahoo.com/v8/finance/chart/"
               f"{urllib.parse.quote(sym)}?period1={p1}&period2={p2}"
               f"&interval={iv}&includePrePost=true")
        get(name, url)


if __name__ == "__main__":
    main()
