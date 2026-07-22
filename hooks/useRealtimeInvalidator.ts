import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeDataChange } from '@/lib/realtimeSync';

/**
 * Hook global de invalidação em tempo real.
 *
 * Subscreve o bus de eventos (realtimeSync) e, sempre que o servidor
 * emite um evento `data_change` via WebSocket, invalida automaticamente
 * todas as queries do TanStack Query cujo prefixo corresponde à entidade
 * alterada — sem necessidade de lógica manual em cada ecrã.
 *
 * Exemplo: evento { entity: 'alunos' } → invalida /api/alunos, /api/alunos/*
 */
export function useRealtimeInvalidator(): void {
  const queryClient = useQueryClient();
  const pendingRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const unsubscribe = subscribeDataChange((entity: string) => {
      if (!entity) return;

      // Debounce por entidade — se chegarem múltiplos eventos seguidos
      // para a mesma entidade (ex: inserções em lote), só invalida uma vez.
      const existing = pendingRef.current.get(entity);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        pendingRef.current.delete(entity);

        // Converte o nome da entidade de volta para o formato da URL da API.
        // O servidor faz: path.replace(/-/g, '_')  →  revertemos aqui.
        const apiSegment = entity.replace(/_/g, '-');
        const queryKey = `/api/${apiSegment}`;

        // Invalida todas as queries cujo primeiro elemento da chave começa
        // com este prefixo (ex: ['/api/alunos'], ['/api/alunos', '123'], etc.)
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === 'string' && (
              key === queryKey ||
              key.startsWith(queryKey + '/') ||
              key.startsWith(queryKey + '?')
            );
          },
          // Marcar como stale sem forçar refetch imediato.
          // Queries activas já montadas não vão disparar GlobalLoadingSpinner
          // por causa de um evento WebSocket; apenas refazem o fetch quando o
          // utilizador voltar à página ou quando o componente recarregar.
          refetchType: 'none',
        });
      }, 80);

      pendingRef.current.set(entity, timer);
    });

    return () => {
      unsubscribe();
      // Limpar timers pendentes
      for (const t of pendingRef.current.values()) clearTimeout(t);
      pendingRef.current.clear();
    };
  }, [queryClient]);
}
