import { useAuth } from '@/context/AuthContext';
import { useOffline } from '@/context/OfflineContext';
import { useCachePrefetch } from '@/hooks/useCachePrefetch';

export default function CachePrefetchManager() {
  const { isAuthenticated } = useAuth();
  const { isOnline } = useOffline();
  useCachePrefetch(isAuthenticated, isOnline);
  return null;
}
