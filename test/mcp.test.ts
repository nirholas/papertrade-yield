import { beforeEach, describe, expect, it } from 'vitest';
import { handleMcp, resetRateLimits, validateAgainstSchema, ToolError, type McpServerConfig } from '../site/functions/_lib/mcp';

const config: McpServerConfig<null> = {
  name: 'demo',
  title: 'Demo',
  version: '1.2.3',
  instructions: 'Use the tools.',
  tools: [
    {
      name: 'echo',
      title: 'Echo',
      description: 'Echo a string.',
      inputSchema: { type: 'object', properties: { text: { type: 'string', minLength: 1 }, n: { type: 'integer', minimum: 1, maximum: 5 } }, required: ['text'], additionalProperties: false },
      outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      handler: async (args) => ({ text: String(args.text), structured: { text: args.text } }),
    },
    {
      name: 'boom',
      title: 'Boom',
      description: 'Always fails.',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object' },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      handler: async (args) => {
        if (args.kind === 'tool') throw new ToolError('expected failure');
        throw new Error('unexpected');
      },
    },
  ],
  rateLimit: { perWindow: 3, windowMs: 60_000 },
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
  handleMcp(
    new Request('https://x.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }),
    config,
    null,
  );
const rpc = (method: string, params?: unknown, id: number | string = 1) => ({ jsonrpc: '2.0', id, method, params });

beforeEach(() => resetRateLimits());

describe('initialize', () => {
  it('echoes a supported protocol version and advertises tools', async () => {
    const res = await post(rpc('initialize', { protocolVersion: '2024-11-05' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.result.protocolVersion).toBe('2024-11-05');
    expect(body.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(body.result.serverInfo).toMatchObject({ name: 'demo', title: 'Demo', version: '1.2.3' });
    expect(body.result.instructions).toBe('Use the tools.');
  });
  it('falls back to 2025-06-18 for an unknown version', async () => {
    const body = await (await post(rpc('initialize', { protocolVersion: '1999-01-01' }))).json();
    expect(body.result.protocolVersion).toBe('2025-06-18');
  });
});

describe('notifications, ping, lists', () => {
  it('answers a notification with 202 and no body', async () => {
    const res = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });
  it('answers ping and empty resource and prompt lists', async () => {
    expect((await (await post(rpc('ping'))).json()).result).toEqual({});
    expect((await (await post(rpc('resources/list'))).json()).result).toEqual({ resources: [] });
    expect((await (await post(rpc('prompts/list'))).json()).result).toEqual({ prompts: [] });
  });
  it('lists tools with schemas and annotations', async () => {
    const body = await (await post(rpc('tools/list'))).json();
    expect(body.result.tools).toHaveLength(2);
    expect(body.result.tools[0]).toMatchObject({ name: 'echo', title: 'Echo', annotations: { readOnlyHint: true, destructiveHint: false } });
    expect(body.result.tools[0].inputSchema.required).toEqual(['text']);
    expect(body.result.tools[0].outputSchema).toBeDefined();
  });
});

describe('tools/call', () => {
  it('returns text content and structuredContent', async () => {
    const body = await (await post(rpc('tools/call', { name: 'echo', arguments: { text: 'hi' } }))).json();
    expect(body.result.content).toEqual([{ type: 'text', text: 'hi' }]);
    expect(body.result.structuredContent).toEqual({ text: 'hi' });
    expect(body.result.isError).toBeUndefined();
  });
  it('reports invalid arguments as a tool error the model can read', async () => {
    const body = await (await post(rpc('tools/call', { name: 'echo', arguments: { n: 9 } }))).json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/text is required/);
    expect(body.result.content[0].text).toMatch(/at most 5/);
  });
  it('turns handler failures into isError results', async () => {
    const expected = await (await post(rpc('tools/call', { name: 'boom', arguments: { kind: 'tool' } }))).json();
    expect(expected.result).toMatchObject({ isError: true, content: [{ type: 'text', text: 'expected failure' }] });
    const unexpected = await (await post(rpc('tools/call', { name: 'boom', arguments: {} }))).json();
    expect(unexpected.result.isError).toBe(true);
    expect(unexpected.result.content[0].text).toMatch(/boom failed: unexpected/);
  });
  it('uses -32602 for an unknown tool', async () => {
    const body = await (await post(rpc('tools/call', { name: 'nope' }))).json();
    expect(body.error.code).toBe(-32602);
  });
});

describe('protocol errors', () => {
  it('-32700 for invalid JSON', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });
  it('-32600 for a non-RPC body and a wrong jsonrpc version', async () => {
    expect((await (await post('"hello"')).json()).error.code).toBe(-32600);
    expect((await (await post({ jsonrpc: '1.0', id: 1, method: 'ping' })).json()).error.code).toBe(-32600);
  });
  it('-32601 for an unknown method', async () => {
    const body = await (await post(rpc('nope/nope'))).json();
    expect(body.error.code).toBe(-32601);
    expect(body.id).toBe(1);
  });
  it('rejects an unsupported Mcp-Protocol-Version header', async () => {
    const res = await post(rpc('ping'), { 'mcp-protocol-version': '1999-01-01' });
    expect(res.status).toBe(400);
  });
  it('rejects an oversized body', async () => {
    const res = await post(rpc('tools/call', { name: 'echo', arguments: { text: 'x'.repeat(70_000) } }));
    expect(res.status).toBe(413);
  });
});

describe('batches', () => {
  it('answers requests in a batch and skips notifications', async () => {
    const res = await post([rpc('ping', undefined, 'a'), { jsonrpc: '2.0', method: 'notifications/initialized' }, rpc('tools/list', undefined, 'b')]);
    const body = await res.json();
    expect(body.map((r: { id: string }) => r.id)).toEqual(['a', 'b']);
  });
  it('rejects an empty batch', async () => {
    expect((await post([])).status).toBe(400);
  });
  it('returns 202 for a batch of only notifications', async () => {
    expect((await post([{ jsonrpc: '2.0', method: 'notifications/initialized' }])).status).toBe(202);
  });
});

describe('transport', () => {
  it('replies as one SSE message when only text/event-stream is accepted', async () => {
    const res = await post(rpc('ping'), { accept: 'text/event-stream' });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text.startsWith('event: message\ndata: ')).toBe(true);
    expect(JSON.parse(text.split('data: ')[1])).toMatchObject({ jsonrpc: '2.0', id: 1, result: {} });
  });
  it('GET with text/event-stream is 405 with Allow: POST', async () => {
    const res = await handleMcp(new Request('https://x.test/mcp', { headers: { accept: 'text/event-stream' } }), config, null);
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toContain('POST');
  });
  it('plain GET describes the server', async () => {
    const res = await handleMcp(new Request('https://x.test/mcp'), config, null);
    const body = await res.json();
    expect(body).toMatchObject({ name: 'demo', transport: 'streamable-http', endpoint: 'https://x.test/mcp' });
    expect(body.tools.map((t: { name: string }) => t.name)).toEqual(['echo', 'boom']);
  });
  it('DELETE is 405', async () => {
    expect((await handleMcp(new Request('https://x.test/mcp', { method: 'DELETE' }), config, null)).status).toBe(405);
  });
  it('answers the CORS preflight and sets CORS on responses', async () => {
    const pre = await handleMcp(new Request('https://x.test/mcp', { method: 'OPTIONS', headers: { origin: 'https://evil.test' } }), config, null);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    expect(pre.headers.get('access-control-allow-headers')).toMatch(/Mcp-Session-Id/);
    expect(pre.headers.get('access-control-allow-headers')).toMatch(/Mcp-Protocol-Version/);
    expect(pre.headers.get('access-control-allow-headers')).toMatch(/Authorization/);
    expect((await post(rpc('ping'))).headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('rate limit', () => {
  it('returns 429 with Retry-After after the per-window budget of tool calls', async () => {
    const call = () => post(rpc('tools/call', { name: 'echo', arguments: { text: 'a' } }), { 'cf-connecting-ip': '203.0.113.9' });
    for (let i = 0; i < 3; i++) expect((await call()).status).toBe(200);
    const res = await call();
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await res.json()).error.code).toBe(-32000);
    expect((await post(rpc('ping'), { 'cf-connecting-ip': '203.0.113.9' })).status).toBe(200);
  });
});

describe('validateAgainstSchema', () => {
  it('accepts a valid object and flags unknown fields', () => {
    const schema = config.tools[0].inputSchema;
    expect(validateAgainstSchema({ text: 'ok' }, schema)).toEqual([]);
    expect(validateAgainstSchema({ text: 'ok', extra: 1 }, schema)).toEqual(['arguments.extra is not a known field']);
  });
  it('checks types, enums and patterns', () => {
    expect(validateAgainstSchema(1.5, { type: 'integer' })).toHaveLength(1);
    expect(validateAgainstSchema('c', { type: 'string', enum: ['a', 'b'] })).toHaveLength(1);
    expect(validateAgainstSchema('0xzz', { type: 'string', pattern: '^0x[0-9a-f]+$' })).toHaveLength(1);
  });
});
