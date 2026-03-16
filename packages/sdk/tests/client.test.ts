import { describe, it, expect } from 'vitest';
import { createClient } from '../src/client.js';

const config = { baseUrl: 'https://sisense.example.com', token: 'test-token' };

describe('createClient', () => {
  it('returns an axios instance with the configured baseURL', () => {
    const client = createClient(config);
    expect(client.defaults.baseURL).toBe('https://sisense.example.com');
  });

  it('sets the Authorization header as a Bearer token', () => {
    const client = createClient(config);
    const headers = client.defaults.headers as Record<string, unknown>;
    expect(headers['Authorization']).toBe('Bearer test-token');
  });

  it('sets the Content-Type header to application/json', () => {
    const client = createClient(config);
    const headers = client.defaults.headers as Record<string, unknown>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('creates an independent client per config', () => {
    const clientA = createClient({ baseUrl: 'https://a.example.com', token: 'token-a' });
    const clientB = createClient({ baseUrl: 'https://b.example.com', token: 'token-b' });
    expect(clientA.defaults.baseURL).not.toBe(clientB.defaults.baseURL);
  });
});
