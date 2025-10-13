import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getOctokitForInstallation } from '../shared/octokit';

/**
 * Minimal SSE endpoint using v4 Response + ReadableStream.
 * Exposes a simple tool list and allows invoking tools by sending a JSON body
 * to the REST endpoints. This is a pragmatic bridge while full MCP HTTP transport
 * is being finalized for your workspace.
 */
export async function mcp(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const encoder = new TextEncoder();
  context.log('SSE connection established');

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      // Announce availability + tools
      send({ type: 'hello', server: 'oniq-pr-bot', version: '2.1.0' });
      send({
        type: 'tools',
        items: [
          {
            name: 'createBranch',
            inputSchema: {
              type: 'object', required: ['owner','repo','newBranch'],
              properties: { owner:{type:'string'}, repo:{type:'string'}, base:{type:'string', default:'main'}, newBranch:{type:'string'}, installationId:{ anyOf:[{type:'string'},{type:'number'}] } }
            }
          },
          {
            name: 'batchCommit',
            inputSchema: {
              type: 'object', required: ['owner','repo','branch','files','message'],
              properties: {
                owner:{type:'string'}, repo:{type:'string'}, branch:{type:'string'}, message:{type:'string'}, installationId:{ anyOf:[{type:'string'},{type:'number'}] },
                files:{ type:'array', items:{ type:'object', required:['path','content'], properties:{ path:{type:'string'}, content:{type:'string'} } } }
              }
            }
          },
          {
            name: 'openPR',
            inputSchema: {
              type: 'object', required: ['owner','repo','head','title'],
              properties: { owner:{type:'string'}, repo:{type:'string'}, head:{type:'string'}, base:{type:'string', default:'main'}, title:{type:'string'}, body:{type:'string'}, installationId:{ anyOf:[{type:'string'},{type:'number'}] } }
            }
          },
          {
            name: 'commentPR',
            inputSchema: {
              type: 'object', required: ['owner','repo','number','body'],
              properties: { owner:{type:'string'}, repo:{type:'string'}, number:{type:'number'}, body:{type:'string'}, installationId:{ anyOf:[{type:'string'},{type:'number'}] } }
            }
          }
        ]
      });

      // Keep-alive pings
      const iv = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 15000);

      // Close handling
      const close = () => { clearInterval(iv); try { controller.close(); } catch {} };
      // Azure Functions v4 does not expose a direct close event on req; rely on client disconnect.
      // The function runtime will GC the stream when connection ends.
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}
