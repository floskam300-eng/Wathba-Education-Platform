/**
 * Convert a browser image file/blob to WebP before it is sent to the API.
 * Keeping this in the admin client reduces upload size and ensures the
 * multipart request contains a real .webp file, not the original format.
 */
export function convertImageToWebp(file, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        const context = canvas.getContext('2d');
        if (!context) throw new Error('تعذّر تجهيز الصورة للتحويل');
        context.drawImage(image, 0, 0);

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob || blob.type !== 'image/webp') {
            reject(new Error('المتصفح لا يدعم تحويل الصور إلى WebP'));
            return;
          }
          resolve(blob);
        }, 'image/webp', quality);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('تعذّر قراءة الصورة'));
    };
    image.src = objectUrl;
  });
}