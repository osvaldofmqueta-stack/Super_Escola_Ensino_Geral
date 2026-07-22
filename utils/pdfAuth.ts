import { getAuthToken } from '@/context/AuthContext';

export async function getPdfUrl(baseUrl: string): Promise<string> {
  const token = await getAuthToken();
  if (!token) return baseUrl;
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}token=${encodeURIComponent(token)}`;
}

export async function openPdfInTab(baseUrl: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const url = await getPdfUrl(baseUrl);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
  if (isMobile) {
    window.location.href = url;
  } else {
    window.open(url, '_blank');
  }
}
