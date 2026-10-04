import type { User } from '../types/domain';
import { getErrorMessage, readApiError } from './errors';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

export interface AuthResponse {
  success: boolean;
  user: User;
  token: string;
}

export interface RegisterResponse {
  success: boolean;
  pendingApproval: boolean;
  message: string;
  user: Pick<User, 'id' | 'email' | 'name' | 'isActive' | 'createdAt'>;
}

class AuthService {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
    }
  }

  /** Creates an account that an administrator must approve. Does not sign in. */
  async register(email: string, password: string, name: string, phone?: string): Promise<RegisterResponse> {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, phone }),
    });
    if (!response.ok) {
      throw new Error(await readApiError(response, 'Registration failed'));
    }
    return (await response.json()) as RegisterResponse;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      throw new Error(await readApiError(response, 'Login failed'));
    }
    const data = (await response.json()) as AuthResponse;
    this.token = data.token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', data.token);
    }
    return data;
  }

  async getCurrentUser(): Promise<User | null> {
    if (!this.token) return null;
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!response.ok) {
        this.logout();
        return null;
      }
      const data = (await response.json()) as { user: User };
      return data.user;
    } catch (err) {
      console.error('Auth check failed:', getErrorMessage(err));
      this.logout();
      return null;
    }
  }

  logout(): void {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.token) {
      throw new Error('Not authenticated');
    }
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });
  }
}

export const authService = new AuthService();
export type { User };
