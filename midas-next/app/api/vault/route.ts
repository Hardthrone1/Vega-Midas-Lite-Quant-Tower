import { NextResponse } from 'next/server';
import VaultSync from '@/lib/vault-sync';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query');
    const type = searchParams.get('type'); // 'analysis' or 'validation'

    const vaultPath = process.env.VAULT_PATH || 'C:\\Users\\Softthrone\\Claude\\Dashboard\\Obsidian';
    const vault = new VaultSync(vaultPath);

    if (query) {
      // Search by tags/query
      const tags = query.split(',').map(t => t.trim());
      const result = await vault.search(tags);
      return NextResponse.json(result, { status: 200 });
    }

    // List all analyses and validations
    const baseDir = `${vaultPath}\\Setups`;

    let entries: any[] = [];

    try {
      // Read analysis files
      const analysisFiles = await readdir(baseDir);
      for (const file of analysisFiles) {
        if (file.endsWith('.md') && !file.includes('Validation')) {
          const filepath = join(baseDir, file);
          const content = await readFile(filepath, 'utf-8');

          // Extract frontmatter
          const match = content.match(/---\n([\s\S]*?)\n---/);
          if (match) {
            const frontmatter = match[1];
            const titleMatch = frontmatter.match(/title:\s*(.+)/);
            const dateMatch = frontmatter.match(/date:\s*(.+)/);
            const confidenceMatch = frontmatter.match(/confidence:\s*(.+)/);

            entries.push({
              file,
              type: 'analysis',
              title: titleMatch ? titleMatch[1] : file,
              date: dateMatch ? dateMatch[1] : 'Unknown',
              confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0,
              ruleCheckPassed: frontmatter.includes('ruleCheckPassed: true')
            });
          }
        }
      }

      // Read validation files if Validation subfolder exists
      try {
        const validationDir = join(baseDir, 'Validation');
        const validationFiles = await readdir(validationDir);
        for (const file of validationFiles) {
          if (file.endsWith('.md')) {
            const filepath = join(validationDir, file);
            const content = await readFile(filepath, 'utf-8');

            const match = content.match(/---\n([\s\S]*?)\n---/);
            if (match) {
              const frontmatter = match[1];
              const titleMatch = frontmatter.match(/title:\s*(.+)/);
              const dateMatch = frontmatter.match(/date:\s*(.+)/);
              const slippageMatch = frontmatter.match(/slippageDelta:\s*(.+)/);

              entries.push({
                file: `Validation/${file}`,
                type: 'validation',
                title: titleMatch ? titleMatch[1] : file,
                date: dateMatch ? dateMatch[1] : 'Unknown',
                slippageDelta: slippageMatch ? parseFloat(slippageMatch[1]) : null,
                compileStatus: frontmatter.includes('compileStatus: success') ? 'success' : 'pending'
              });
            }
          }
        }
      } catch (err) {
        // Validation folder might not exist yet
        console.log('[VAULT API] Validation folder not found, skipping');
      }
    } catch (err) {
      console.error('[VAULT API] Error reading Setups directory:', err);
    }

    // Sort by date descending
    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ entries, total: entries.length }, { status: 200 });
  } catch (error: any) {
    console.error('[VAULT API ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
