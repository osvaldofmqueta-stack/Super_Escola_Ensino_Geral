import AsyncStorage from '@react-native-async-storage/async-storage';
import { showToast } from '@/utils/toast';

const QUEUE_KEY  = '@siga_offline_queue';
const FAILED_KEY = '@siga_offline_failed';
export const OFFLINE_QUEUE_CHANGED_EVENT = 'siga:offline-queue-changed';

export interface QueuedOperation {
  id: string;
  method: string;
  path: string;
  body?: unknown;
  timestamp: number;
}

export interface FailedOperation extends QueuedOperation {
  failedAt: number;
  errorMessage: string;
  status?: number;
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('network request failed') ||
      msg.includes('networkerror') ||
      msg.includes('load failed') ||
      msg.includes('aborted') ||
      msg.includes('etimedout') ||
      msg.includes('econnrefused')
    );
  }
  return false;
}

export async function getQueue(): Promise<QueuedOperation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function getFailedOps(): Promise<FailedOperation[]> {
  try {
    const raw = await AsyncStorage.getItem(FAILED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function enqueueOperation(
  op: Omit<QueuedOperation, 'id' | 'timestamp'>
): Promise<void> {
  try {
    const queue = await getQueue();
    const item: QueuedOperation = {
      ...op,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
    };
    queue.push(item);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    notifyQueueChanged();
    const total = queue.length;
    showToast(
      total === 1
        ? 'Sem ligação — pedido guardado para sincronizar mais tarde'
        : `Sem ligação — ${total} pedidos guardados para sincronizar mais tarde`,
      'warning',
      4000,
    );
  } catch (e) {
    console.warn('[OfflineQueue] Failed to enqueue operation', e);
  }
}

export async function removeFromQueue(id: string): Promise<void> {
  try {
    const queue = await getQueue();
    const filtered = queue.filter((op) => op.id !== id);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
    notifyQueueChanged();
  } catch (e) {
    console.warn('[OfflineQueue] Failed to remove from queue', e);
  }
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
  notifyQueueChanged();
}

async function moveToFailed(op: QueuedOperation, err: unknown): Promise<void> {
  try {
    const list = await getFailedOps();
    const errMsg = err instanceof Error ? err.message : String(err);
    const m = /^(\d{3}):/.exec(errMsg);
    const status = m ? parseInt(m[1], 10) : undefined;
    list.push({ ...op, failedAt: Date.now(), errorMessage: errMsg, status });
    await AsyncStorage.setItem(FAILED_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[OfflineQueue] Failed to record failed operation', e);
  }
}

export async function removeFailedOp(id: string): Promise<void> {
  try {
    const list = await getFailedOps();
    const filtered = list.filter((op) => op.id !== id);
    await AsyncStorage.setItem(FAILED_KEY, JSON.stringify(filtered));
    notifyQueueChanged();
  } catch (e) {
    console.warn('[OfflineQueue] Failed to remove failed op', e);
  }
}

export async function clearFailedOps(): Promise<void> {
  await AsyncStorage.removeItem(FAILED_KEY);
  notifyQueueChanged();
}

/** Remove failed ops whose status is 401 — these indicate session expiry, not real failures.
 *  Call once on app startup to clean up stale entries left by older code. */
export async function purgeStale401FailedOps(): Promise<void> {
  try {
    const list = await getFailedOps();
    const cleaned = list.filter((op) => op.status !== 401);
    if (cleaned.length !== list.length) {
      await AsyncStorage.setItem(FAILED_KEY, JSON.stringify(cleaned));
      notifyQueueChanged();
    }
  } catch (e) {
    console.warn('[OfflineQueue] Failed to purge stale 401 ops', e);
  }
}

/** Move a failed op back to the active queue so it gets retried on the next sync. */
export async function retryFailedOp(id: string): Promise<void> {
  try {
    const list = await getFailedOps();
    const found = list.find((op) => op.id === id);
    if (!found) return;
    const remaining = list.filter((op) => op.id !== id);
    await AsyncStorage.setItem(FAILED_KEY, JSON.stringify(remaining));
    const queue = await getQueue();
    queue.push({ id: found.id, method: found.method, path: found.path, body: found.body, timestamp: Date.now() });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    notifyQueueChanged();
  } catch (e) {
    console.warn('[OfflineQueue] Failed to retry op', e);
  }
}

export interface ProcessQueueResult {
  success: number;
  failed: number;
  failedOps: FailedOperation[];
  sessionExpired: boolean;
}

export async function processQueue(
  executor: (method: string, path: string, body?: unknown) => Promise<void>
): Promise<ProcessQueueResult> {
  const queue = await getQueue();
  if (queue.length === 0) return { success: 0, failed: 0, failedOps: [], sessionExpired: false };

  let success = 0;
  let failed = 0;
  let sessionExpired = false;
  const failedOps: FailedOperation[] = [];

  for (const op of queue) {
    try {
      await executor(op.method, op.path, op.body);
      await removeFromQueue(op.id);
      success++;
    } catch (e) {
      if (isNetworkError(e)) {
        // Rede caiu durante o sync: parar e tentar de novo mais tarde, sem perder a operação.
        failed++;
        break;
      }
      const errMsg = e instanceof Error ? e.message : String(e);
      const m = /^(\d{3}):/.exec(errMsg);
      const status = m ? parseInt(m[1], 10) : undefined;
      if (status === 401) {
        sessionExpired = true;
        await removeFromQueue(op.id);
      } else {
        // Erro do servidor (4xx/5xx ou validação): mover para a lista de falhas para o utilizador rever.
        await moveToFailed(op, e);
        failedOps.push({ ...op, failedAt: Date.now(), errorMessage: errMsg, status });
        console.warn(`[OfflineQueue] Saved failed op ${op.method} ${op.path}:`, errMsg);
      }
      failed++;
    }
  }

  return { success, failed, failedOps, sessionExpired };
}

function notifyQueueChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_CHANGED_EVENT));
  }
}

