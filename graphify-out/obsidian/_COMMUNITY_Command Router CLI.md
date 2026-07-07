---
type: community
cohesion: 0.19
members: 26
---

# Command Router CLI

**Cohesion:** 0.19 - loosely connected
**Members:** 26 nodes

## Members
- [[alerts.js]] - code - tradingview-mcp-jackson/src/cli/commands/alerts.js
- [[capture.js]] - code - tradingview-mcp-jackson/src/cli/commands/capture.js
- [[chart.js]] - code - tradingview-mcp-jackson/src/cli/commands/chart.js
- [[commands]] - code - tradingview-mcp-jackson/src/cli/router.js
- [[data.js]] - code - tradingview-mcp-jackson/src/cli/commands/data.js
- [[drawing.js]] - code - tradingview-mcp-jackson/src/cli/commands/drawing.js
- [[execute()]] - code - tradingview-mcp-jackson/src/cli/router.js
- [[handleError()]] - code - tradingview-mcp-jackson/src/cli/router.js
- [[health.js]] - code - tradingview-mcp-jackson/src/cli/commands/health.js
- [[index.js]] - code - tradingview-mcp-jackson/src/cli/index.js
- [[indicator.js]] - code - tradingview-mcp-jackson/src/cli/commands/indicator.js
- [[layout.js]] - code - tradingview-mcp-jackson/src/cli/commands/layout.js
- [[morning.js]] - code - tradingview-mcp-jackson/src/cli/commands/morning.js
- [[pane.js]] - code - tradingview-mcp-jackson/src/cli/commands/pane.js
- [[pine.js]] - code - tradingview-mcp-jackson/src/cli/commands/pine.js
- [[printCommandHelp()]] - code - tradingview-mcp-jackson/src/cli/router.js
- [[printHelp()]] - code - tradingview-mcp-jackson/src/cli/router.js
- [[readStdin()]] - code - tradingview-mcp-jackson/src/cli/commands/pine.js
- [[register()]] - code - tradingview-mcp-jackson/src/cli/router.js
- [[replay.js]] - code - tradingview-mcp-jackson/src/cli/commands/replay.js
- [[router.js]] - code - tradingview-mcp-jackson/src/cli/router.js
- [[run()]] - code - tradingview-mcp-jackson/src/cli/router.js
- [[stream.js]] - code - tradingview-mcp-jackson/src/cli/commands/stream.js
- [[tab.js]] - code - tradingview-mcp-jackson/src/cli/commands/tab.js
- [[ui.js]] - code - tradingview-mcp-jackson/src/cli/commands/ui.js
- [[watchlist.js]] - code - tradingview-mcp-jackson/src/cli/commands/watchlist.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Command_Router_CLI
SORT file.name ASC
```

## Connections to other communities
- 6 edges to [[_COMMUNITY_Browser Tab Management]]
- 4 edges to [[_COMMUNITY_Chart State Controller]]
- 3 edges to [[_COMMUNITY_Automated Screenshot Service]]
- 2 edges to [[_COMMUNITY_Alert and Layout Management]]
- 1 edge to [[_COMMUNITY_Server Session Management]]
- 1 edge to [[_COMMUNITY_Pine Script Editor]]
- 1 edge to [[_COMMUNITY_Replay Control API]]
- 1 edge to [[_COMMUNITY_Data Stream Polling]]

## Top bridge nodes
- [[indicator.js]] - degree 6, connects to 2 communities
- [[chart.js]] - degree 5, connects to 2 communities
- [[pine.js]] - degree 5, connects to 1 community
- [[alerts.js]] - degree 4, connects to 1 community
- [[capture.js]] - degree 4, connects to 1 community