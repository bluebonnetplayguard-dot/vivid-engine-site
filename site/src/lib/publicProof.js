// Solve a short, server-signed challenge without blocking the UI thread.
export default async function solvePublicProof(challenge) {
  if (typeof challenge !== 'string' || challenge.length > 128) throw new Error('Invalid visitor challenge.');
  const encoder = new TextEncoder();
  for (let start = 0; start < 0x1000000; start += 128) {
    const hashes = await Promise.all(Array.from({ length: 128 }, (_, offset) =>
      crypto.subtle.digest('SHA-256', encoder.encode(`${challenge}:${start + offset}`))
    ));
    const offset = hashes.findIndex(hash => {
      const bytes = new Uint8Array(hash);
      return bytes[0] === 0 && bytes[1] === 0 && bytes[2] < 64;
    });
    if (offset !== -1) return { challenge, nonce: start + offset };
    if (start % 1024 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error('Visitor verification could not be completed. Please try again.');
}