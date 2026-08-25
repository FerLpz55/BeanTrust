/**
 * Carga de lotes para las pantallas que los listan (dashboard y trazabilidad).
 *
 * Centraliza el efecto de montaje, el pull-to-refresh y la paginación para no
 * repetir la misma lógica en cada pantalla.
 */

import { useCallback, useEffect, useState } from 'react';

import { useLotesStore } from '@/src/store/lotes';

export function useLotes() {
  const lotes = useLotesStore((s) => s.lotes);
  const isLoading = useLotesStore((s) => s.isLoading);
  const isLoadingMore = useLotesStore((s) => s.isLoadingMore);
  const error = useLotesStore((s) => s.error);
  const hayMas = useLotesStore((s) => s.nextCursor !== null);
  const cargar = useLotesStore((s) => s.cargar);
  const cargarMas = useLotesStore((s) => s.cargarMas);

  const [refrescando, setRefrescando] = useState(false);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  }, [cargar]);

  return { lotes, isLoading, isLoadingMore, error, hayMas, refrescar, refrescando, cargarMas };
}
