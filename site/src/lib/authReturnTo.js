// Shared by the auth pages (Login, Register, Delete Account). Keep the redirect
// validation in one place: it is security-sensitive and easy to drift.
//
// Resolve ?returnTo= to a safe same-origin path, else "/".
// The same-origin check alone is not enough: /.//evil.com or /\evil.com parse
// same-origin but normalize to a protocol-relative //evil.com when assigned to
// location.href (an open redirect). So the resolved path must start with
// exactly one slash and contain no backslash. The server applies the same rule
// to the Google sign-in return path.
export function safeReturnTo() {
  const raw = new URLSearchParams(window.location.search).get('returnTo');
  if (!raw) return '/';
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return '/';
    const path = url.pathname + url.search;
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '/';
    return path;
  } catch {
    return '/';
  }
}
