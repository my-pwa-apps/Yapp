import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

/**
 * Upload a file (image, voice memo, etc.) to Firebase Storage.
 * Returns the public download URL.
 */
export async function uploadMedia(
  chatId: string,
  file: Blob,
  folder: 'images' | 'voice' | 'files',
  filename?: string
): Promise<string> {
  const ext = filename?.split('.').pop() || (file.type.split('/')[1] ?? 'bin');
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storageRef = ref(storage, `chat-${folder}/${chatId}/${name}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

/**
 * Compress an image before uploading (max 1200px, 0.8 quality).
 */
export function compressImage(file: File, maxSize = 1200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width *= ratio;
        height *= ratio;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Compress failed'))),
        'image/jpeg',
        0.8
      );
    };
    img.onerror = reject;
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
