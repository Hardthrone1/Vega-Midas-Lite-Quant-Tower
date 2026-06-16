/**
 * vault-sync.js
 *
 * Local Obsidian vault bridge for MIDAS Orchestrator
 *
 * Features:
 * - Query vault by tags (#outside-bar, #weekly-confluence, etc.)
 * - Extract YAML frontmatter for metadata
 * - Return condensed summaries to minimize token usage
 * - Cost: $0 (all local, no API calls)
 */

const fs = require('fs');
const path = require('path');

class VaultSync {
  constructor(vaultPath) {
    this.vaultPath = vaultPath || process.env.OBSIDIAN_VAULT_PATH || './MIDAS Trading Vault';
    this.cache = new Map(); // Simple in-memory cache
    this.lastSync = null;
    this.fileIndex = []; // Index of all markdown files

    console.log(`[VAULT] Initializing vault at: ${this.vaultPath}`);
    this.indexVault();
  }

  /**
   * Index all markdown files in vault
   * Run on init to build fast lookups
   */
  indexVault() {
    try {
      const startTime = Date.now();
      this.fileIndex = this.walkDirectory(this.vaultPath, '.md');
      const duration = Date.now() - startTime;
      console.log(`[VAULT] Indexed ${this.fileIndex.length} notes in ${duration}ms`);
      this.lastSync = new Date();
    } catch (err) {
      console.error(`[VAULT] Indexing failed: ${err.message}`);
      this.fileIndex = [];
    }
  }

