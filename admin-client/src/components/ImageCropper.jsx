import React, { useState, useRef } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { Upload, X, Crop } from 'lucide-react';

function centerAspectCrop(mediaWidth, mediaHeight, aspect) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

export default function ImageCropper({ aspect, onComplete, label, currentImage, circular = false }) {
  const [src, setSrc] = useState(null);
  const [crop, setCrop] = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imgRef = useRef(null);

  const onSelectFile = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setSrc(reader.result);
        setIsModalOpen(true);
      });
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const onImageLoad = (e) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, aspect));
  };

  const handleUpload = async () => {
    if (!completedCrop || !imgRef.current) return;

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    // F2 FIX: set canvas to natural-pixel dimensions so the output image preserves
    // the full resolution of the crop region, not the small display-pixel size.
    const naturalCropWidth  = Math.round(completedCrop.width  * scaleX);
    const naturalCropHeight = Math.round(completedCrop.height * scaleY);

    canvas.width  = naturalCropWidth;
    canvas.height = naturalCropHeight;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      naturalCropWidth,
      naturalCropHeight,
      0,
      0,
      naturalCropWidth,
      naturalCropHeight
    );

    setUploading(true);

    try {
      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
      });

      const formData = new FormData();
      formData.append('image', blob, 'cropped_image.jpg');

      const res = await api.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      onComplete(res.data.url);
      setIsModalOpen(false);
      setSrc(null);
    } catch (err) {
      console.error('Failed to upload image:', err);
      // F3 FIX: use toast instead of alert() for consistent UX
      toast.error('حدث خطأ أثناء رفع الصورة، يرجى المحاولة مجدداً');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-slate-300 font-cairo">{label}</label>

      <div className="flex items-center gap-4">
        {currentImage && (
          <img
            src={currentImage}
            alt="Preview"
            className={`h-16 w-16 object-cover border border-slate-700 bg-slate-800 ${
              circular ? 'rounded-full' : 'rounded-lg'
            }`}
          />
        )}

        <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 transition font-cairo">
          <Upload size={16} />
          <span>اختر صورة</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onSelectFile}
            onClick={(e) => {
              e.target.value = null; // force change event if same file is re-selected
            }}
          />
        </label>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white font-cairo">تعديل وقص الصورة</h3>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setSrc(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-4 flex max-h-[60vh] justify-center overflow-auto border border-slate-800 bg-black/40 p-4 rounded-lg">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={aspect}
                circularCrop={circular}
              >
                <img
                  ref={imgRef}
                  src={src}
                  onLoad={onImageLoad}
                  alt="Crop target"
                  className="max-w-full"
                />
              </ReactCrop>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setSrc(null);
                }}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition font-cairo"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={handleUpload}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm text-white font-medium hover:bg-amber-600 transition disabled:opacity-50 font-cairo"
              >
                <Crop size={16} />
                <span>{uploading ? 'جاري الرفع...' : 'قص وحفظ الصورة'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
