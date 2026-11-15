/** 사진을 줄여서 dataURL(JPEG)로. Firestore 문서 1MB 제한 안에 들어가게 maxBytes 이하로 맞춘다. */
export async function compressImage(file: File, maxSide = 1280, maxBytes = 450_000): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    let side = maxSide;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      for (const q of [0.8, 0.7, 0.6, 0.5]) {
        const data = canvas.toDataURL('image/jpeg', q);
        if (data.length * 0.75 <= maxBytes) return data;
      }
      side = Math.round(side * 0.8);
    }
    throw new Error('사진이 너무 커요. 다른 사진으로 다시 시도해 주세요.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 원본 사진을 사진첩에 저장할 수 있게 공유 시트 열기 (아이폰: '이미지 저장') */
export async function shareToAlbum(file: File): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare || !nav.canShare({ files: [file] })) return false;
  try {
    await nav.share({ files: [file] });
    return true;
  } catch {
    return false;
  }
}
