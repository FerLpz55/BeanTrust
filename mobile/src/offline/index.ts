/**
 * Fachada de la capa offline (§7.5).
 *
 * Única puerta de entrada para las pantallas/stores. Es el único módulo que
 * conoce SQLite, NetInfo y AppState; el resto de la app nunca toca SQL.
 *
 * La sesión activa se modela con `{ userId, epoch }`. `epoch` se incrementa en
 * cada login/logout, de modo que un flush iniciado con la sesión A se detiene
 * en cuanto entra B y no envía ni borra operaciones ajenas.
 *
 * Activadores de sincronización: login/restauración, NetInfo conectado, app a
 * foreground y el botón manual (vía `sincronizarAhora`).
 */

import NetInfo from '@react-native-community/netinfo';
import { AppState, Platform } from 'react-native';

import { ApiError } from '@/src/api/client';
import { sincronizar, type OperacionSync, type ResultadoSync } from '@/src/api/sync';
import { crearMotor, type ContextoSesion, type MotorSync, type ResultadoFlush } from '@/src/offline/engine';
import { crearAlmacenMemoria } from '@/src/offline/memory';
import { crearAlmacenSqlite } from '@/src/offline/sqlite';
import type { OfflineStorage, RecursoOptimista } from '@/src/offline/storage';
import type { RecursoCache, RegistroCola, ResumenSync } from '@/src/offline/types';

let almacen: OfflineStorage | null = null;
let motor: MotorSync | null = null;
let online = true;
let suscripciones: (() => void)[] = [];
const oyentes = new Set<() => void>();
const oyentesFlush = new Set<(resultado: ResultadoFlush) => void>();

/** Contexto de sesión activo. `epoch` se incrementa en cada login/logout. */
let contexto: ContextoSesion = { userId: '', epoch: 0 };

function notificar(): void {
  for (const oyente of oyentes) oyente();
}

function notificarFlush(resultado: ResultadoFlush): void {
  for (const oyente of oyentesFlush) oyente(resultado);
}

function vacio(): ResumenSync {
  return { enviadas: 0, ok: 0, conflictos: 0, errores: 0, pendientes: 0 };
}

async function ejecutarOperacion(operacion: OperacionSync): Promise<ResultadoSync> {
  // Una operación por llamada: el 207 trae un único resultado.
  const { resultados } = await sincronizar([operacion]);
  const resultado = resultados[0];
  if (!resultado) {
    throw new ApiError(0, 'El servidor no devolvió resultado para la operación.');
  }
  return resultado;
}

async function obtenerAlmacen(): Promise<OfflineStorage> {
  if (almacen) return almacen;
  almacen = Platform.OS === 'web' ? crearAlmacenMemoria() : await crearAlmacenSqlite();
  await almacen.init();
  motor = crearMotor({
    storage: almacen,
    ejecutar: ejecutarOperacion,
    contexto: () => contexto,
    onFlush: notificarFlush,
    onCambio: notificar,
  });
  return almacen;
}

function suscribirRed(): void {
  if (suscripciones.length > 0) return;
  const quitarNetInfo = NetInfo.addEventListener((estado) => {
    online = estado.isConnected === true && estado.isInternetReachable !== false;
    notificar();
    if (online) void flush();
  });
  const subAppState = AppState.addEventListener('change', (estado) => {
    if (estado === 'active') void flush();
  });
  suscripciones = [quitarNetInfo, () => subAppState.remove()];
}

async function flush(): Promise<ResumenSync> {
  await obtenerAlmacen();
  if (!contexto.userId || !motor) return vacio();
  return motor.flush(contexto.userId);
}

export async function inicializar(userId: string): Promise<void> {
  // Nueva época: cualquier flush en vuelo de la sesión anterior queda obsoleto.
  contexto = { userId, epoch: contexto.epoch + 1 };
  await obtenerAlmacen();
  suscribirRed();
  notificar();
  await flush();
}

export async function cerrarSesion(userId: string): Promise<void> {
  // Se invalida la sesión ANTES de borrar, para detener cualquier flush vivo.
  contexto = { userId: '', epoch: contexto.epoch + 1 };
  await obtenerAlmacen();
  await almacen?.eliminarUsuario(userId);
  notificar();
}

export async function guardarOptimista(
  userId: string,
  recursos: RecursoOptimista[],
  operacion: OperacionSync,
): Promise<void> {
  const store = await obtenerAlmacen();
  await store.guardarOptimista({ userId, recursos, operacion });
  notificar();
}

export async function guardarRecurso<T>(
  userId: string,
  resource: RecursoCache,
  resourceId: string,
  data: T,
): Promise<void> {
  const store = await obtenerAlmacen();
  await store.guardarRecurso(userId, resource, resourceId, data);
}

export async function leerRecurso<T>(
  userId: string,
  resource: RecursoCache,
  resourceId: string,
): Promise<T | null> {
  const store = await obtenerAlmacen();
  return store.leerRecurso<T>(userId, resource, resourceId);
}

export async function listarCola(userId: string): Promise<RegistroCola[]> {
  const store = await obtenerAlmacen();
  return store.listarCola(userId);
}

export function sincronizarAhora(): Promise<ResumenSync> {
  return flush();
}

export async function reintentar(userId: string, sequence: number): Promise<ResumenSync> {
  await obtenerAlmacen();
  if (!motor) return vacio();
  return motor.reintentar(userId, sequence);
}

export async function descartar(sequence: number): Promise<void> {
  await obtenerAlmacen();
  await motor?.descartar(sequence);
}

export function esOnline(): boolean {
  return online;
}

export function enCurso(): boolean {
  return motor?.enCurso() ?? false;
}

export function onCambio(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/** Resultado de cualquier flush (manual, NetInfo, foreground o init). */
export function onFlush(oyente: (resultado: ResultadoFlush) => void): () => void {
  oyentesFlush.add(oyente);
  return () => oyentesFlush.delete(oyente);
}
