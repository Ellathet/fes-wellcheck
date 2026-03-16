import axios, { type AxiosInstance } from 'axios';
import type { SisenseConfig } from './types.js';

export type SisenseClient = AxiosInstance;

export function createClient(config: SisenseConfig): SisenseClient {
  return axios.create({
    baseURL: config.baseUrl,
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
  });
}
