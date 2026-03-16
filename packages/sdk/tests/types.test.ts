import { describe, it, expect } from 'vitest';
import { SisenseApiError } from '../src/types.js';

describe('SisenseApiError', () => {
  it('is an instance of Error', () => {
    const error = new SisenseApiError('something went wrong', 500, '/api/v1/dashboards');
    expect(error).toBeInstanceOf(Error);
  });

  it('has name "SisenseApiError"', () => {
    const error = new SisenseApiError('something went wrong', 500, '/api/v1/dashboards');
    expect(error.name).toBe('SisenseApiError');
  });

  it('exposes the provided message', () => {
    const error = new SisenseApiError('something went wrong', 500, '/api/v1/dashboards');
    expect(error.message).toBe('something went wrong');
  });

  it('exposes the HTTP status code', () => {
    const error = new SisenseApiError('not found', 404, '/api/v1/dashboards/abc');
    expect(error.status).toBe(404);
  });

  it('exposes the endpoint', () => {
    const error = new SisenseApiError('unauthorized', 401, '/api/v1/dashboards');
    expect(error.endpoint).toBe('/api/v1/dashboards');
  });

  it('status 0 represents a network-level error (no HTTP response)', () => {
    const error = new SisenseApiError('network error', 0, '/api/v1/dashboards');
    expect(error.status).toBe(0);
  });
});
