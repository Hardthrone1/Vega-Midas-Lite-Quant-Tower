#!/usr/bin/env python3
import json
from pathlib import Path

# Load graph
graph_path = Path('graphify-out/graph.json')
with open(graph_path, 'r', encoding='utf-8') as f:
    graph = json.load(f)

# Find Vega Gateway nodes
vega_nodes = [n for n in graph['nodes'] if 'vega' in n['label'].lower() and 'gateway' in n['label'].lower()]
print(f"Found {len(vega_nodes)} Vega Gateway node(s):\n")

nodes_by_id = {n['id']: n for n in graph['nodes']}
links = graph.get('links', [])

for node in vega_nodes[:3]:
    node_id = node['id']
    print(f"{'='*80}")
    print(f"NODE: {node['label']}")
    print(f"ID: {node_id}")
    print(f"Type: {node.get('type', 'unknown')}")
    print(f"Community: {node.get('community', 'N/A')}")
    
    # Find all connected edges
    edges = [e for e in links if e['source'] == node_id or e['target'] == node_id]
    print(f"\n🔗 CONNECTED TO: {len(edges)} component(s)\n")
    
    # Group by direction
    outgoing = [e for e in edges if e['source'] == node_id]
    incoming = [e for e in edges if e['target'] == node_id]
    
    if outgoing:
        print("📤 OUTGOING (Gateway calls/uses):")
        for edge in outgoing[:20]:
            target = nodes_by_id.get(edge['target'], {})
            relation = edge.get('label', 'calls')
            print(f"  → {target.get('label', edge['target'])} [{relation}]")
        if len(outgoing) > 20:
            print(f"  ... and {len(outgoing) - 20} more")
    
    if incoming:
        print("\n📥 INCOMING (Components that use Gateway):")
        for edge in incoming[:20]:
            source = nodes_by_id.get(edge['source'], {})
            relation = edge.get('label', 'uses')
            print(f"  ← {source.get('label', edge['source'])} [{relation}]")
        if len(incoming) > 20:
            print(f"  ... and {len(incoming) - 20} more")
    
    print()

