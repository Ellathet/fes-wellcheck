export interface SisenseConfig {
  baseUrl: string;
  token: string;
}

export interface Dashboard {
  oid: string;
  title: string;
  widgets?: Widget[];
}

export interface Widget {
  oid: string;
  title: string;
  type: string;
  script?: string;
}

export class SisenseApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = 'SisenseApiError';
  }
}
