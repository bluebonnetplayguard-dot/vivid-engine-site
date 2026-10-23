// Splits a long document into passages at paragraph boundaries, aiming for ~1,200 characters each.
export function splitIntoPassages(text: string, target = 1200, max = 2400): string[] {
  const paras = text.replace(/\r\n/g, '\n').split(/\n{2,}|\n(?=\s{2,})/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out: string[] = [];
  let buf = '';
  const push = () => { if (buf.trim()) out.push(buf.trim()); buf = ''; };
  for (const para of paras) {
    if (para.length > max) {
      push();
      // Very long paragraph: cut at sentence ends.
      let chunk = '';
      for (const sentence of para.split(/(?<=[.!?])\s+(?=[A-Z(“"])/)) {
        if ((chunk + ' ' + sentence).length > target && chunk) { out.push(chunk.trim()); chunk = ''; }
        chunk += ' ' + sentence;
      }
      if (chunk.trim()) out.push(chunk.trim());
      continue;
    }
    if ((buf + '\n\n' + para).length > target && buf) push();
    buf += (buf ? '\n\n' : '') + para;
  }
  push();
  return out;
}
