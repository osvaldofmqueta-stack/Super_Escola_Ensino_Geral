import { useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";
import { useAuth, getAuthToken } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";

function apiUrl(path: string): string {
  return new URL(path, getApiUrl()).toString();
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(apiUrl("/api/push/vapid-key"));
    if (!res.ok) return null;
    const data = await res.json();
    return data.publicKey ?? null;
  } catch {
    return null;
  }
}

export type PushState = "unsupported" | "default" | "denied" | "granted" | "loading";

export function usePushNotifications() {
  const { user } = useAuth();
  const [pushState, setPushState] = useState<PushState>("loading");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  const isWeb = Platform.OS === "web";
  const isSupported = isWeb && typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  useEffect(() => {
    if (!isSupported) {
      setPushState("unsupported");
      return;
    }

    const perm = Notification.permission;
    if (perm === "granted") {
      setPushState("granted");
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setSubscription(sub);
        });
      });
    } else if (perm === "denied") {
      setPushState("denied");
    } else {
      setPushState("default");
    }
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    if (!isSupported) return { success: false, message: "Push não suportado neste dispositivo." };
    if (!user?.id) return { success: false, message: "Utilizador não autenticado." };

    try {
      setPushState("loading");

      const token = await getAuthToken();
      if (!token) return { success: false, message: "Sessão expirada. Faça login novamente." };

      const publicKey = await getVapidPublicKey();
      if (!publicKey) return { success: false, message: "Servidor não suporta push notifications." };

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState("denied");
        return { success: false, message: "Permissão de notificação negada." };
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await fetch(apiUrl("/api/push/subscribe"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          utilizadorId: user.id,
          userAgent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setPushState("default");
        return { success: false, message: err.error ?? "Erro ao registar subscrição." };
      }

      setSubscription(sub);
      setPushState("granted");
      return { success: true, message: "Notificações push ativadas com sucesso!" };
    } catch (err) {
      console.error("[push] subscribe error:", err);
      setPushState("default");
      return { success: false, message: "Erro ao ativar notificações. Tente novamente." };
    }
  }, [isSupported, user]);

  const unsubscribe = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    if (!subscription) return { success: false, message: "Sem subscrição ativa." };

    try {
      setPushState("loading");
      const token = await getAuthToken();
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      await fetch(apiUrl("/api/push/unsubscribe"), {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ endpoint }),
      });

      setSubscription(null);
      setPushState("default");
      return { success: true, message: "Notificações desativadas." };
    } catch (err) {
      console.error("[push] unsubscribe error:", err);
      setPushState("granted");
      return { success: false, message: "Erro ao desativar notificações." };
    }
  }, [subscription]);

  return {
    pushState,
    subscription,
    isSupported,
    subscribe,
    unsubscribe,
  };
}
