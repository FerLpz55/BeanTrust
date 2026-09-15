/**
 * Fachada de la capa offline (§7.5).
 *
 * Única puerta de entrada para las pantallas/stores. Es el único módulo que
 * conoce SQLite, FileSystem, NetInfo y AppState; el resto de la app nunca toca
 * SQL ni disco.
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
import { subirEvidencia } from '@/src/api/evidencias';
import { sincronizar, type OperacionSync, type ResultadoSync } from '@/src/api/sync';
import { eliminarArchivoLocal } from '@/src/evidencia/archivo';
import type { AdjuntoLocal } from '@/src/evidencia/types';
import {
  crearMotor,
  type ContextoSesion,
  type MotorSync,
  type ResultadoFlush,
} from '@/src/offline/engine';
import { crearAlmacenMemoria } from '@/src/offline/memory';
import { crearAlmacenSqlite } from '@/src/offline/sqlite';
import type { OfflineStorage, RecursoOptimista } from '@/src/offline/storage';
import type {
  OperacionPendiente,
  OperacionSubirEvidencia,
  RecursoCache,
  RegistroCola,
  ResumenSync,
} from '@/src/offline/types';

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

/**
 * Sube una foto persistida y guarda su `EvidenciaRead`. Un 4xx (imagen
 * inválida, sin permiso, lote ajeno) es conflicto: el usuario decide. Un fallo
 * de red o un 5xx se propaga para que el motor conserve la operación.
 */
async function subirAdjunto(op: OperacionSubirEvidencia): Promise<ResultadoSync> {
  const store = await obtenerAlmacen();
  const adjunto = await store.leerAdjunto(contexto.userId, op.adjunto_id);
  if (!adjunto) {
    return { id: op.id, estado: 'conflicto', detalle: 'La foto local ya no está disponible.' };
  }

  try {
    const evidencia = await subirEvidencia({
      fincaId: op.finca_id,
      loteId: op.lote_id,
      localPath: adjunto.localPath,
      claveIdempotencia: op.id,
    });
    await store.marcarAdjuntoSubido(contexto.userId, op.adjunto_id, JSON.stringify(evidencia));
    return { id: op.id, estado: 'ok', detalle: null };
  } catch (err) {
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
      return { id: op.id, estado: 'conflicto', detalle: err.message };
    }
    throw err;
  }
}

async function obtenerAlmacen(): Promise<OfflineStorage> {
  if (almacen) return almacen;
  almacen =
    Platform.OS === 'web'
      ? crearAlmacenMemoria()
      : await crearAlmacenSqlite('beantrust-offline.db', { eliminarArchivo: eliminarArchivoLocal });
  await almacen.init();
  motor = crearMotor({
    storage: almacen,
    ejecutar: ejecutarOperacion,
    subirAdjunto,
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
  operaciones: OperacionPendiente[],
  adjunto?: AdjuntoLocal,
): Promise<void> {
  const store = await obtenerAlmacen();
  await store.guardarOptimista({ userId, recursos, operaciones, adjunto });
  notificar();
}

/** Persiste la metadata de una foto ya guardada en disco (sin encolarla). */
export async function guardarAdjunto(userId: string, adjunto: AdjuntoLocal): Promise<void> {
  const store = await obtenerAlmacen();
  await store.guardarAdjunto({
    ...adjunto,
    userId,
    evidenciaJson: null,
    estado: 'pendiente',
    createdAt: new Date().toISOString(),
  });
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
  await motor?.descartar(contexto.userId, sequence);
}

/**
 * Descarta todo lo pendiente de un lote: sus operaciones, los adjuntos que
 * referencian (fila + archivo). Se usa al abandonar un alta encolada.
 */
export async function descartarLotePendiente(loteId: string): Promise<void> {
  const store = await obtenerAlmacen();
  const userId = contexto.userId;
  if (!userId) return;

  const cola = await store.listarCola(userId);
  const aEliminar: number[] = [];
  const adjuntos = new Set<string>();

  for (const item of cola) {
    const payload = item.payload;
    const delLote =
      payload.tipo === 'registrar_cosecha' ? payload.id === loteId : payload.lote_id === loteId;
    if (!delLote) continue;
    aEliminar.push(item.sequence);
    if (payload.tipo === 'subir_evidencia') adjuntos.add(payload.adjunto_id);
    if (payload.tipo === 'registrar_cosecha' && payload.evidencia_id) {
      adjuntos.add(payload.evidencia_id);
    }
  }

  for (const sequence of aEliminar) await store.eliminarOperacion(sequence);
  for (const adjuntoId of adjuntos) await store.eliminarAdjunto(userId, adjuntoId);
  notificar();
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
