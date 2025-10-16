// src/functions/mcp/nodehttpAdapter.ts
import { EventEmitter, Readable } from "node:stream";
import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from "node:http";
import { InvocationContext } from "@azure/functions";

type HeadersInitLike = Record<string, string | number | readonly string[]>;

function toNodeHeaders(h: Headers): Record<string, string | number | string[]> {
    const out: Record<string, string | number | string[]> = {};
    h.forEach((v, k) => (out[k.toLowerCase()] = v));
    return out;
}


export function makeNodeIncomingMessage(opts: {
    url: string;
    method: string;
    headers: Headers;
    bodyText?: string;
    ctx?: InvocationContext;
}): IncomingMessage & { auth?: unknown } {
    const bodyBuf = opts.bodyText ? Buffer.from(opts.bodyText) : undefined;


    const readable = new Readable({
        read() {
            if (bodyBuf && bodyBuf.length) this.push(bodyBuf);
            this.push(null);
        },
    }) as unknown as IncomingMessage & { auth?: unknown };

    const url = new URL(opts.url);
    (readable as any).url = url.pathname + (url.search || "");
    (readable as any).method = opts.method.toUpperCase();
    (readable as any).headers = toNodeHeaders(opts.headers);

    // If you have EasyAuth/JWT data available, attach it:
    // (readable as any).auth = <AuthInfo>;
    if (opts.ctx) opts.ctx.log(`Incoming request: ${readable.method} ${readable.url} Headers: ${JSON.stringify(readable.headers)}`);
    return readable;
}

