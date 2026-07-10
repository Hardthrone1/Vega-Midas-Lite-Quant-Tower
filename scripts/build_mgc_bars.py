"""Build clean MGC 5m bars from raw Yahoo Finance JSON (data/*.json.gz).

Yahoo intraday responses inject a spurious constant price (a quote-time
artifact) into the high/low arrays of a fraction of bars. The artifact value
differs per response, so it is detected per file by frequency: any exact
float occurring >= FREQ_THRESHOLD times in a file's high or low array is
treated as a contaminant, and affected bars are repaired from open/close.

Output: mgc_5m_et.csv in FRD format (timestamp ET, open, high, low, close,
volume), timestamps mark bar START, aligned to 5-minute boundaries.
"""
import csv
import os
import gzip
import json
from collections import Counter
from datetime import datetime
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
FREQ_THRESHOLD = 40
CHUNKS = ["data/mgc_1m_chunk1.json.gz", "data/mgc_1m_chunk2.json.gz",
          "data/mgc_1m_chunk3.json.gz", "data/mgc_1m_chunk4.json.gz",
          "data/mgc_1m_chunk5.json.gz"]


def load_chunk(path):
    """Return {ts: (o,h,l,c,vol,repaired_flag)} with contaminants scrubbed."""
    d = json.load(gzip.open(path, "rt"))
    r = d["chart"]["result"][0]
    ts = r["timestamp"]
    q = r["indicators"]["quote"][0]
    bars = {}
    contaminants = set()
    for arr in (q["low"], q["high"]):
        for v, c in Counter(x for x in arr if x is not None).items():
            if c >= FREQ_THRESHOLD:
                contaminants.add(v)
    repaired = 0
    for i, t in enumerate(ts):
        o, h, l, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]
        if c is None or o is None:
            continue
        body_hi, body_lo = max(o, c), min(o, c)
        rep = False
        if l in contaminants and l < body_lo:
            l = body_lo
            rep = True
        if h in contaminants and h > body_hi:
            h = body_hi
            rep = True
        if o in contaminants or c in contaminants:
            # rare: drop the bar rather than guess at body prices
            repaired += 1
            continue
        repaired += rep
        h, l = max(h, body_hi), min(l, body_lo)
        v = q["volume"][i] or 0
        bars[t] = (o, h, l, c, v, rep)
    print(f"{path}: {len(bars)} bars, contaminants={sorted(round(x,1) for x in contaminants)}, repaired={repaired}")
    return bars


def load_native_5m(path="data/mgc_5m_full.json.gz"):
    """Native 5m bars keyed by slot, with per-file contaminants dropped to
    None so only trustworthy extremes are used for cross-checking."""
    d = json.load(gzip.open(path, "rt"))
    r = d["chart"]["result"][0]
    ts = r["timestamp"]
    q = r["indicators"]["quote"][0]
    contaminants = set()
    for arr in (q["low"], q["high"]):
        for v, c in Counter(x for x in arr if x is not None).items():
            if c >= FREQ_THRESHOLD:
                contaminants.add(v)
    out = {}
    for i, t in enumerate(ts):
        o, h, l, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]
        if c is None or o is None:
            continue
        out[t - (t % 300)] = (
            o,
            None if h in contaminants else h,
            None if l in contaminants else l,
            c,
        )
    print(f"{path}: {len(out)} native 5m bars, contaminants={sorted(round(x,1) for x in contaminants)}")
    return out


