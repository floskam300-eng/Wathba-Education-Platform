import React, { useState, useRef } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

/**
 * DirectImageUploader — رفع صورة مباشرة بدون قص أو تغيير نسب العرض.
 * مناسب لصورة المدرس الشخصية (portrait / أي نسب).
 */
export default function DirectImageUploader({ onComplete, label, currentImage }) {
  const [preview, setPreview] = useState(currentImage || null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  // Sync if parent updates currentImage (e.g. on form load)
  React.useEffect(() => {
    setPreview(currentImage || null);
  }, [currentImage]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await api.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      onComplete(res.data.url);
      toast.success('تم رفع الصورة بنجاح');
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error('حدث خطأ أثناء رفع الصورة، يرجى المحاولة مجدداً');
      // Revert preview on failure
      setPreview(currentImage || null);
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onComplete('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-semibold text-slate-300 font-cairo">{label}</label>

      {preview ? (
        <div className="relative inline-block w-fit">
          <img
            src={preview}
            alt="preview"
            className="max-h-56 max-w-full rounded-xl border border-slate-700 bg-slate-800 object-contain shadow-md"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-500 transition shadow"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center w-40 h-40 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/60 text-slate-500">
          <ImageIcon size={36} />
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-cairo transition ${
          uploading
            ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
            : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
        }`}>
          <Upload size={16} />
          <span>{uploading ? 'جاري الرفع...' : 'اختر صورة'}</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={handleFileChange}
          />
        </label>
        <p className="text-xs text-slate-500 font-cairo">
          تُعرض الصورة بنسبها الأصلية (بورتريه، مربع، إلخ)
        </p>
      </div>
    </div>
  );
}
