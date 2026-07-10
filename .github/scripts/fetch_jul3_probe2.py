"""Second probe for the missing Jul 3 2026 gold futures session.
Dumps raw response bodies (or error text) under data/probe2_* for offline
inspection.
"""
import gzip
import json
import os
import urllib.error
import urllib.parse
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def save(name, payload: bytes):
    with gzip.open(f"data/probe2_{name}.gz", "wb") as f:
        f.write(payload)
    print(f"saved probe2_{name} ({len(payload)} bytes)")


def get(name, url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept": "application/json,text/plain,*/*",
                                               **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            save(name, r.read())
    except urllib.error.HTTPError as e:
        save(name, (f"HTTP {e.code}\n").encode() + e.read()[:2000])
    except Exception as e:  # noqa: BLE001
        save(name, f"ERROR {e}".encode())


def main():
    os.makedirs("data", exist_ok=True)
    # investing.com public chart api (gold futures pair id 8830)
    for name, url in [
        ("inv_gc_5m", "https://api.investing.com/api/financialdata/8830/historical/chart/?interval=PT5M&pointscount=4999"),
        ("inv_gc_5m_small", "https://api.investing.com/api/financialdata/8830/historical/chart/?interval=PT5M&pointscount=160"),
    ]:
        get(name, url, {"domain-id": "www", "Referer": "https://www.investing.com/"})
    # marketwatch michelangelo, XCEC mic, continuous + Aug26 contract
    key = "cecc4267a0194af89ca343805a3e57af"
    for name, series_key in [("mw_gc00_5m", "FUTURE/US/XCEC/GC00"),
                             ("mw_gcq26_5m", "FUTURE/US/XCEC/GCQ26"),
                             ("mw_mgcq26_5m", "FUTURE/US/XCEC/MGCQ26")]:
        req_json = {
            "Step": "PT5M", "TimeFrame": "P10D", "EntitlementToken": key,
            "IncludeMockTick": False, "FilterNullSlots": False,
            "FilterClosedPoints": True, "IncludeClosedSlots": False,
            "IncludeOfficialClose": True, "InjectOpen": False,
            "ShowPreMarket": True, "ShowAfterHours": True,
            "UseExtendedTimeFrame": True, "WantPriorClose": False,
            "IncludeCurrentQuotes": False,
            "ResetTodaysAfterHoursPercentChange": False,
            "Series": [{"Key": series_key, "Dialect": "Charting",
                        "Kind": "Ticker", "SeriesId": "s1",
                        "DataTypes": ["Open", "High", "Low", "Last"]}],
        }
        url = ("https://api-secure.wsj.net/api/michelangelo/timeseries/history?json="
               + urllib.parse.quote(json.dumps(req_json)) + "&ckey=" + key[:10])
        get(name, url, {"Dylan2010.EntitlementToken": key})
    # stooq intraday csv exports
    for name, url in [
        ("stooq_gc_5", "https://stooq.com/q/d/l/?s=gc.f&i=5"),
        ("stooq_gc_5_rng", "https://stooq.com/q/d/l/?s=gc.f&d1=20260702&d2=20260704&i=5"),
        ("stooq_gc_a2", "https://stooq.com/q/a2/d/?s=gc.f&i=5"),
    ]:
        get(name, url)


if __name__ == "__main__":
    main()
