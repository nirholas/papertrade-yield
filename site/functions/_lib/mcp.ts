/**
 * Minimal, stateless MCP server over Streamable HTTP (JSON-RPC 2.0), built on the Fetch API only so it
 * runs unchanged in Cloudflare Pages Functions, Workers and vitest. No sessions, no cookies, no auth:
 * the endpoint is public and read-only, and the request Origin is never used to make a trust decision.
 */

export const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
export const DEFAULT_PROTOCOL = '2025-06-18';

export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: unknown;
  minItems?: number;
  maxItems?: number;
  oneOf?: JsonSchema[];
  [key: string]: unknown;
}

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface ToolResult {
  text: string;
  structured: Record<string, unknown>;
}

export interface ToolDef<Ctx> {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  annotations: ToolAnnotations;
  handler: (args: Record<string, unknown>, ctx: Ctx) => Promise<ToolResult>;
}

/** Thrown by a handler for an expected failure (bad input, upstream down). Becomes `isError: true`, not a protocol error. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export interface McpServerConfig<Ctx> {
  name: string;
  title: string;
  version: string;
  description?: string;
  instructions: string;
  websiteUrl?: string;
  tools: ToolDef<Ctx>[];
  /** Links returned by a plain GET. */
  links?: Record<string, string>;
  /** Tool calls allowed per client per window. Best effort and per isolate. */
  rateLimit?: { perWindow: number; windowMs: number };
  /** Largest accepted request body in bytes. */
  maxBodyBytes?: number;
  /** Largest accepted JSON-RPC batch. */
  maxBatch?: number;
}

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, Authorization',
  'access-control-expose-headers': 'Mcp-Session-Id, Mcp-Protocol-Version, Retry-After',
  'access-control-max-age': '86400',
  vary: 'Accept',
};

