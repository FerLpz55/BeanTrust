/**
 * Tests unitarios de la capa de API (F07).
 *
 * Solo cubren módulos puros (`src/api/*`, `src/utils/*`) con `fetch` mockeado:
 * no cargan React Native, así que corren en Node sin emulador.
 */
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
