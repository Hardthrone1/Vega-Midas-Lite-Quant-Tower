import { NextResponse } from 'next/server';
import VaultSync from '@/lib/vault-sync';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validationData = body;

    // Initialize vault bridge
    const vaultPath = process.env.VAULT_PATH || 'C:\\Users\\Softthrone\\Claude\\Dashboard\\Obsidian';
    const vault = new VaultSync(vaultPath);

    // Create validation entry in vault
    const result = await vault.createValidationEntry(validationData);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Validation entry creation failed' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, filepath: result.filepath },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[VALIDATE API ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