const COMMON = { ...CORS, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' };

type Id = string | number | null;
interface RpcMessage {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

const rpcError = (id: Id, code: number, message: string, data?: unknown) => ({
  jsonrpc: '2.0' as const,
  id,
  error: data === undefined ? { code, message } : { code, message, data },
});
const rpcResult = (id: Id, result: unknown) => ({ jsonrpc: '2.0' as const, id, result });

/** Validate a value against the JSON Schema subset the tools use. Returns a list of problems (empty when valid). */
export function validateAgainstSchema(value: unknown, schema: JsonSchema, path = 'arguments'): string[] {
  const problems: string[] = [];
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
  if (types.length > 0) {
    const ok = types.some((t) => t === actual || (t === 'number' && actual === 'integer'));
    if (!ok) return [`${path} must be ${types.join(' or ')}, got ${actual}`];
  }
  if (schema.enum && !schema.enum.includes(value)) problems.push(`${path} must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${path} must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${path} must be at most ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) problems.push(`${path} must be greater than ${schema.exclusiveMinimum}`);
    if (!Number.isFinite(value)) problems.push(`${path} must be finite`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) problems.push(`${path} is too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) problems.push(`${path} is too long`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) problems.push(`${path} does not match the required format ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) problems.push(`${path} needs at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) problems.push(`${path} allows at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => problems.push(...validateAgainstSchema(v, schema.items as JsonSchema, `${path}[${i}]`)));
  }
  if (actual === 'object' && schema.properties) {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (obj[key] === undefined) problems.push(`${path}.${key} is required`);
    for (const [key, v] of Object.entries(obj)) {
      const sub = schema.properties[key];
      if (sub) problems.push(...validateAgainstSchema(v, sub, `${path}.${key}`));
      else if (schema.additionalProperties === false) problems.push(`${path}.${key} is not a known field`);
    }
  }
  return problems;
}

const buckets = new Map<string, { count: number; resetAt: number }>();

function rateCheck(key: string, limit: { perWindow: number; windowMs: number }, now: number): number {
  if (buckets.size > 5000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + limit.windowMs });
    return 0;
  }
  b.count += 1;
  return b.count > limit.perWindow ? Math.max(1, Math.ceil((b.resetAt - now) / 1000)) : 0;
}

/** Reset the in-memory limiter (tests). */
export function resetRateLimits() {
  buckets.clear();
}

export function toolListing<Ctx>(tools: ToolDef<Ctx>[]) {
  return tools.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    outputSchema: t.outputSchema,
    annotations: { title: t.title, ...t.annotations },
  }));
}

async function callTool<Ctx>(config: McpServerConfig<Ctx>, params: unknown, ctx: Ctx, id: Id) {
  const p = (params ?? {}) as { name?: unknown; arguments?: unknown };
  if (typeof p.name !== 'string') return rpcError(id, -32602, 'tools/call needs a string "name".');
  const tool = config.tools.find((t) => t.name === p.name);
  if (!tool) return rpcError(id, -32602, `Unknown tool: ${p.name}`);
  const args = p.arguments === undefined ? {} : p.arguments;
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return rpcError(id, -32602, '"arguments" must be an object.');
  const problems = validateAgainstSchema(args, tool.inputSchema);
  if (problems.length > 0) {
    return rpcResult(id, { isError: true, content: [{ type: 'text', text: `Invalid arguments for ${tool.name}: ${problems.join('; ')}.` }] });
  }
  try {
    const out = await tool.handler(args as Record<string, unknown>, ctx);
    return rpcResult(id, { content: [{ type: 'text', text: out.text }], structuredContent: out.structured });
  } catch (err) {
    const message = err instanceof ToolError ? err.message : `${tool.name} failed: ${err instanceof Error ? err.message : String(err)}`;
    return rpcResult(id, { isError: true, content: [{ type: 'text', text: message }] });
  }
}

/** Handle one JSON-RPC message. Returns null for notifications and for responses sent by the client. */
async function dispatch<Ctx>(config: McpServerConfig<Ctx>, raw: unknown, ctx: Ctx, limited: () => number): Promise<unknown | null> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return rpcError(null, -32600, 'Invalid Request: expected a JSON-RPC object.');
  const msg = raw as RpcMessage;
  const hasId = msg.id !== undefined;
  const id: Id = hasId && (typeof msg.id === 'string' || typeof msg.id === 'number' || msg.id === null) ? (msg.id as Id) : null;
  if (msg.jsonrpc !== '2.0') return rpcError(id, -32600, 'Invalid Request: jsonrpc must be "2.0".');
  if (typeof msg.method !== 'string') {
    if (hasId && (msg.result !== undefined || msg.error !== undefined)) return null;
    return rpcError(id, -32600, 'Invalid Request: method must be a string.');
  }
  if (hasId && id === null && msg.id !== null) return rpcError(null, -32600, 'Invalid Request: id must be a string or a number.');
  const method = msg.method;
  if (!hasId) return null;

  switch (method) {
    case 'initialize': {
      const asked = (msg.params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
      const protocolVersion = typeof asked === 'string' && (SUPPORTED_PROTOCOLS as readonly string[]).includes(asked) ? asked : DEFAULT_PROTOCOL;
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: config.name, title: config.title, version: config.version, ...(config.websiteUrl ? { websiteUrl: config.websiteUrl } : {}) },
        instructions: config.instructions,
      });
    }
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: toolListing(config.tools) });
    case 'resources/list':
      return rpcResult(id, { resources: [] });
    case 'resources/templates/list':
      return rpcResult(id, { resourceTemplates: [] });
    case 'prompts/list':
      return rpcResult(id, { prompts: [] });
    case 'tools/call': {
      const wait = limited();
      if (wait > 0) return rpcError(id, -32000, `Rate limit exceeded. Retry in ${wait} seconds.`, { retryAfterSeconds: wait });
      return callTool(config, msg.params, ctx, id);
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

function wantsSseOnly(accept: string | null): boolean {
  if (!accept) return false;
  const a = accept.toLowerCase();
  return a.includes('text/event-stream') && !a.includes('application/json') && !a.includes('*/*');
}

function respond(body: unknown, status: number, sse: boolean, extra: Record<string, string> = {}): Response {
  if (sse) {
    return new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, {
      status,
      headers: { ...COMMON, ...extra, 'content-type': 'text/event-stream; charset=utf-8' },
    });
  }
  return new Response(JSON.stringify(body), { status, headers: { ...COMMON, ...extra, 'content-type': 'application/json; charset=utf-8' } });
}

/** Entry point for every method on the MCP endpoint. */
export async function handleMcp<Ctx>(request: Request, config: McpServerConfig<Ctx>, ctx: Ctx, now: () => number = Date.now): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (method === 'GET') {
    if ((request.headers.get('accept') ?? '').toLowerCase().includes('text/event-stream')) {
      return new Response(JSON.stringify({ error: 'This server does not offer a server-to-client stream. Use POST.' }), {
        status: 405,
        headers: { ...COMMON, allow: 'POST, OPTIONS', 'content-type': 'application/json; charset=utf-8' },
      });
    }
    return new Response(
      JSON.stringify(
        {
          name: config.name,
          title: config.title,
          version: config.version,
          description: config.description,
          transport: 'streamable-http',
          protocolVersions: SUPPORTED_PROTOCOLS,
          endpoint: new URL(request.url).origin + new URL(request.url).pathname,
          usage: 'POST JSON-RPC 2.0 messages to this URL with Content-Type: application/json.',
          tools: config.tools.map((t) => ({ name: t.name, title: t.title, description: t.description })),
          links: config.links ?? {},
        },
        null,
        2,
      ),
      { headers: { ...COMMON, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } },
    );
  }
  if (method === 'DELETE') {
    return new Response(JSON.stringify({ error: 'This server is stateless and has no sessions to end.' }), {
      status: 405,
      headers: { ...COMMON, allow: 'POST, OPTIONS', 'content-type': 'application/json; charset=utf-8' },
    });
  }
  if (method !== 'POST') {
    return new Response(JSON.stringify({ error: `Method ${method} is not allowed.` }), {
      status: 405,
      headers: { ...COMMON, allow: 'GET, POST, OPTIONS', 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const sse = wantsSseOnly(request.headers.get('accept'));
  const version = request.headers.get('mcp-protocol-version');
  if (version && !(SUPPORTED_PROTOCOLS as readonly string[]).includes(version)) {
    return respond(rpcError(null, -32600, `Unsupported MCP-Protocol-Version: ${version.slice(0, 40)}. Supported: ${SUPPORTED_PROTOCOLS.join(', ')}.`), 400, sse);
  }

  const maxBytes = config.maxBodyBytes ?? 64 * 1024;
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) return respond(rpcError(null, -32600, `Request body is larger than ${maxBytes} bytes.`), 413, sse);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) return respond(rpcError(null, -32600, `Request body is larger than ${maxBytes} bytes.`), 413, sse);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return respond(rpcError(null, -32700, 'Parse error: the body is not valid JSON.'), 400, sse);
  }

  const limit = config.rateLimit ?? { perWindow: 60, windowMs: 60_000 };
  const client = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
  let retryAfter = 0;
  const limited = () => {
    retryAfter = rateCheck(client, limit, now());
    return retryAfter;
  };

  if (Array.isArray(parsed)) {
    const maxBatch = config.maxBatch ?? 20;
    if (parsed.length === 0) return respond(rpcError(null, -32600, 'Invalid Request: empty batch.'), 400, sse);
    if (parsed.length > maxBatch) return respond(rpcError(null, -32600, `Invalid Request: batch is limited to ${maxBatch} messages.`), 400, sse);
    const out = (await Promise.all(parsed.map((m) => dispatch(config, m, ctx, limited)))).filter((r) => r !== null);
    if (out.length === 0) return new Response(null, { status: 202, headers: COMMON });
    return respond(out, 200, sse);
  }

  const out = await dispatch(config, parsed, ctx, limited);
  if (out === null) return new Response(null, { status: 202, headers: COMMON });
  const status = retryAfter > 0 ? 429 : 200;
  return respond(out, status, sse, retryAfter > 0 ? { 'retry-after': String(retryAfter) } : {});
}
