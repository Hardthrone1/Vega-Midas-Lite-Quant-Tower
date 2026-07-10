"""Third probe for the missing Jul 3 2026 gold futures session."""
import gzip
import http.cookiejar
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def save(name, payload: bytes):
    with gzip.open(f"data/probe3_{name}.gz", "wb") as f:
        f.write(payload)
    print(f"saved probe3_{name} ({len(payload)} bytes)")


def fetch(opener, name, url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    try:
        with opener.open(req, timeout=30) as r:
            save(name, r.read())
    except urllib.error.HTTPError as e:
        save(name, (f"HTTP {e.code}\n").encode() + e.read()[:2000])
    except Exception as e:  # noqa: BLE001
        save(name, f"ERROR {e}".encode())


def main():
    os.makedirs("data", exist_ok=True)
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    # --- barchart: hit site page to obtain XSRF cookie, then core-api
    try:
        req = urllib.request.Request(
            "https://www.barchart.com/futures/quotes/GCQ26/overview",
            headers={"User-Agent": UA})
        opener.open(req, timeout=30).read()
        xsrf = next((c.value for c in jar if c.name == "XSRF-TOKEN"), None)
        print("barchart xsrf:", bool(xsrf))
        if xsrf:
            token = urllib.parse.unquote(xsrf)
            for sym in ["GCQ26", "MGCQ26", "GRQ26", "MGQ26"]:
                q = urllib.parse.urlencode({
                    "symbol": sym, "type": "minutes", "interval": 5,
                    "startDate": "2026-07-02", "endDate": "2026-07-04",
                    "order": "asc", "limit": 2000,
                })
                fetch(opener, f"bc_{sym}",
                      f"https://www.barchart.com/proxies/core-api/v1/historical/get?{q}",
                      {"X-XSRF-TOKEN": token,
                       "Referer": f"https://www.barchart.com/futures/quotes/{sym}/interactive-chart"})
    except Exception as e:  # noqa: BLE001
        save("bc_setup", f"ERROR {e}".encode())

    # --- sina global futures 5m klines (COMEX gold)
    for name, sym in [("sina_gc_5m", "GC"), ("sina_mgc_5m", "MGC")]:
        url = ("https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_t1nf_/"
               f"GlobalFuturesService.getGlobalFuturesMiniKLine5m?symbol=hf_{sym}")
        fetch(opener, name, url, {"Referer": "https://finance.sina.com.cn"})

    # --- cnbc timeseries
    fetch(opener, "cnbc_gc_5d",
          "https://ts-api.cnbc.com/harmony/app/charts/5D.json?symbol=%40GC.1")
    fetch(opener, "cnbc_gc_1m",
          "https://ts-api.cnbc.com/harmony/app/charts/1M.json?symbol=%40GC.1")

    # --- dxfeed demo webservice candles
    frm = int(datetime(2026, 7, 2, 21, 0, tzinfo=timezone.utc).timestamp() * 1000)
    to = int(datetime(2026, 7, 3, 22, 0, tzinfo=timezone.utc).timestamp() * 1000)
    for name, sym in [("dx_gcq26", "/GCQ26{=5m}"), ("dx_mgcq26", "/MGCQ26{=5m}")]:
        q = urllib.parse.urlencode({"events": "Candle", "symbols": sym,
                                    "fromTime": frm, "toTime": to})
        fetch(opener, name, f"https://tools.dxfeed.com/webservice/rest/events.json?{q}")


if __name__ == "__main__":
    main()
