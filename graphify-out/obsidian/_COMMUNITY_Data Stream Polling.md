---
type: community
cohesion: 0.18
members: 17
---

# Data Stream Polling

**Cohesion:** 0.18 - loosely connected
**Members:** 17 nodes

## Members
- [[fetchAllPanes()]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[fetchLabels()]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[fetchLastBar()]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[fetchLines()]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[fetchQuote()]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[fetchTables()]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[fetchValues()]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[pollLoop()]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[sleep()]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[stream.js_1]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[streamAllPanes()]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[streamBars()]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[streamLabels()]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[streamLines()]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[streamQuote()]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[streamTables()]] - code - tradingview-mcp-jackson/src/core/stream.js
- [[streamValues()]] - code - tradingview-mcp-jackson/src/core/stream.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Data_Stream_Polling
SORT file.name ASC
```

## Connections to other communities
- 8 edges to [[_COMMUNITY_Chart State Controller]]
- 1 edge to [[_COMMUNITY_Command Router CLI]]
- 1 edge to [[_COMMUNITY_Automated Screenshot Service]]

## Top bridge nodes
- [[stream.js_1]] - degree 19, connects to 3 communities
- [[fetchAllPanes()]] - degree 2, connects to 1 community
- [[fetchLabels()]] - degree 2, connects to 1 community
- [[fetchLastBar()]] - degree 2, connects to 1 community
- [[fetchLines()]] - degree 2, connects to 1 community