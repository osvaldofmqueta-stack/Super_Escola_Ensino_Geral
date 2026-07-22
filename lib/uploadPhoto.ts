import {
  Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { webAlert } from '@/utils/webAlert';

export async function pickAndUploadPhoto(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        try {
          const form = new FormData();
          form.append('file', file);
          const res = await fetch('/api/upload', { method: 'POST', body: form });
          if (!res.ok) {
            resolve(null);
            return;
          }
          const data = await res.json();
          resolve(data.url as string);
        } catch {
          resolve(null);
        }
      };
      input.click();
    });
  }

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    webAlert('Permissão necessária', 'Precisamos de acesso à galeria para alterar a sua foto.');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });

  if (result.canceled || !result.assets[0]?.uri) return null;

  const uri = result.assets[0].uri;

  try {
    const form = new FormData();
    form.append('file', { uri, type: 'image/jpeg', name: 'photo.jpg' } as unknown as Blob);
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url as string;
  } catch {
    return null;
  }
}
