import { getBackendUrl } from '@/lib/config';

export interface TestConnectionResult {
  success: boolean;
  message: string;
}

/** Live-checks the Anthropic API key and/or claude CLI - see
 * POST /api/v1/assistant/test-connection in app.py. Omitted fields fall
 * back to what is currently stored in Settings. */
export async function testAssistantConnection(
  params: { apiKey?: string; cliPath?: string }
): Promise<TestConnectionResult> {
  const response = await fetch(`${getBackendUrl()}/api/v1/assistant/test-connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }
  return response.json() as Promise<TestConnectionResult>;
}

/** Whether the AI Assistant currently has a usable backend - see
 * GET /api/v1/assistant/availability in app.py. */
export async function checkAssistantAvailability(): Promise<boolean> {
  const response = await fetch(`${getBackendUrl()}/api/v1/assistant/availability`);
  if (!response.ok) return false;
  const data = await response.json() as { available: boolean };
  return data.available;
}
