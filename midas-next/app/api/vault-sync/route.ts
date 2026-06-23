import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  // Use URL search params to pass a specific Task ID if needed
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId') || 'latest';

  try {
    const response = await fetch(`http://localhost:8001/api/vault-sync?taskId=${taskId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[NEXT API] Vault sync failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
