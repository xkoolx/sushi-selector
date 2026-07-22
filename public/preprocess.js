// Image preprocessing (SPEC T-1.1). iPhone photos arrive as HEIC with EXIF
// rotation and are far too large; this module fixes all of that client side
// so the worker never touches image bytes.

const MAX_EDGE_PX = 1568;
const MAX_BYTES = 1_200_000;
const QUALITY_LADDER = [0.8, 0.7, 0.6];

// Decode with EXIF orientation applied. createImageBitmap with
// imageOrientation is the fast path; the fallback draws through an <img>
// element, which browsers also orient correctly.
async function decodeOriented(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Could not decode ${file.name}`));
      };
      img.src = url;
    });
  }
}

function targetSize(width, height) {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE_PX) return { width, height };
  const scale = MAX_EDGE_PX / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function toBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("JPEG encode failed"))),
      "image/jpeg",
      quality,
    );
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Strip the data:image/jpeg;base64, prefix.
      const s = String(reader.result);
      resolve(s.slice(s.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function sha256Hex(base64) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(base64));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Preprocess one photo: orient, downscale so the longest edge is at most
// 1568px, re-encode as JPEG stepping quality down until the payload fits
// 1.2 MB, then base64 encode. Returns { media_type, data, hash }.
export async function preprocessPhoto(file) {
  const source = await decodeOriented(file);
  const srcWidth = source.width ?? source.naturalWidth;
  const srcHeight = source.height ?? source.naturalHeight;
  const { width, height } = targetSize(srcWidth, srcHeight);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0, width, height);
  if (typeof source.close === "function") source.close();

  let blob = null;
  for (const quality of QUALITY_LADDER) {
    blob = await toBlob(canvas, quality);
    if (blob.size <= MAX_BYTES) break;
  }

  const data = await blobToBase64(blob);
  const hash = await sha256Hex(data);
  return { media_type: "image/jpeg", data, hash };
}

// Preprocess 1 to 6 photos in order. Order matters: merge order follows
// photo order so the rendered menu reads front page first.
export async function preprocessPhotos(files) {
  const out = [];
  for (const file of files) {
    out.push(await preprocessPhoto(file));
  }
  return out;
}