  /**
   * Recursively walk directory and find markdown files
   */
  walkDirectory(dir, ext) {
    const files = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Recurse into subdirectories
          files.push(...this.walkDirectory(fullPath, ext));
        } else if (entry.name.endsWith(ext)) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      console.warn(`[VAULT] Failed to read ${dir}: ${err.message}`);
    }

    return files;
  }

  /**
   * Search vault by tags
   * Returns top 3 most relevant recent analyses
   * Cost: $0 (local search)
   */
  async search(tags = []) {
    try {
      if (tags.length === 0) {
        return { summary: 'No tags specified', notes: [] };
      }

      // Check cache first
      const cacheKey = tags.sort().join('|');
      if (this.cache.has(cacheKey)) {
        console.log(`[VAULT] Cache hit for tags: ${cacheKey}`);
        return this.cache.get(cacheKey);
      }

      // Search for matching notes
      const matches = this.searchNotes(tags);

      // Sort by date (most recent first) and take top 3
      const topMatches = matches
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 3);

      // Condense results to minimize token usage
      const result = {
        summary: this.condenseSummary(topMatches),
        notes: topMatches,
        tagsCaught: tags,
        timestamp: new Date().toISOString()
      };

      // Cache for 5 minutes
      this.cache.set(cacheKey, result);
      setTimeout(() => this.cache.delete(cacheKey), 300000);

      console.log(`[VAULT] Found ${topMatches.length} matches for tags: ${tags.join(', ')}`);
      return result;

    } catch (err) {
      console.error(`[VAULT] Search failed: ${err.message}`);
      return { summary: 'Vault search failed', notes: [], error: err.message };
    }
  }

  /**
   * Search all indexed notes for matching tags
   */
  searchNotes(searchTags) {
    const matches = [];

    for (const filePath of this.fileIndex) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const metadata = this.extractFrontmatter(content);
        const tags = metadata.tags || [];

        // Check if any search tags match file tags
        if (searchTags.some(tag => tags.includes(tag.replace('#', '')))) {
          matches.push({
            title: metadata.title || path.basename(filePath, '.md'),
            path: filePath,
            tags: tags,
            date: metadata.date || new Date(fs.statSync(filePath).mtime),
            winRate: metadata.winRate || null,
            confidence: metadata.confidence || null,
            summary: this.summarizeContent(content, 100) // 100 char summary
          });
        }
      } catch (err) {
        // Skip files that can't be read
      }
    }

    return matches;
  }

  /**
   * Extract YAML frontmatter from markdown
   * Looks for:
   * - title
   * - tags
   * - date
   * - winRate
   * - confidence
   */
  extractFrontmatter(content) {
    const metadata = {};
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (fmMatch) {
      const fmContent = fmMatch[1];

      // Parse YAML-like frontmatter
      const lines = fmContent.split('\n');
      for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();

        if (key === 'title') metadata.title = value;
        if (key === 'tags') metadata.tags = value.split(',').map(t => t.trim());
        if (key === 'date') metadata.date = new Date(value);
        if (key === 'winRate') metadata.winRate = parseFloat(value);
        if (key === 'confidence') metadata.confidence = parseFloat(value);
      }
    }

    return metadata;
  }

  /**
   * Summarize content to N characters
   * Skip frontmatter and headings
   */
  summarizeContent(content, maxChars = 100) {
    // Remove frontmatter
    const withoutFm = content.replace(/^---\n[\s\S]*?\n---\n/, '');

    // Remove markdown syntax
    const plain = withoutFm
      .replace(/^#+\s+/gm, '') // Remove headings
      .replace(/[*_`]/g, '') // Remove italic/bold/code markers
      .split('\n')
      .filter(line => line.trim().length > 0)
      .join(' ');

    return plain.substring(0, maxChars) + (plain.length > maxChars ? '...' : '');
  }

  /**
   * Condense top matches into a single summary
   * Minimizes token usage for synthesis prompt
   */
  condenseSummary(matches) {
    if (matches.length === 0) {
      return 'No historical context available.';
    }

    const summaries = matches.map(m => {
      let line = `• ${m.title}`;
      if (m.winRate) line += ` (${(m.winRate * 100).toFixed(1)}%)`;
      if (m.confidence) line += ` [confidence: ${(m.confidence * 100).toFixed(0)}%]`;
      return line;
    }).join('\n');

    return `Found ${matches.length} similar analyses:\n${summaries}`;
  }

  /**
   * Query by pattern name (e.g., "outside bar")
   * Returns all notes matching that pattern tag
   */
  async queryPattern(patternName) {
    return this.search([`${patternName.toLowerCase().replace(/\s/g, '-')}`]);
  }

  /**
   * Get statistics for a tag
   * Used to show "You've analyzed 47 outside bars"
   */
  getTagStats(tag) {
    const matches = this.searchNotes([tag]);
    const winRates = matches
      .filter(m => m.winRate !== null)
      .map(m => m.winRate);

    return {
      count: matches.length,
      avgWinRate: winRates.length > 0
        ? (winRates.reduce((a, b) => a + b, 0) / winRates.length)
        : null,
      avgConfidence: matches
        .filter(m => m.confidence !== null)
        .map(m => m.confidence)
        .reduce((a, b) => a + b, 0) / (matches.length || 1),
      recentAnalyses: matches.slice(0, 5)
    };
  }

  /**
   * Create new vault entry (called after analysis completion)
   * Saves analysis to vault for future reference
   */
  async createAnalysisEntry(analysis) {
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${timestamp} ${analysis.title || 'Analysis'}.md`;
      const filepath = path.join(this.vaultPath, 'Setups', filename);

      // Create frontmatter
      const frontmatter = `---\ntitle: ${analysis.title || 'Setup Analysis'}\ndate: ${new Date().toISOString()}\ntags: ${analysis.tags?.join(', ') || 'general'}\nwinRate: ${analysis.winRate || null}\nconfidence: ${analysis.confidence || null}\n---\n\n`;

      // Build content
      let content = frontmatter;
      content += `## Analysis\n${analysis.summary}\n\n`;

      if (analysis.swarmResults) {
        content += `## Agent Results\n`;
        for (const agent of analysis.swarmResults) {
          content += `### ${agent.agent}\n${agent.result}\n\n`;
        }
      }

      if (analysis.auditNotes) {
        content += `## Claude Audit\n${analysis.auditNotes}\n\n`;
      }

      // Create directory if it doesn't exist
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(filepath, content, 'utf-8');
      console.log(`[VAULT] Created: ${filename}`);

      // Update index
      this.fileIndex.push(filepath);

      return { success: true, filepath };
    } catch (err) {
      console.error(`[VAULT] Failed to create entry: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get all available tags in vault
   * Used for tag autocomplete in UI
   */
  getAllTags() {
    const tagSet = new Set();

    for (const filePath of this.fileIndex) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const metadata = this.extractFrontmatter(content);
        (metadata.tags || []).forEach(tag => tagSet.add(tag));
      } catch (err) {
        // Skip
      }
    }

    return Array.from(tagSet).sort();
  }

  /**
   * Health check
   */
  getStatus() {
    return {
      vaultPath: this.vaultPath,
      notesIndexed: this.fileIndex.length,
      lastSync: this.lastSync,
      cacheSize: this.cache.size,
      healthy: this.fileIndex.length > 0
    };
  }
}

// Export for Node.js
module.exports = VaultSync;
