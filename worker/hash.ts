// djb2 string hash — small, deterministic, dependency-free. Used only to detect
// whether a normalized payload changed since the last KV write.
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}
