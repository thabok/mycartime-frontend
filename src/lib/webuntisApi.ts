import { getBackendUrl } from '@/lib/config';

export interface TestConnectionParams {
  server: string;
  school: string;
  username: string;
  password: string;
}

export interface TestConnectionResult {
  success: boolean;
  error: string | null;
}

/** Attempts a WebUntis login + logout with the given (or, for any omitted
 * field, the backend's currently stored) settings - see
 * POST /api/v1/webuntis/test-connection in app.py. */
export async function testWebuntisConnection(
  params: Partial<TestConnectionParams>
): Promise<TestConnectionResult> {
  const response = await fetch(`${getBackendUrl()}/api/v1/webuntis/test-connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }
  return response.json() as Promise<TestConnectionResult>;
}
