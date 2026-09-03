/** A native file picker — the Obsidian answer to the web's hidden <input type=file>. Resolves null on cancel. */
export function pickFile(accept: string): Promise<{ name: string; bytes: ArrayBuffer } | null> {
  return new Promise((resolve) => {
    const input = createEl('input', { type: 'file', attr: { accept } });
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) { resolve(null); return; }
      try { resolve({ name: f.name, bytes: await f.arrayBuffer() }); } catch { resolve(null); }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