/** Generates a short, human-friendly description of a queued/failed op. */
export function describeOp(op: QueuedOperation | FailedOperation): { title: string; subtitle: string } {
  const path = op.path.replace(/\/api\//, '');
  const segs = path.split('/').filter(Boolean);
  const recurso = segs[0] || 'recurso';
  const id = segs[1];

  const verbo = op.method === 'POST' ? 'Criar' : op.method === 'PUT' || op.method === 'PATCH' ? 'Actualizar' : op.method === 'DELETE' ? 'Apagar' : op.method;

  const RECURSOS: Record<string, string> = {
    taxas: 'rubrica',
    pagamentos: 'pagamento',
    alunos: 'aluno',
    turmas: 'turma',
    notas: 'nota',
    presencas: 'presença',
    rupes: 'RUPE',
    'mensagens-financeiras': 'mensagem',
    professores: 'professor',
    funcionarios: 'funcionário',
    cursos: 'curso',
    disciplinas: 'disciplina',
    eventos: 'evento',
    materiais: 'material',
    sumarios: 'sumário',
    pautas: 'pauta',
    horarios: 'horário',
    salas: 'sala',
    feriados: 'feriado',
    'lookup': 'tipo',
  };
  const nome = RECURSOS[recurso] || recurso;

  let detalhe = '';
  const body = (op as any).body as Record<string, any> | undefined;
  if (body && typeof body === 'object') {
    const candidatos = ['descricao', 'nome', 'titulo', 'label', 'assunto', 'mensagem', 'observacao'];
    for (const k of candidatos) {
      if (typeof body[k] === 'string' && body[k].trim()) { detalhe = body[k].trim(); break; }
    }
    if (!detalhe && typeof body.valor === 'number') detalhe = `${body.valor} AOA`;
  }

  const title = `${verbo} ${nome}${detalhe ? `: ${detalhe}` : id ? ` (${id.slice(0, 8)})` : ''}`;
  const subtitle = `${op.method} ${op.path}`;
  return { title, subtitle };
}