def main():
    merged = {}
    for path in CHUNKS:
        merged.update(load_chunk(path))

    # aggregate 1m -> 5m on ET-aligned 5-minute boundaries (bar start time)
    agg = {}
    dirty = set()   # slots containing contamination-repaired 1m bars
    for t in sorted(merged):
        o, h, l, c, v, rep = merged[t]
        slot = t - (t % 300)
        if rep:
            dirty.add(slot)
        if slot not in agg:
            agg[slot] = [o, h, l, c, v]
        else:
            a = agg[slot]
            a[1] = max(a[1], h)
            a[2] = min(a[2], l)
            a[3] = c
            a[4] += v

    # repaired 1m bars lose their true wick (flattened to the body); recover
    # extremes from the native 5m series where its values are clean
    native = load_native_5m()
    fixed = 0
    for slot in dirty:
        if slot not in agg or slot not in native:
            continue
        _, nh, nl, _ = native[slot]
        a = agg[slot]
        if nh is not None and nh > a[1]:
            a[1] = nh
            fixed += 1
        if nl is not None and nl < a[2]:
            a[2] = nl
            fixed += 1
    print(f"cross-check: {len(dirty)} dirty 5m slots, {fixed} extremes recovered from native 5m")

    # CNBC's @MGC.1 5m series (grid-aligned fetch; validated tick-exact
    # against the Yahoo-derived bars on the Jul 2 overlap) serves two roles:
    #  - splice: Yahoo has no data at all for the Jul 3 2026 holiday session
    #  - recovery: restore wicks on dirty slots that the contaminant repair
    #    flattened (chunk3's artifact value 4186.9 sits inside Jul 5-7's
    #    trading range, so real extremes at that price were wiped too)
    cnbc_path = "data/probe4_cnbc_mgc_5d_aligned.gz"
    if os.path.exists(cnbc_path):
        d = json.load(gzip.open(cnbc_path, "rt"))
        cnbc = {}
        for b in d["barData"]["priceBars"]:
            t = b["tradeTime"]  # yyyymmddHHMMSS, ET, window start
            dt = datetime(int(t[:4]), int(t[4:6]), int(t[6:8]),
                          int(t[8:10]), int(t[10:12]), tzinfo=ET)
            slot = int(dt.timestamp())
            if slot % 300 == 0:
                cnbc[slot] = [float(b["open"]), float(b["high"]),
                              float(b["low"]), float(b["close"]),
                              float(b.get("volume") or 0)]
        spliced = recovered = truncated = 0
        for slot, bar in cnbc.items():
            if slot not in agg:
                agg[slot] = bar
                spliced += 1
            elif slot in dirty:
                a = agg[slot]
                if bar[1] > a[1]:
                    a[1] = bar[1]
                    recovered += 1
                if bar[2] < a[2]:
                    a[2] = bar[2]
                    recovered += 1
        # Yahoo's 1m feed omits each day's 23:59 minute, truncating the final
        # 5m bar of the day; complete those slots from CNBC (extremes union +
        # CNBC's close, which includes the missing minute's trades)
        for slot, bar in cnbc.items():
            if slot in agg and slot + 240 not in merged:
                a = agg[slot]
                new = [a[0], max(a[1], bar[1]), min(a[2], bar[2]), bar[3], a[4]]
                if new[1:4] != a[1:4]:
                    truncated += 1
                a[1:4] = new[1:4]
        print(f"cnbc: {spliced} 5m bars spliced, {recovered} dirty extremes "
              f"recovered, {truncated} truncated day-final bars completed")

    # GC=F trades in lockstep with MGC; use its independent (differently
    # contaminated) stream to recover week-1 wicks on dirty slots
    gc_path = "data/gc_1m_wk1.json.gz"
    if os.path.exists(gc_path):
        gc = load_chunk(gc_path)
        gc_agg = {}
        for t, (o, h, l, c, v, rep) in gc.items():
            slot = t - (t % 300)
            cur = gc_agg.setdefault(slot, [None, -1e9, 1e9, None, False])
            cur[1] = max(cur[1], h)
            cur[2] = min(cur[2], l)
            cur[4] = cur[4] or rep
        recovered = 0
        for slot in dirty:
            g = gc_agg.get(slot)
            if not g or g[4]:      # skip slots dirty in the GC stream too
                continue
            a = agg.get(slot)
            if not a:
                continue
            if g[1] > a[1]:
                a[1] = g[1]
                recovered += 1
            if g[2] < a[2]:
                a[2] = g[2]
                recovered += 1
        print(f"gc_1m_wk1: {recovered} dirty extremes recovered from GC=F")

    # drop bars outside the CME Globex session (TradingView has none there):
    # daily 17:00-18:00 ET maintenance break, and the weekend gap from
    # Friday 17:00 to Sunday 18:00
    def in_session(ts):
        dt = datetime.fromtimestamp(ts, ET)
        wd, hm = dt.weekday(), dt.hour * 60 + dt.minute
        if 17 * 60 <= hm < 18 * 60:
            return False
        if wd == 4 and hm >= 17 * 60 or wd == 5 or (wd == 6 and hm < 18 * 60):
            return False
        return True

    dropped = len(agg)
    agg = {t: v for t, v in agg.items() if in_session(t)}
    merged = {t: v for t, v in merged.items() if in_session(t)}
    print(f"session filter: dropped {dropped - len(agg)} off-session 5m bars")

    with open("mgc_1m_et.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "open", "high", "low", "close", "volume"])
        for t in sorted(merged):
            o, h, l, c, v, _ = merged[t]
            dt = datetime.fromtimestamp(t, ET)
            w.writerow([dt.strftime("%Y-%m-%d %H:%M:%S"),
                        round(o, 1), round(h, 1), round(l, 1), round(c, 1), int(v)])
    print(f"mgc_1m_et.csv: {len(merged)} 1m bars")

    with open("mgc_5m_et.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "open", "high", "low", "close", "volume"])
        for slot in sorted(agg):
            o, h, l, c, v = agg[slot]
            dt = datetime.fromtimestamp(slot, ET)
            w.writerow([dt.strftime("%Y-%m-%d %H:%M:%S"),
                        round(o, 1), round(h, 1), round(l, 1), round(c, 1), int(v)])
    first = datetime.fromtimestamp(min(agg), ET)
    last = datetime.fromtimestamp(max(agg), ET)
    print(f"mgc_5m_et.csv: {len(agg)} 5m bars, {first:%Y-%m-%d %H:%M} -> {last:%Y-%m-%d %H:%M} ET")


if __name__ == "__main__":
    main()
