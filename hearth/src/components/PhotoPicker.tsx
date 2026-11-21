import { Camera } from 'lucide-react';
import { useRef } from 'react';
import { t } from '../lib/i18n';
import { Avatar } from '../lib/presence';
import type { Member } from '../lib/types';

/** Shrink a picked image to a small square JPEG data URL (keeps the family data tiny). */
async function toAvatar(file: File, size = 192): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const side = Math.min(img.width, img.height);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Avatar that opens a photo picker (camera on phones). */
export function PhotoPicker({ m, onChange }: { m: Member; onChange: (photo: string | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="photo-picker">
      <button className="avatar-edit" onClick={() => input.current?.click()} aria-label={t('Change photo')}>
        <Avatar m={m} size="lg" />
        <span className="avatar-cam">
          <Camera size={14} />
        </span>
      </button>
      {m.photo && (
        <button className="link small" onClick={() => onChange(undefined)}>
          {t('Remove photo')}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onChange(await toAvatar(f));
        }}
      />
    </div>
  );
}
