/**
 * Session replay engine.
 *
 * Replays a session's historical messages and trace steps with simulated
 * delays to recreate the feeling of an AI conversation unfolding in real time.
 */
import { useAppStore } from './index';
import type { Message, TraceStep } from '../types';

const activeReplays = new Map<string, AbortController>();

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/**
 * Build the ordered list of messages and trace steps to replay.
 */
function buildReplayQueue(
  messages: Message[],
  traceSteps: TraceStep[]
): Array<{ type: 'message'; data: Message } | { type: 'trace'; data: TraceStep }> {
  const queue: Array<
    { type: 'message'; data: Message } | { type: 'trace'; data: TraceStep }
  > = [];

  for (const m of messages) {
    queue.push({ type: 'message', data: m });
  }
  for (const t of traceSteps) {
    queue.push({ type: 'trace', data: t });
  }

  // Sort by timestamp
  queue.sort((a, b) => a.data.timestamp - b.data.timestamp);
  return queue;
}

/**
 * Replay a single assistant message with typing effect and trace steps.
 */
async function replayAssistantMessage(
  message: Message,
  sessionId: string,
  signal: AbortSignal
): Promise<void> {
  const store = useAppStore.getState();

  store.startExecutionClock(sessionId, Date.now());
  store.setLoading(true);
  store.updateSession(sessionId, { status: 'running' });

  // Give a brief "thinking" moment before any output
  await sleep(randomInt(300, 700), signal);
  if (signal.aborted) return;

  let hasEmittedPartial = false;

  for (const block of message.content) {
    if (signal.aborted) return;

    switch (block.type) {
      case 'thinking': {
        const text = block.thinking;
        const words = text.split(/(\s+)/).filter(Boolean);
        let buffer = '';
        for (let i = 0; i < words.length; i++) {
          buffer += words[i];
          if (buffer.length >= randomInt(15, 40) || i === words.length - 1) {
            store.setPartialThinking(sessionId, buffer);
            buffer = '';
            await sleep(randomInt(30, 90), signal);
            if (signal.aborted) return;
          }
        }
        store.clearPartialThinking(sessionId);
        await sleep(randomInt(100, 300), signal);
        break;
      }

      case 'text': {
        const text = block.text;
        const chars = text.split('');
        let buffer = '';
        for (let i = 0; i < chars.length; i++) {
          buffer += chars[i];
          const batchSize = randomInt(2, 6);
          if (buffer.length >= batchSize || i === chars.length - 1) {
            store.setPartialMessage(sessionId, buffer);
            buffer = '';
            hasEmittedPartial = true;
            await sleep(randomInt(15, 50), signal);
            if (signal.aborted) return;
          }
        }
        // Small pause after text block
        await sleep(randomInt(100, 250), signal);
        break;
      }

      case 'tool_use': {
        store.addTraceStep(sessionId, {
          id: block.id,
          type: 'tool_call',
          status: 'running',
          title: block.displayName || block.name,
          toolName: block.name,
          toolInput: block.input,
          timestamp: Date.now(),
        });
        await sleep(randomInt(500, 1200), signal);
        if (signal.aborted) return;
        break;
      }

      case 'tool_result': {
        store.updateTraceStep(sessionId, block.toolUseId, {
          status: block.isError ? 'error' : 'completed',
          toolOutput: block.content,
        });
        await sleep(randomInt(200, 500), signal);
        if (signal.aborted) return;
        break;
      }

      default:
        break;
    }
  }

  // Clear any remaining partials and emit the final message
  if (hasEmittedPartial) {
    store.clearPartialMessage(sessionId);
  }
  store.clearPartialThinking(sessionId);
  store.addMessage(sessionId, message);

  if (message.executionTimeMs) {
    store.updateMessage(sessionId, message.id, {
      executionTimeMs: message.executionTimeMs,
    });
  }

  store.finishExecutionClock(sessionId);
  store.setLoading(false);
  store.updateSession(sessionId, { status: 'idle' });

  // Pause between assistant turns
  await sleep(randomInt(400, 900), signal);
}

/**
 * Start replaying a session from its historical data.
 */
export async function startSessionReplay(sessionId: string): Promise<void> {
  const store = useAppStore.getState();
  const ss = store.sessionStates[sessionId];
  if (!ss || ss.messages.length === 0) return;

  // Stop any existing replay for this session
  stopSessionReplay(sessionId);

  const controller = new AbortController();
  activeReplays.set(sessionId, controller);

  // Save history and clear display
  const messages = [...ss.messages];
  const traceSteps = [...ss.traceSteps];

  store.setMessages(sessionId, []);
  store.setTraceSteps(sessionId, []);
  store.clearPartialMessage(sessionId);
  store.clearPartialThinking(sessionId);
  store.clearExecutionClock(sessionId);

  const queue = buildReplayQueue(messages, traceSteps);

  try {
    for (const item of queue) {
      if (controller.signal.aborted) break;

      if (item.type === 'message') {
        const msg = item.data;
        if (msg.role === 'user') {
          store.addMessage(sessionId, msg);
          await sleep(randomInt(200, 500), controller.signal);
        } else {
          await replayAssistantMessage(msg, sessionId, controller.signal);
        }
      } else if (item.type === 'trace') {
        const step = item.data;
        // Only replay trace steps that aren't already handled inside messages
        // (tool_call/tool_result trace steps are emitted during message replay)
        if (step.type === 'thinking' || step.type === 'text') {
          store.addTraceStep(sessionId, step);
          await sleep(randomInt(100, 300), controller.signal);
        }
      }
    }
  } finally {
    activeReplays.delete(sessionId);
    // Restore original messages and traces so nothing is lost
    store.setMessages(sessionId, messages);
    store.setTraceSteps(sessionId, traceSteps);
    store.clearPartialMessage(sessionId);
    store.clearPartialThinking(sessionId);
    store.clearExecutionClock(sessionId);
    store.setLoading(false);
    store.updateSession(sessionId, { status: 'idle' });
  }
}

/**
 * Stop an ongoing replay.
 */
export function stopSessionReplay(sessionId: string): void {
  const controller = activeReplays.get(sessionId);
  if (controller) {
    controller.abort();
    activeReplays.delete(sessionId);
  }
}

/**
 * Check if a session is currently being replayed.
 */
export function isSessionReplaying(sessionId: string): boolean {
  return activeReplays.has(sessionId);
}
