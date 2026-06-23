import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const response = await fetch('http://localhost:8001/api/test-constraints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strictBarstate: body.strictBarstate,
        useAtrRisk: body.useAtrRisk,
        spreadPoints: body.spreadPoints,
        slippageTicks: body.slippageTicks,
        replayLog: body.replayLog
      }),
    });

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[NEXT API] Constraints injection failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
