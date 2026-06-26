// Round 17: Minimal MCP (Model Context Protocol) server for slopbrick.
//
// Speaks JSON-RPC 2.0 over stdio (newline-delimited). Exposes three tools
// AI agents can call:
//
//   slop.scan_file      — scan a single file, return issues + Slop Index
//   slop.explain_rule   — return rule metadata + rationale + advice
//   slop.list_rules     — list all registered rules (optional category filter)
//
// Designed to be invoked by Cursor, Claude Code, Copilot, Continue, or any
// MCP-aware client. Reference: https://modelcontextprotocol.io/

import { builtinRules } from '../rules/builtins.js';
import { scanFile } from '../engine/worker.js';
import { DEFAULT_CONFIG } from '../config';
import type { Rule, ResolvedConfig } from '../types.js';
import { handleToolCall, TOOL_DEFINITIONS, getDeprecation } from './tools.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  /**
   * Non-standard extension for slopbrick-specific metadata. JSON-RPC 2.0
   * allows extra top-level fields; we use this slot for deprecation notices
   * that are not part of the underlying tool's payload.
   */
  _meta?: unknown;
}

const SERVER_INFO = {
  name: 'slopbrick',
  version: process.env.npm_package_version ?? '0.0.0',
};

/**
 * Process one JSON-RPC request and return a response. Pure function (does no
 * I/O); caller is responsible for transport.
 */
export async function handleRequest(
  request: JsonRpcRequest,
  cwd: string,
  rules: Rule[] = builtinRules,
  config: ResolvedConfig = DEFAULT_CONFIG,
): Promise<JsonRpcResponse | null> {
  // Notifications (no id) — acknowledge by returning null.
  if (request.id === undefined) {
    if (request.method === 'notifications/initialized') return null;
    return null;
  }

  const id = request.id ?? null;

  try {
    switch (request.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: SERVER_INFO,
            capabilities: { tools: {} },
          },
        };

      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: TOOL_DEFINITIONS } };

      case 'tools/call': {
        const toolName = request.params?.name as string | undefined;
        const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
        if (!toolName) {
          return errorResponse(id, -32602, 'tools/call requires params.name');
        }
        const result = await handleToolCall(toolName, args, { cwd, rules, config });
        // Soft-warn when a deprecated tool is called. The tool's payload
        // is preserved as `result`; the deprecation notice lives at the
        // JSON-RPC response level so MCP clients can render a non-intrusive
        // warning without parsing tool-specific payloads.
        const deprecation = getDeprecation(toolName);
        if (deprecation) {
          return {
            jsonrpc: '2.0',
            id,
            result,
            _meta: {
              deprecation: {
                tool: toolName,
                replacedBy: deprecation.replacedBy,
                removedIn: deprecation.removedIn ?? 'next major',
                reason: deprecation.reason,
              },
            },
          };
        }
        return { jsonrpc: '2.0', id, result };
      }

      default:
        return errorResponse(id, -32601, `Method not found: ${request.method}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(id, -32603, message);
  }
}

function errorResponse(id: number | string | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

/**
 * Run an MCP server loop on the given streams. Reads newline-delimited JSON
 * from `input` and writes responses to `output`. Returns when the input
 * stream closes.
 */
export async function runMcpServer(input: NodeJS.ReadableStream, output: NodeJS.WritableStream, cwd: string): Promise<void> {
  return new Promise<void>((resolve) => {
    let buffer = '';
    input.setEncoding('utf-8');
    input.on('data', (chunk: string) => {
      buffer += chunk;
      let nlIdx = buffer.indexOf('\n');
      const processLine = (rawLine: string) => {
        const line = rawLine.trim();
        if (line.length === 0) return;
        try {
          const req = JSON.parse(line) as JsonRpcRequest;
          handleRequest(req, cwd).then((res) => {
            if (res !== null) output.write(JSON.stringify(res) + '\n');
          }).catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            const res: JsonRpcResponse = {
              jsonrpc: '2.0',
              id: null,
              error: { code: -32603, message },
            };
            output.write(JSON.stringify(res) + '\n');
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const res: JsonRpcResponse = {
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error: ' + message },
          };
          output.write(JSON.stringify(res) + '\n');
        }
      };
      while (nlIdx !== -1) {
        processLine(buffer.slice(0, nlIdx));
        buffer = buffer.slice(nlIdx + 1);
        nlIdx = buffer.indexOf('\n');
      }
    });
    input.on('end', () => resolve());
    input.on('close', () => resolve());
  });
}