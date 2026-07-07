#!/usr/bin/env python3
import json

with open('graphify-out/graph.json') as f:
    g = json.load(f)

# All Vega components
vega = [n for n in g['nodes'] if 'vega' in n['label'].lower()]
print(f'🏗️ VEGA TOWER: {len(vega)} components\n')
for n in vega:
    print(f"  • {n['label']}")
