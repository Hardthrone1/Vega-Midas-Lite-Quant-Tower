"""Probe alternate sources for the missing Jul 3 2026 holiday session
(gold futures, 00:00-13:00 ET). Saves whatever responds under data/probe_*.
"""
import gzip
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
P1 = int(datetime(2026, 7, 2, 17, 0, tzinfo=ET).timestamp())
P2 = int(datetime(2026, 7, 3, 18, 0, tzinfo=ET).timestamp())


def get(url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def save(name, payload: bytes):
    with gzip.open(f"data/probe_{name}.json.gz", "wb") as f:
        f.write(payload)
    print(f"saved probe_{name} ({len(payload)} bytes)")


def main():
    os.makedirs("data", exist_ok=True)
    # 1) Yahoo: contract-specific symbols and coarser intervals
    for name, sym, interval in [
        ("yq_mgcq26_1m", "MGCQ26.CMX", "1m"),
        ("yq_gcq26_1m", "GCQ26.CMX", "1m"),
        ("yq_mgcq26_5m", "MGCQ26.CMX", "5m"),
        ("yq_mgc_2m", "MGC=F", "2m"),
        ("yq_mgc_15m", "MGC=F", "15m"),
    ]:
        url = (f"https://query1.finance.yahoo.com/v8/finance/chart/"
               f"{urllib.parse.quote(sym)}?period1={P1}&period2={P2}"
               f"&interval={interval}&includePrePost=true")
        try:
            save(name, get(url))
        except Exception as e:  # noqa: BLE001
            print(f"{name}: {e}")
    # 2) MarketWatch/WSJ michelangelo timeseries (5m)
    key = "cecc4267a0194af89ca343805a3e57af"  # public web client key
    req_json = {
        "Step": "PT5M", "TimeFrame": "P10D",
        "EntitlementToken": key,
        "IncludeMockTick": False, "FilterNullSlots": False,
        "FilterClosedPoints": True, "IncludeClosedSlots": False,
        "IncludeOfficialClose": True, "InjectOpen": False,
        "ShowPreMarket": True, "ShowAfterHours": True,
        "UseExtendedTimeFrame": True, "WantPriorClose": False,
        "IncludeCurrentQuotes": False, "ResetTodaysAfterHoursPercentChange": False,
        "Series": [{"Key": "FUTURE/US/COMEX/GCQ26", "Dialect": "Charting",
                    "Kind": "Ticker", "SeriesId": "s1", "DataTypes": ["Open", "High", "Low", "Last"],
                    "Indicators": []}],
    }
    url = ("https://api-secure.wsj.net/api/michelangelo/timeseries/history?json="
           + urllib.parse.quote(json.dumps(req_json)) + "&ckey=" + key[:10])
    try:
        save("mw_gcq26_5m", get(url, {"Dylan2010.EntitlementToken": key,
                                      "Accept": "application/json"}))
    except Exception as e:  # noqa: BLE001
        print(f"mw_gcq26_5m: {e}")


if __name__ == "__main__":
    main()
