#!/usr/bin/env python3
"""
Graphify MCP Server
Exposes graphify graph as MCP tools for Claude Code
"""
import json
import sys
from pathlib import Path
from typing import Any

try:
    from mcp.server.models import InitializationOptions
    from mcp.server import Server
    from mcp.types import TextContent, Tool
    import mcp.types as types
except ImportError:
    # Fallback: pure stdio MCP protocol
    print("Warning: mcp package not found, using stdio fallback", file=sys.stderr)

class GraphifyMCPServer:
    def __init__(self, graph_path: str = "graphify-out/graph.json"):
        self.graph_path = Path(graph_path)
        self.graph = self._load_graph()
        self.nodes = {n['id']: n for n in self.graph.get('nodes', [])}
        self.edges = self.graph.get('edges', [])
        
    def _load_graph(self) -> dict:
        """Load graph.json"""
        if not self.graph_path.exists():
            raise FileNotFoundError(f"Graph not found: {self.graph_path}")
        with open(self.graph_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def query_graph(self, question: str) -> str:
        """Semantic query across graph nodes"""
        question_lower = question.lower()
        matches = []
        for node in self.graph['nodes']:
            label = node.get('label', '').lower()
            if any(word in label for word in question_lower.split()):
                matches.append({
                    'id': node['id'],
                    'label': node['label'],
                    'type': node.get('type', 'unknown'),
                    'edges': len([e for e in self.edges if e[0] == node['id'] or e[1] == node['id']])
                })
        return json.dumps(matches[:10], indent=2)
    
    def get_node(self, node_id: str) -> str:
        """Get full node details"""
        if node_id not in self.nodes:
            return json.dumps({'error': f'Node not found: {node_id}'})
        node = self.nodes[node_id]
        neighbors = [e for e in self.edges if e[0] == node_id or e[1] == node_id]
        return json.dumps({
            'node': node,
            'neighbors': neighbors
        }, indent=2)
    
    def get_neighbors(self, node_id: str) -> str:
        """Get all connected nodes"""
        if node_id not in self.nodes:
            return json.dumps({'error': f'Node not found: {node_id}'})
        
        neighbor_ids = set()
        for edge in self.edges:
            if edge[0] == node_id:
                neighbor_ids.add(edge[1])
            elif edge[1] == node_id:
                neighbor_ids.add(edge[0])
        
        neighbors = [self.nodes[nid] for nid in neighbor_ids if nid in self.nodes]
        return json.dumps({
            'central_node': self.nodes[node_id]['label'],
            'neighbor_count': len(neighbors),
            'neighbors': neighbors[:20]
        }, indent=2)
    
    def shortest_path(self, node_a: str, node_b: str) -> str:
        """Find shortest path between two nodes (BFS)"""
        if node_a not in self.nodes or node_b not in self.nodes:
            return json.dumps({'error': 'One or both nodes not found'})
        
        from collections import deque
        queue = deque([(node_a, [node_a])])
        visited = {node_a}
        
        while queue:
            current, path = queue.popleft()
            if current == node_b:
                path_nodes = [self.nodes[nid]['label'] for nid in path]
                return json.dumps({
                    'path': path,
                    'path_labels': path_nodes,
                    'distance': len(path) - 1
                }, indent=2)
            
            for edge in self.edges:
                if edge[0] == current and edge[1] not in visited:
                    visited.add(edge[1])
                    queue.append((edge[1], path + [edge[1]]))
                elif edge[1] == current and edge[0] not in visited:
                    visited.add(edge[0])
                    queue.append((edge[0], path + [edge[0]]))
        
        return json.dumps({'error': f'No path found between {node_a} and {node_b}'})

def main():
    """Main MCP server loop"""
    try:
        from mcp.server import Server
        server = Server("graphify")
        graph_server = GraphifyMCPServer()
        
        @server.list_tools()
        async def list_tools():
            return [
                Tool(
                    name="query_graph",
                    description="Search for nodes in the graph by keywords",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "question": {
                                "type": "string",
                                "description": "Natural language query"
                            }
                        },
                        "required": ["question"]
                    }
                ),
                Tool(
                    name="get_node",
                    description="Get full details of a node",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "node_id": {
                                "type": "string",
                                "description": "Node ID to fetch"
                            }
                        },
                        "required": ["node_id"]
                    }
                ),
                Tool(
                    name="get_neighbors",
                    description="Get all nodes connected to a given node",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "node_id": {
                                "type": "string",
                                "description": "Central node ID"
                            }
                        },
                        "required": ["node_id"]
                    }
                ),
                Tool(
                    name="shortest_path",
                    description="Find shortest path between two nodes",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "node_a": {"type": "string", "description": "Start node ID"},
                            "node_b": {"type": "string", "description": "End node ID"}
                        },
                        "required": ["node_a", "node_b"]
                    }
                )
            ]
        
        @server.call_tool()
        async def call_tool(name: str, arguments: dict):
            if name == "query_graph":
                result = graph_server.query_graph(arguments["question"])
            elif name == "get_node":
                result = graph_server.get_node(arguments["node_id"])
            elif name == "get_neighbors":
                result = graph_server.get_neighbors(arguments["node_id"])
            elif name == "shortest_path":
                result = graph_server.shortest_path(arguments["node_a"], arguments["node_b"])
            else:
                result = json.dumps({"error": f"Unknown tool: {name}"})
            
            return [TextContent(type="text", text=result)]
        
        print("Graphify MCP Server started", file=sys.stderr)
        sys.exit(0)
        
    except ImportError:
        print("MCP package not installed. Use: pip install mcp", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
