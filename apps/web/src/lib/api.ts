const API_URL = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function shouldAttemptRefresh(path: string): boolean {
  return !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh') && !path.startsWith('/auth/signup-owner');
}

let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { accessToken?: string };
      if (!data.accessToken) return null;
      localStorage.setItem('accessToken', data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function clearAuthSession(): void {
  localStorage.removeItem('accessToken');
  window.dispatchEvent(new Event('auth:session-expired'));
}

function parseFilenameFromContentDisposition(headerValue: string | null): string | undefined {
  if (!headerValue) return undefined;
  const match = /filename="([^"]+)"/i.exec(headerValue);
  return match?.[1];
}

async function requestResponse(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<Response> {
  const token = localStorage.getItem('accessToken');
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, 'No internet connection');
  }

  if (response.status === 401 && !retried && shouldAttemptRefresh(path)) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return requestResponse(path, options, true);
    }
    clearAuthSession();
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.message || 'Request failed');
  }

  return response;
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await requestResponse(path, options);
  return response.json();
}

export type ApiFile = {
  blob: Blob;
  filename?: string;
  contentType?: string;
};

async function requestFile(
  path: string,
  options: RequestInit = {},
): Promise<ApiFile> {
  const response = await requestResponse(path, options);
  const blob = await response.blob();
  return {
    blob,
    filename: parseFilenameFromContentDisposition(response.headers.get('Content-Disposition')),
    contentType: response.headers.get('Content-Type') || undefined,
  };
}

export const api = {
  get: <T>(path: string) => requestJson<T>(path),
  post: <T>(path: string, body?: unknown) =>
    requestJson<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    requestJson<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    requestJson<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => requestJson<T>(path, { method: 'DELETE' }),
  file: (path: string) => requestFile(path),
};

export const authApi = {
  login: (phoneNumber: string, pin: string) =>
    api.post<{ user: import('@aqualedger/contracts').AuthUser; accessToken: string }>(
      '/auth/login',
      { phoneNumber, pin },
    ),
  signupOwner: (input: {
    organizationName: string;
    ownerName: string;
    phoneNumber: string;
    pin: string;
    confirmPin: string;
  }) =>
    api.post<{ user: import('@aqualedger/contracts').AuthUser; accessToken: string }>(
      '/auth/signup-owner',
      input,
    ),
  requestPinReset: (phoneNumber: string, message?: string) =>
    api.post<{ message: string }>('/auth/pin-reset-request', { phoneNumber, message }),
  me: () => api.get<import('@aqualedger/contracts').AuthUser>('/auth/me'),
  logout: () => api.post('/auth/logout'),
  requestOtp: (phoneNumber: string) => api.post('/auth/request-otp', { phoneNumber }),
  resetPin: (phoneNumber: string, otp: string, newPin: string) =>
    api.post('/auth/reset-pin', { phoneNumber, otp, newPin }),
};
