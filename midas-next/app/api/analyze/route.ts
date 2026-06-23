import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Proxy the request to your local MIDAS backend
    const response = await fetch('http://localhost:8001/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setup: body.setup,
        type: body.type || 'strategy-analysis',
        requiresAudit: true
      }),
    });

    if (!response.ok) {
      throw new Error(`Orchestrator returned status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[NEXT API] Diagnostics routing failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to connect to local swarm.' },
      { status: 500 }
    );
  }
}
