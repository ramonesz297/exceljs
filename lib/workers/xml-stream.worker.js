// const XmlStream = require('../utils/xml-stream');
const textEncoder = typeof TextEncoder === 'undefined' ? null : new TextEncoder('utf-8');

/**
 *
 * @param {Worker} self
 */
module.exports = function(self) {
  let buff = new ArrayBuffer(1024 * 1024 * 16);
  const LIMIT = 2 * 1024 * 1024 * 1024;
  let u8 = new Uint8Array(buff);
  let off = 0;

  /** @param {string[]} chunk */
  function writeChunk(chunks) {
    /**
     * @type {string}
     */
    let data = chunks.join('');

    while (data.length > 0) {
      const result = textEncoder.encodeInto(data, u8.subarray(off));
      off += result.written;
      if (result.read < data.length) {
        data = data.slice(result.read);
        const newLen = Math.min(u8.length * 2, LIMIT);
        const newBuff = new ArrayBuffer(newLen);
        const newu8 = new Uint8Array(newBuff);
        newu8.set(u8);
        buff = newBuff;
        u8 = newu8;
      } else {
        break;
      }
    }
  }

  /**
   *
   * @param {{data:{type:   'addChank' | 'end', args: any[]}}} e
   */
  self.onmessage = e => {
    if (e.data.type == 'addChank') {
      writeChunk(e.data.args);
    } else if (e.data.type == 'end') {
      if(typeof buff.transferToFixedLength == 'function'){
        const out = buff.transferToFixedLength(off);
        self.postMessage(out, [out]);
      }else{
        const out = buff.slice(0, off);
        self.postMessage(out, [out]);
      }
    }
  };
};
