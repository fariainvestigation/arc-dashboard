/*!
 * arc_hash.js - Streaming SHA-256 for ARC evidence files.
 *
 * Exposes window.ARCHash.
 *
 * Why not crypto.subtle.digest: it requires the entire file in one ArrayBuffer.
 * A 2 GB body-worn camera file would exhaust memory. It is also unavailable on
 * file:// origins in Chrome, which is how ARC modules are often opened. This is
 * a chunked implementation that streams a file of any size and yields to the
 * event loop between blocks so the UI stays responsive.
 *
 * (02B_Chain_of_Custody_Review.html carries its own inline copy of this class.
 * It can be switched to this shared file whenever that module is next touched.)
 */
(function (global) {
  "use strict";

  function ArcSha256() {
    this.h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;
    this.bytesHashed = 0;
    this.finished = false;
    this.words = new Uint32Array(64);
  }
  ArcSha256.rotr = function (value, shift) { return (value >>> shift) | (value << (32 - shift)); };
  ArcSha256.K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);

  ArcSha256.prototype.update = function (input) {
    if (this.finished) throw new Error("SHA-256 hash is already finalized.");
    var data = input instanceof Uint8Array ? input : new Uint8Array(input);
    this.bytesHashed += data.length;
    var position = 0;
    while (position < data.length) {
      var take = Math.min(data.length - position, 64 - this.bufferLength);
      this.buffer.set(data.subarray(position, position + take), this.bufferLength);
      this.bufferLength += take;
      position += take;
      if (this.bufferLength === 64) { this.hashBlock(this.buffer); this.bufferLength = 0; }
    }
    return this;
  };

  ArcSha256.prototype.hashBlock = function (block) {
    var w = this.words, index, offset;
    for (index = 0; index < 16; index += 1) {
      offset = index * 4;
      w[index] = ((block[offset] << 24) | (block[offset + 1] << 16) | (block[offset + 2] << 8) | block[offset + 3]) >>> 0;
    }
    for (index = 16; index < 64; index += 1) {
      var x = w[index - 15], y = w[index - 2];
      var s0 = (ArcSha256.rotr(x, 7) ^ ArcSha256.rotr(x, 18) ^ (x >>> 3)) >>> 0;
      var s1 = (ArcSha256.rotr(y, 17) ^ ArcSha256.rotr(y, 19) ^ (y >>> 10)) >>> 0;
      w[index] = (w[index - 16] + s0 + w[index - 7] + s1) >>> 0;
    }
    var a = this.h[0], b = this.h[1], c = this.h[2], d = this.h[3];
    var e = this.h[4], f = this.h[5], g = this.h[6], h = this.h[7];
    for (index = 0; index < 64; index += 1) {
      var t1s = (ArcSha256.rotr(e, 6) ^ ArcSha256.rotr(e, 11) ^ ArcSha256.rotr(e, 25)) >>> 0;
      var choice = ((e & f) ^ (~e & g)) >>> 0;
      var temp1 = (h + t1s + choice + ArcSha256.K[index] + w[index]) >>> 0;
      var t2s = (ArcSha256.rotr(a, 2) ^ ArcSha256.rotr(a, 13) ^ ArcSha256.rotr(a, 22)) >>> 0;
      var majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      var temp2 = (t2s + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    this.h[0] = (this.h[0] + a) >>> 0; this.h[1] = (this.h[1] + b) >>> 0;
    this.h[2] = (this.h[2] + c) >>> 0; this.h[3] = (this.h[3] + d) >>> 0;
    this.h[4] = (this.h[4] + e) >>> 0; this.h[5] = (this.h[5] + f) >>> 0;
    this.h[6] = (this.h[6] + g) >>> 0; this.h[7] = (this.h[7] + h) >>> 0;
  };

  ArcSha256.prototype.digestHex = function () {
    if (!this.finished) {
      var bytesHashed = this.bytesHashed;
      var left = this.bufferLength;
      this.buffer[left] = 0x80;
      this.buffer.fill(0, left + 1);
      if (left >= 56) { this.hashBlock(this.buffer); this.buffer.fill(0); }
      var bits = bytesHashed * 8;
      var high = Math.floor(bits / 0x100000000);
      var low = bits >>> 0;
      this.buffer[56] = (high >>> 24) & 0xff; this.buffer[57] = (high >>> 16) & 0xff;
      this.buffer[58] = (high >>> 8) & 0xff;  this.buffer[59] = high & 0xff;
      this.buffer[60] = (low >>> 24) & 0xff;  this.buffer[61] = (low >>> 16) & 0xff;
      this.buffer[62] = (low >>> 8) & 0xff;   this.buffer[63] = low & 0xff;
      this.hashBlock(this.buffer);
      this.finished = true;
    }
    return Array.prototype.map.call(this.h, function (v) { return v.toString(16).padStart(8, "0"); }).join("");
  };

  /** hashFile(file, onProgress) -> Promise<hex>. Streams in 4 MB blocks. */
  function hashFile(file, onProgress) {
    var hasher = new ArcSha256();
    var chunkSize = 4 * 1024 * 1024;
    var offset = 0;
    function step() {
      if (offset >= file.size) return Promise.resolve(hasher.digestHex());
      var end = Math.min(file.size, offset + chunkSize);
      return file.slice(offset, end).arrayBuffer().then(function (buf) {
        hasher.update(new Uint8Array(buf));
        offset = end;
        if (onProgress) {
          try { onProgress(Math.min(99, Math.round((offset / file.size) * 100))); } catch (e) {}
        }
        return new Promise(function (r) { setTimeout(r, 0); }).then(step);
      });
    }
    if (!file.size) return Promise.resolve(hasher.digestHex());
    return step();
  }

  global.ARCHash = { ArcSha256: ArcSha256, hashFile: hashFile };
})(window);
