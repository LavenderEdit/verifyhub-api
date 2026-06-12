export interface CreateChallengeOptions {
  channel: 'EMAIL' | 'WHATSAPP';
  purpose: 'VERIFY_EMAIL' | 'VERIFY_PHONE' | 'LOGIN' | 'REGISTER' | 'PASSWORD_RESET' | 'CUSTOM';
  destination: string;
  templateName?: string;
  metadata?: Record<string, any>;
  locale?: string;
  idempotencyKey?: string;
}

export interface ChallengeResponse {
  id: string;
  status: string;
  expiresAt: string;
  signedUrl?: string;
  sandboxCode?: string;
}

export interface VerifyResponse {
  verified: boolean;
  message: string;
}

export class VerifyHubSDK {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: { apiKey: string; baseUrl?: string }) {
    if (!options.apiKey) {
      throw new Error('VerifyHub API Key is required');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/v1${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.message || `VerifyHub Request failed with status ${response.status}`);
    }

    return body as T;
  }

  async createChallenge(options: CreateChallengeOptions): Promise<ChallengeResponse> {
    return this.request<ChallengeResponse>('/challenges', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  async verifyChallenge(challengeId: string, code: string): Promise<VerifyResponse> {
    return this.request<VerifyResponse>(`/challenges/${challengeId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async resendChallenge(challengeId: string): Promise<ChallengeResponse> {
    return this.request<ChallengeResponse>(`/challenges/${challengeId}/resend`, {
      method: 'POST',
    });
  }

  async getChallenge(challengeId: string): Promise<ChallengeResponse> {
    return this.request<ChallengeResponse>(`/challenges/${challengeId}`, {
      method: 'GET',
    });
  }
}
