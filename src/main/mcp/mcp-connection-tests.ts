import type { McpConnectionTestInput, McpConnectionTestResult } from '../../shared/ipc-types';

export async function testMcpConnection(
  input: McpConnectionTestInput
): Promise<McpConnectionTestResult> {
  switch (input.presetKey) {
    case 'confluence': {
      const { testConfluenceMcpConnection } = await import('./confluence-diagnostics');
      return testConfluenceMcpConnection(input.env || {});
    }
    default:
      return {
        ok: false,
        presetKey: input.presetKey,
        name: input.presetKey,
        latencyMs: 0,
        summary: 'MCP connection test is not implemented for this preset',
      };
  }
}
