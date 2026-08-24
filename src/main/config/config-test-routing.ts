import type { ApiTestInput, ApiTestResult } from '../../renderer/types';
import type { AppConfig } from './config-store';
import { probeWithPiSdk } from '../agent/pi-one-shot';

export async function runConfigApiTest(
  payload: ApiTestInput,
  config: AppConfig
): Promise<ApiTestResult> {
  return probeWithPiSdk(payload, config);
}
