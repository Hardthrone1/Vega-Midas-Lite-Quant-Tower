---
type: community
cohesion: 0.36
members: 8
---

# MRE WebSocket Server

**Cohesion:** 0.36 - loosely connected
**Members:** 8 nodes

## Members
- [[.__init__()]] - code - MRE_Server.py
- [[.next_bar()]] - code - MRE_Server.py
- [[.reset()]] - code - MRE_Server.py
- [[MRE_Server.py]] - code - MRE_Server.py
- [[ReplaySession]] - code - MRE_Server.py
- [[WebSocket]] - code
- [[health()]] - code - MRE_Server.py
- [[ws_stream()]] - code - MRE_Server.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/MRE_WebSocket_Server
SORT file.name ASC
```
