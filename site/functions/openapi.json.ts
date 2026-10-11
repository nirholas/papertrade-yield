import { OPENAPI } from '../../src/openapi';

export const onRequestGet: PagesFunction = async () =>
  new Response(JSON.stringify(OPENAPI, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=3600',
    },
  });
