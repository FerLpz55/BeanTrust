/**
 * Captura y normalización de evidencia fotográfica (ADR-14, §7.5).
 *
 * Flujo: cámara/galería → `expo-image-manipulator` (máx. 2048 px, JPEG 0.82) →
 * copia a un directorio **persistente** de `expo-file-system` → SHA-256 de los
 * bytes. Nunca se persiste una URI temporal de ImagePicker: la app debe poder
 * cerrarse y reintentar la subida más tarde.
 */

import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { AdjuntoLocal, ResultadoCaptura } from '@/src/evidencia/types';

/** Lado mayor máximo tras el resize (proporcional). */
const MAX_LADO_PX = 2048;
const CALIDAD_JPEG = 0.82;
const CARPETA_EVIDENCIA = 'evidencia';

function aResultado(resultado: ImagePicker.ImagePickerResult): ResultadoCaptura {
  if (resultado.canceled || !resultado.assets[0]) return { estado: 'cancelado' };
  return { estado: 'ok', asset: resultado.assets[0] };
}

function aHex(buffer: ArrayBuffer): string {
  let hex = '';
  for (const byte of new Uint8Array(buffer)) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Abre la cámara y devuelve el asset elegido (o el motivo de no hacerlo). */
export async function tomarFoto(): Promise<ResultadoCaptura> {
  const permiso = await ImagePicker.requestCameraPermissionsAsync();
  if (!permiso.granted) return { estado: 'permiso_denegado' };

  const resultado = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
  return aResultado(resultado);
}

/** Abre la galería y devuelve el asset elegido (o el motivo de no hacerlo). */
export async function elegirFoto(): Promise<ResultadoCaptura> {
  const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permiso.granted) return { estado: 'permiso_denegado' };

  const resultado = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
  return aResultado(resultado);
}

/**
 * Recupera el resultado que Android dejó pendiente si el sistema mató la
 * `MainActivity` mientras el picker estaba abierto (no-op en iOS/web).
 */
export async function recuperarResultadoPendiente(): Promise<ResultadoCaptura> {
  const pendiente = await ImagePicker.getPendingResultAsync();
  if (pendiente && 'assets' in pendiente) return aResultado(pendiente);
  return { estado: 'cancelado' };
}

/**
 * Normaliza el asset a JPEG (máx. 2048 px, calidad 0.82), lo copia al
 * directorio de documentos y calcula su SHA-256.
 */
export async function normalizarYGuardar(
  asset: ImagePicker.ImagePickerAsset,
  loteId: string,
  userId: string,
): Promise<AdjuntoLocal> {
  const contexto = ImageManipulator.manipulate(asset.uri);
  const ladoMayor = Math.max(asset.width, asset.height);
  if (ladoMayor > MAX_LADO_PX) {
    // Basta un lado: el otro se calcula solo para conservar la proporción.
    if (asset.width >= asset.height) contexto.resize({ width: MAX_LADO_PX, height: null });
    else contexto.resize({ width: null, height: MAX_LADO_PX });
  }

  const imagen = await contexto.renderAsync();
  const jpeg = await imagen.saveAsync({ format: SaveFormat.JPEG, compress: CALIDAD_JPEG });

  const id = Crypto.randomUUID();
  const directorio = new Directory(Paths.document, CARPETA_EVIDENCIA, userId, loteId);
  directorio.create({ intermediates: true, idempotent: true });
  const destino = new File(directorio, `${id}.jpg`);
  // `saveAsync` escribe en cache: se copia a un directorio persistente.
  new File(jpeg.uri).copy(destino);

  const bytes = await destino.bytes();
  const sha256 = aHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));

  return {
    id,
    loteId,
    localPath: destino.uri,
    mime: 'image/jpeg',
    bytes: bytes.byteLength,
    sha256,
  };
}

/** Borra el archivo local. Idempotente: si ya no existe, no falla. */
export async function eliminarArchivoLocal(path: string): Promise<void> {
  try {
    const archivo = new File(path);
    if (archivo.exists) archivo.delete();
  } catch {
    // El archivo ya no está o no es accesible: el objetivo se cumplió.
  }
}
