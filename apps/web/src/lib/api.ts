const API_URL = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem('accessToken');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
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

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.message || 'Request failed');
  }

  return response.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
};

export const authApi = {
  login: (phoneNumber: string, pin: string) =>
    api.post<{ user: import('@aqualedger/contracts').AuthUser; accessToken: string }>(
      '/auth/login',
      { phoneNumber, pin },
    ),
  me: () => api.get<import('@aqualedger/contracts').AuthUser>('/auth/me'),
  logout: () => api.post('/auth/logout'),
  requestOtp: (phoneNumber: string) => api.post('/auth/request-otp', { phoneNumber }),
  resetPin: (phoneNumber: string, otp: string, newPin: string) =>
    api.post('/auth/reset-pin', { phoneNumber, otp, newPin }),
};
