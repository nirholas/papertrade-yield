/**
 * /mcp: Model Context Protocol server (Streamable HTTP, stateless, JSON-RPC 2.0).
 * Read-only tools over PAPER staking data. Nothing here signs, submits or moves funds.
 */
import { handleMcp } from './_lib/mcp';
import { serverConfig } from '../../src/mcp-tools';

interface Env {
  PAPERTRADE_API_URL?: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const origin = new URL(request.url).origin;
  return handleMcp(request, serverConfig(origin), { data: { baseUrl: env.PAPERTRADE_API_URL }, siteUrl: origin });
};
