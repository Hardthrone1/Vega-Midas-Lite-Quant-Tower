---
type: community
cohesion: 0.25
members: 8
---

# Deployment Status State

**Cohesion:** 0.25 - loosely connected
**Members:** 8 nodes

## Members
- [[DEPLOY_PIPELINE]] - code - Vega_code/src/shared/deployStatus.ts
- [[DeployStatus]] - code - Vega_code/src/shared/deployStatus.ts
- [[LABELS]] - code - Vega_code/src/shared/deployStatus.ts
- [[STATUS]] - code - Vega_code/src/shared/deployStatus.ts
- [[deployLabel()]] - code - Vega_code/src/shared/deployStatus.ts
- [[deployProgress()]] - code - Vega_code/src/shared/deployStatus.ts
- [[deployStatus.ts]] - code - Vega_code/src/shared/deployStatus.ts
- [[deployStatusKind()]] - code - Vega_code/src/shared/deployStatus.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Deployment_Status_State
SORT file.name ASC
```
