// src/functions/mcp/nodehttpAdapter.ts
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from "node:http";

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

    return readable;
}

export function makeNodeServerResponse() {
    let statusCode = 200;
    let statusMessage = "";
    const headers: Record<string, number | string | string[]> = {};
    let headersSent = false;
    const chunks: Buffer[] = [];
    const write = (chunk: any, encoding: BufferEncoding, callback?: (error: Error | null | undefined) => void): boolean => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding);
        chunks.push(buf);
        if (callback) callback(null);
        return true;
    };

    const res: any = {
        // ---- Properties Node expects ----
        get statusCode() {
            return statusCode;
        },
        set statusCode(code: number) {
            statusCode = code;
        },
        get statusMessage() {
            return statusMessage;
        },
        set statusMessage(msg: string) {
            statusMessage = msg;
        },
        get headersSent() {
            return headersSent;
        },

        // ---- Header APIs ----
        setHeader(name: string, value: number | string | readonly string[]) {
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
        getHeader(name: string): number | string | string[] | undefined {
            return headers[name.toLowerCase()];
        },
        getHeaderNames(): string[] {
            return Object.keys(headers);
        },
        getHeaders(): OutgoingHttpHeaders {
            return { ...headers };
        },
        hasHeader(name: string): boolean {
            return Object.prototype.hasOwnProperty.call(headers, name.toLowerCase());
        },
        removeHeader(name: string): void {
            if (!headersSent) delete headers[name.toLowerCase()];
        },

        // ---- writeHead overloads ----
        writeHead(code: number, arg2?: any, arg3?: any): any {
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
            return res as any;
        },

        // ---- Body APIs ----
        write(chunk: any, encoding: BufferEncoding, callback?: (error: Error | null | undefined) => void): boolean {
            return write(chunk, encoding, callback);
        },
        /*  write(chunk: any, encoding: BufferEncoding, callback?: (error: Error | null | undefined) => void): boolean {
           return write(chunk, encoding, callback);
         }, */
        // eslint-disable-next-line @typescript-eslint/no-unused-vars

        end(chunk: any, encoding: BufferEncoding, cb?: () => void): any {
            if (chunk !== undefined) {
                (res as any).write(chunk, encoding);
            }
            headersSent = true;
            if (cb) cb();
            return res as any;
        },

        // ---- Convert to Fetch Response ----
        toFetchResponse(): Response {
            const body = Buffer.concat(chunks);
            const h = new Headers();
            for (const [k, v] of Object.entries(headers)) {
                if (Array.isArray(v)) h.set(k, v.join(", "));
                else h.set(k, String(v));
            }
            return new Response(body, { status: statusCode, statusText: statusMessage || undefined, headers: h });
        },
    };

    return res as ServerResponse & { toFetchResponse(): Response };
}

function normalizeOutgoingHeaders(input: OutgoingHttpHeaders | (string | number)[]) {
    // Node allows an array form: [key1, value1, key2, value2, ...]
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