export function makeNodeServerResponse(ctx?: InvocationContext): ServerResponse & { toFetchResponse(ctx?: InvocationContext): Promise<Response> } {
    let statusCode = 200;
    let statusMessage = "";
    const headers: Record<string, number | string | string[]> = {};
    let headersSent = false;
    const chunks: Buffer[] = [];
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => (resolveDone = r));

    // ✅ add a tiny emitter to support res.on/once/...
    const ee = new EventEmitter();

    const res: any = {
        // --- EventEmitter API expected by SDK ---
        on: ee.on.bind(ee),
        once: ee.once.bind(ee),
        addListener: ee.addListener.bind(ee),
        removeListener: ee.removeListener.bind(ee),
        off: (ee as any).off ? (ee as any).off.bind(ee) : (event: string, fn: (...a: any[]) => void) => { ee.removeListener(event, fn); return res; },
        emit: ee.emit.bind(ee),

        // --- status / headers ---
        get statusCode() { return statusCode; },
        set statusCode(code: number) { statusCode = code; },
        get statusMessage() { return statusMessage; },
        set statusMessage(msg: string) { statusMessage = msg; },
        get headersSent() { return headersSent; },

        setHeader(name: string, value: number | string | readonly string[]) {
            ctx?.log(`Setting header: ${name}=${value}`);
            if (headersSent) return res as any;
            const k = name.toLowerCase();

            if (Array.isArray(value)) {
                // make a mutable copy (string[])
                headers[k] = (value as ReadonlyArray<string>).slice() as string[];
            } else if (typeof value === "string" || typeof value === "number") {
                headers[k] = value; // number | string
            }
            return res as any; // Node's setHeader returns 'this'
        },
        flushHeaders() { headersSent = true; },

        getHeader(name: string) { return headers[name.toLowerCase()]; },
        getHeaderNames() { return Object.keys(headers); },
        getHeaders(): OutgoingHttpHeaders { return { ...headers }; },
        hasHeader(name: string) { return Object.prototype.hasOwnProperty.call(headers, name.toLowerCase()); },
        removeHeader(name: string) { if (!headersSent) delete headers[name.toLowerCase()]; },

        writeHead(code: number, arg2?: any, arg3?: any) {
            if (ctx) ctx.log("[shim] writeHead", code);
            if (!headersSent) {
                statusCode = code;
                if (typeof arg2 === "string") {
                    statusMessage = arg2;
                    if (arg3) Object.assign(headers, normalizeOutgoingHeaders(arg3));
                } else if (arg2) {
                    Object.assign(headers, normalizeOutgoingHeaders(arg2));
                }
                headersSent = true;
            }
            return res;
        },

        write(
            chunk: any,
            encodingOrCb?: BufferEncoding | ((error: Error | null | undefined) => void),
            cb?: (error: Error | null | undefined) => void
        ): boolean {
            if (ctx) ctx.log(`Writing ${chunk.length} bytes to response body`);
            console.log(`Writing ${chunk.length} bytes to response body`);
            // Narrow types
            const encoding: BufferEncoding | undefined =
                typeof encodingOrCb === "string" ? (encodingOrCb as BufferEncoding) : undefined;
            const callback =
                typeof encodingOrCb === "function" ? encodingOrCb : cb;

            let buf: Buffer;
            if (Buffer.isBuffer(chunk)) {
                buf = chunk;
            } else if (typeof chunk === "string") {
                // Only pass encoding when chunk is a string
                buf = Buffer.from(chunk, encoding);
            } else {
                // Fallback: stringify without encoding param
                buf = Buffer.from(String(chunk));
            }

            chunks.push(buf);
            if (callback) callback(null);
            return true;
        },

        end(arg1?: any | (() => void), arg2?: any, arg3?: any) {
            if (ctx) ctx.log("Ending response", arg1 ? "with final chunk" : "without final chunk");
            console.log("Ending response", arg1 ? "with final chunk" : "without final chunk");
            let chunk: any | undefined;
            let encoding: BufferEncoding | undefined;
            let callback: (() => void) | undefined;
            if (typeof arg1 === "function") {
                callback = arg1;
            } else {
                chunk = arg1;
                if (typeof arg2 === "function") {
                    callback = arg2;
                } else if (typeof arg2 === "string") {
                    // Only accept as BufferEncoding, don't pass arbitrary strings
                    encoding = arg2 as BufferEncoding;
                }
                if (!callback && typeof arg3 === "function") {
                    callback = arg3;
                }
            }

            // If there is a final chunk, write it with/without encoding appropriately
            if (chunk !== undefined) {
                if (typeof chunk === "string") {
                    res.write(chunk, encoding as BufferEncoding | undefined);
                } else {
                    res.write(chunk);
                }
            }

            headersSent = true;

            // If you attached an EventEmitter as `ee`, notify close
            if (ee && typeof ee.emit === "function") {
                ctx?.log("Notifying close event");
                ee.emit("close");
            }
            resolveDone();

            if (callback) callback();
            return res; // Node semantics: return 'this'
        },


        async toFetchResponse(ctx?: InvocationContext): Promise<Response> {
            await new Promise<void>(r => setImmediate(r)); // next tick to ensure 'end' processing
            await done; // wait for 'end' to be called
            console.log("Converting to Fetch Response", { statusCode, statusMessage, headers, chunksLength: chunks.length });
            if (ctx) ctx.log("Converting to Fetch Response", { statusCode, statusMessage, headers, chunksLength: chunks.length });
            const body = Buffer.concat(chunks);
            const h = new Headers();
            for (const [k, v] of Object.entries(headers)) {
                if (Array.isArray(v)) h.set(k, v.join(", "));
                else h.set(k, String(v));
            }
            return Promise.resolve(new Response(body, { status: statusCode, statusText: statusMessage || undefined, headers: h }));
        },
    };

    return res as ServerResponse & { toFetchResponse(ctx?: InvocationContext): Promise<Response> };
}

function normalizeOutgoingHeaders(input: OutgoingHttpHeaders | (string | number)[]) {
    if (Array.isArray(input)) {
        const obj: OutgoingHttpHeaders = {};
        for (let i = 0; i < input.length; i += 2) {
            const k = String(input[i] ?? "");
            const v = input[i + 1] as any;
            if (k) obj[k] = v;
        }
        return obj;
    }
    return input || {};
}
