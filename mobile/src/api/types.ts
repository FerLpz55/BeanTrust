/** Contrato tipado con el backend FastAPI (subconjunto del módulo auth). */

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
}