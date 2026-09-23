import { useEffect, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { getBackendUrl } from '@/lib/config';

interface StoredCredentialsResponse {
  WEBUNTIS_USERNAME?: string;
  WEBUNTIS_PASSWORD_SET?: boolean;
  WEBUNTIS_SECRET_SET?: boolean;
}

/**
 * WebUntis username/password for the current browser session, plus whether
 * the backend already has a username/password saved (via Settings >
 * WebUntis, see PreferencesDialog.tsx) - so returning users aren't forced to
 * retype the password after every restart, the way a sessionStorage-only
 * value would require.
 */
export function useWebuntisCredentials() {
  const [username, setUsername] = useLocalStorage<string>('carpool-username', '');
  const [password, setPassword] = useSessionStorage<string>('carpool-password', '');
  const [hasStoredPassword, setHasStoredPassword] = useState(false);
  // A stored secret (see PreferencesDialog's "Login method" toggle, for
  // IServ/SSO accounts) is just as good as a stored password here - either
  // one lets the backend log in without this hook supplying anything.
  const [hasStoredSecret, setHasStoredSecret] = useState(false);

  useEffect(() => {
    fetch(`${getBackendUrl()}/api/v1/settings`)
      .then((response) => (response.ok ? (response.json() as Promise<StoredCredentialsResponse>) : null))
      .then((data) => {
        if (!data) return;
        if (data.WEBUNTIS_USERNAME && !username.trim()) setUsername(data.WEBUNTIS_USERNAME);
        setHasStoredPassword(!!data.WEBUNTIS_PASSWORD_SET);
        setHasStoredSecret(!!data.WEBUNTIS_SECRET_SET);
      })
      .catch(() => {
        // Best-effort prefill; falls back to requiring the user to type credentials.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasCredentials = (!!username.trim() && !!password.trim()) || hasStoredPassword || hasStoredSecret;

  // Body fields for a WebUntis-backed request: an explicit username/hash
  // when the user typed a password this session, or nothing at all when
  // relying on the backend's stored credentials.
  const credentialFields = password.trim()
    ? { username: username.trim(), hash: btoa(password) }
    : {};

  return {
    username,
    setUsername,
    password,
    setPassword,
    hasCredentials,
    hasStoredPassword,
    hasStoredSecret,
    credentialFields,
  };
}
