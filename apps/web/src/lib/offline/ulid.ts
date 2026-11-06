// Monotonic ULIDs for the outbox: sortable by creation (so mutations replay in the order they were made, even
// within one millisecond) and unique per device — each is the mutation's idempotency key on the server.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
let lastTime = -1;
let lastRandom: number[] = [];

function encodeTime(t: number): string {
  let out = "";
  for (let i = 0; i < 10; i++) {
    out = ALPHABET[t % 32]! + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function ulid(now = Date.now()): string {
  if (now <= lastTime) {
    // same millisecond (or a clock step back): increment the random part instead of drawing a new one
    for (let i = lastRandom.length - 1; i >= 0; i--) {
      if (lastRandom[i]! < 31) {
        lastRandom[i]!++;
        break;
      }
      lastRandom[i] = 0;
    }
    now = lastTime;
  } else {
    lastTime = now;
    lastRandom = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b % 32);
  }
  return encodeTime(now) + lastRandom.map((v) => ALPHABET[v]).join("");
}

export { ulid };
