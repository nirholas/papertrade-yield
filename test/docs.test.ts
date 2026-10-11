import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error build script is plain ESM JavaScript without declarations
import * as docs from '../scripts/build-docs.mjs';

const ROOT = join(__dirname, '..');
type Tool = { name: string; title: string; description: string; inputSchema: { properties?: Record<string, unknown> } };
type Page = { slug: string; url: string; mdUrl: string; title: string; description: string; markdown: string };

let TOOLS: Tool[];
let pages: Page[];

beforeAll(async () => {
  const mcp = await docs.loadMcp();
  TOOLS = mcp.TOOLS;
  pages = docs.loadPages(TOOLS);
});

describe('docs pages', () => {
  it('has every required page', () => {
    const slugs = pages.map((p) => p.slug);
    for (const required of ['', 'quickstart', 'concepts', 'reference', 'mcp', 'connect-your-ai', 'agent-discovery', 'self-hosting', 'security', 'faq', 'changelog']) {
      expect(slugs).toContain(required);
    }
  });

  it('rejects a page without front matter', () => {
    expect(() => docs.parseFrontMatter('# no front matter', 'x.md')).toThrow(/front matter/);
    expect(() => docs.parseFrontMatter('---\ntitle: T\n---\nbody', 'x.md')).toThrow(/description/);
  });

  it('never uses em-dash, en-dash or emoji characters', () => {
    for (const p of pages) {
      expect(p.markdown, p.slug).not.toMatch(/[–—]/);
      expect(p.markdown, p.slug).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('expands the tool and changelog placeholders', () => {
    const mcp = pages.find((p) => p.slug === 'mcp')!;
    expect(mcp.markdown).not.toContain('{{tools}}');
    for (const t of TOOLS) expect(mcp.markdown).toContain(`### ${t.name}`);
    const log = pages.find((p) => p.slug === 'changelog')!;
    expect(log.markdown).not.toContain('{{changelog}}');
    expect(log.markdown).toContain('0.2.0');
  });

  it('resolves every internal docs link to a real page', () => {
    const urls = new Set(pages.map((p) => p.url));
    for (const p of pages) {
      for (const m of p.markdown.matchAll(/\]\((\/docs\/[^)#]*)(#[^)]*)?\)/g)) {
        expect(urls.has(m[1]), `${p.slug} links to ${m[1]}`).toBe(true);
      }
    }
  });

  it('renders markdown to safe HTML with copy buttons, anchors and scrollable tables', () => {
    const html = docs.renderMarkdown('## Title\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```bash\necho "<b>"\n```\n\n<script>alert(1)</script>\n');
    expect(html).toContain('id="title"');
    expect(html).toContain('class="table-wrap"');
    expect(html).toContain('class="copy"');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<script>');
  });

  it('lists the tool arguments from the live schemas', () => {
    const md: string = docs.toolsMarkdown(TOOLS);
    const apr = TOOLS.find((t) => t.name === 'get_apr')!;
    for (const arg of Object.keys(apr.inputSchema.properties ?? {})) expect(md).toContain(`| \`${arg}\` |`);
  });
});

describe('search index', () => {
  it('has an entry per page with headings and text', () => {
    const index = docs.searchIndex(pages) as Array<{ url: string; title: string; headings: unknown[]; text: string }>;
    expect(index).toHaveLength(pages.length);
    for (const entry of index) {
      expect(entry.text.length).toBeGreaterThan(100);
      expect(entry.url.startsWith('/docs/')).toBe(true);
    }
    expect(index.find((e) => e.url === '/docs/mcp/')!.text).toContain('get_apr');
  });
});

describe('discovery files', () => {
  it('server card matches the live MCP tools and transport', () => {
    const mcp = JSON.parse(JSON.stringify(docs.serverCard(TOOLS, 'instructions', '0.2.0')));
    expect(mcp.serverInfo.name).toBe('papertrade-yield');
    expect(mcp.transport).toEqual({ type: 'streamable-http', endpoint: '/mcp', url: `${docs.ORIGIN}/mcp` });
    expect(mcp.capabilities.tools).toEqual({ listChanged: false });
    expect(mcp.tools.map((t: { name: string }) => t.name)).toEqual(TOOLS.map((t) => t.name));
  });

  it('agent card maps each MCP tool to a skill', () => {
    const card = docs.agentCard(TOOLS, '0.2.0');
    expect(card.skills.map((s: { id: string }) => s.id)).toEqual(TOOLS.map((t) => t.name));
    for (const s of card.skills) expect(s.examples.length).toBeGreaterThan(0);
    for (const key of ['name', 'description', 'url', 'version', 'capabilities', 'defaultInputModes', 'defaultOutputModes', 'provider', 'documentationUrl']) {
      expect(card, key).toHaveProperty(key);
    }
  });

  it('api catalog is an RFC 9727 linkset covering openapi, mcp, docs and llms.txt', () => {
    const text = JSON.stringify(docs.apiCatalog());
    for (const part of ['/openapi.json', '/mcp', '/docs/', '/llms.txt']) expect(text).toContain(part);
    expect(docs.apiCatalog().linkset[0].anchor).toBe(`${docs.ORIGIN}/`);
  });

  it('llms.txt lists every page markdown twin and llms-full.txt inlines them', () => {
    const index: string = docs.llmsTxt(pages);
    const full: string = docs.llmsFullTxt(pages);
    for (const p of pages) {
      expect(index).toContain(`${docs.ORIGIN}${p.mdUrl}`);
      expect(full).toContain(p.markdown.trim().split('\n')[0]);
    }
    expect(full.length).toBeGreaterThan(index.length * 3);
  });

  it('sitemap includes docs pages and robots allows the AI crawlers with a content signal', () => {
    const map: string = docs.sitemap(pages, '2026-10-11');
    for (const p of pages) expect(map).toContain(`<loc>${docs.ORIGIN}${p.url}</loc>`);
    const robots: string = docs.robotsTxt();
    expect(robots).toContain('Content-Signal:');
    for (const bot of ['GPTBot', 'ClaudeBot', 'Claude-User', 'OAI-SearchBot', 'Google-Extended', 'PerplexityBot']) {
      expect(robots).toMatch(new RegExp(`User-agent: ${bot}\\nAllow: /`));
    }
  });
});

describe('static configuration', () => {
  it('app route allows the OS host as a frame ancestor and the docs and other routes do not', () => {
    const headers = readFileSync(join(ROOT, 'site/public/_headers'), 'utf8');
    const root = headers.split(/\n\n/).find((b) => b.startsWith('/\n'))!;
    expect(root).toContain("frame-ancestors 'self' https://papertrade-os.pages.dev https://*.pages.dev");
    expect(root).toContain('rel="api-catalog"');
    expect(root).toContain('rel="service-desc"');
    expect(root).toContain('rel="mcp"');
    expect(headers).toContain('application/linkset+json');
    const wildcard = headers.split(/\n\n/).find((b) => b.startsWith('/*\n'))!;
    for (const h of ['X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) expect(wildcard).toContain(h);
    expect(wildcard).not.toContain('frame-ancestors');
  });

  it('server.json names the registry entry and points at the live MCP endpoint', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const server = JSON.parse(readFileSync(join(ROOT, 'server.json'), 'utf8'));
    expect(pkg.mcpName).toBe('io.github.nirholas/papertrade-yield');
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.remotes).toEqual([{ type: 'streamable-http', url: `${docs.ORIGIN}/mcp` }]);
    expect(existsSync(join(ROOT, 'glama.json'))).toBe(true);
  });

  it('openapi describes the MCP endpoint and discovery files', async () => {
    const { OPENAPI } = await import('../src/openapi');
    for (const path of ['/mcp', '/.well-known/mcp/server-card.json', '/.well-known/agent-card.json', '/.well-known/api-catalog', '/llms.txt', '/llms-full.txt']) {
      expect(OPENAPI.paths).toHaveProperty([path]);
    }
    expect(OPENAPI.openapi).toBe('3.1.0');
  });
});
