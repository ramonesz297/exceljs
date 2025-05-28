const _ = require('./under-dash');
const workerLoader = require('../worker-loader');
const worker = require('../workers/xml-stream.worker');
const utils = require('./utils');

const CHANK_SIZE = 8196;
// constants
const OPEN_ANGLE = '<';
const CLOSE_ANGLE = '>';
const OPEN_ANGLE_SLASH = '</';
const CLOSE_SLASH_ANGLE = '/>';

/**
 *
 * @param {XmlStream} xml
 * @param {string} name
 * @param {string} value
 */
function pushAttribute(xml, name, value) {
  xml.push(` ${name}="${utils.xmlEncode(value.toString())}"`);
}

/**
 *
 * @param {XmlStream} xml
 * @param {*} attributes
 */
function pushAttributes(xml, attributes) {
  if (attributes) {
    const tmp = [];
    _.each(attributes, (value, name) => {
      if (value !== undefined) {
        tmp.push(` ${name}="${utils.xmlEncode(value.toString())}"`);
      }
    });
    xml.push(tmp.join(''));
  }
}

class XmlStream {
  /**
   * @type {Worker | null}
   */
  _worker;

  constructor(options = {useWorker: false}) {
    this._worker = options && options.useWorker == true && typeof Worker === 'function' ? workerLoader(worker) : null;
    this._chanks = [[]];
    this._buffer = this._chanks[0];
    this._count = 0;
    this._totalCount = 0;
    this._stack = [];
    this._rollbacks = [];
    if (!this._worker) {
      this._flush = () => {};
    }
  }

  /**
   * @private
   * @type {string | undefined}
   */
  get tos() {
    return this._stack.length ? this._stack[this._stack.length - 1] : undefined;
  }

  /**
   * @private
   * @type {number}
   */
  get cursor() {
    // handy way to track whether anything has been added
    return this._totalCount;
  }

  /**
   *
   * @param {string} val
   * @returns {void}
   */
  push(val) {
    this._buffer[this._count++] = val;
    this._totalCount++;
    if (this._count >= CHANK_SIZE) {
      this._buffer = [];
      this._chanks.push(this._buffer);
      this._count = 0;
      const rollbackActive = this._rollbacks.length > 0;
      if (!rollbackActive && this._worker) {
        this._flush();
      }
    }
  }

  _flush = () => {
    if (this._worker === null) {
      return;
    }
    for (let i = 0; i < this._chanks.length; i++) {
      const t = this._chanks[i];
      if (t.length > 0) {
        if (t == this._buffer) {
          this._worker.postMessage({type: 'addChank', args: t.slice(0, this._count)});
        } else {
          this._worker.postMessage({type: 'addChank', args: t});
        }
        t.length = 0;
      }
    }
  };

  /**
   *
   * @param {Object | Array | undefined} docAttributes
   * @returns {void}
   */
  openXml(docAttributes) {
    this.push('<?xml');
    pushAttributes(this, docAttributes);
    this.push('?>\n');
  }

  /**
   *
   * @param {string} name
   * @param {Object | Array | undefined} attributes
   */
  openNode(name, attributes) {
    const parent = this.tos;
    if (parent && this.open) {
      this.push(CLOSE_ANGLE);
    }

    this._stack.push(name);

    // start streaming node
    this.push(OPEN_ANGLE);
    this.push(name);
    pushAttributes(this, attributes);
    this.leaf = true;
    this.open = true;
  }

  addAttribute(name, value) {
    if (!this.open) {
      throw new Error('Cannot write attributes to node if it is not open');
    }
    if (value !== undefined) {
      pushAttribute(this, name, value);
    }
  }

  /**
   * for raw values where key and value are knonw and already encoded
   * for internal use only
   * @param {string} value
   */
  addAttributeRaw(value) {
    this.push(value);
  }

  addAttributes(attrs) {
    if (!this.open) {
      throw new Error('Cannot write attributes to node if it is not open');
    }
    pushAttributes(this, attrs);
  }

  writeText(text) {
    if (this.open) {
      this.push(CLOSE_ANGLE);
      this.open = false;
    }
    this.leaf = false;
    this.push(utils.xmlEncode(text.toString()));
  }

  writeRaw(text) {
    const parent = this.tos;
    if (parent && this.open) {
      this.push(CLOSE_ANGLE);
    }
    this.push(text);
    this.open = false;
    this.leaf = false;
  }

  writeXml(xml) {
    if (this.open) {
      this.push(CLOSE_ANGLE);
      this.open = false;
    }
    this.leaf = false;
    this.push(xml);
  }

  closeNode() {
    const node = this._stack.pop();
    if (this.leaf) {
      this.push(CLOSE_SLASH_ANGLE);
    } else {
      this.push(OPEN_ANGLE_SLASH);
      this.push(node);
      this.push(CLOSE_ANGLE);
    }
    this.open = false;
    this.leaf = false;
  }

  leafNode(name, attributes, text) {
    this.openNode(name, attributes);
    if (text !== undefined) {
      this.writeText(text);
    }
    this.closeNode();
  }

  closeAll() {
    while (this._stack.length) {
      this.closeNode();
    }
  }

  addRollback() {
    const {cursor} = this;
    this._rollbacks.push({
      xml: cursor,
      buket: this._chanks.length - 1,
      stack: this._stack.length,
      leaf: this.leaf,
      open: this.open,
    });
    return cursor;
  }

  commit() {
    this._rollbacks.pop();
  }

  rollback() {
    const r = this._rollbacks.pop();
    const totalCount = this._totalCount;

    if (totalCount > r.xml) {
      const targetBucket = r.buket;
      const currentBucket = this._chanks.length - 1;
      if (currentBucket > targetBucket) {
        this._chanks = this._chanks.slice(0, targetBucket + 1);
        if (!this._chanks.length) {
          this._chanks = [new Array(CHANK_SIZE)];
          this._buffer = this._chanks[0];
        } else {
          this._buffer = this._chanks[targetBucket];
        }
      }

      this._count = r.xml % CHANK_SIZE;
      this._totalCount = r.xml;
    }

    if (this._stack.length > r.stack) {
      this._stack.splice(r.stack, this._stack.length - r.stack);
    }
    this.leaf = r.leaf;
    this.open = r.open;
  }

  /**
   * @private
   * @returns {string[]}
   */
  get _parts() {
    const last = this._chanks.length - 1;
    return this._chanks.map((c, i) => {
      if (i === last) {
        c.length = this._count;
      }
      return c.join('');
    });
  }

  get xml() {
    if (this._worker !== null) {
      throw new Error('Cannot get xml from XmlStream, use toArrayBuffer() instead');
    }
    this.closeAll();
    return this._parts.join('');
  }

  /**
   *
   * @private
   * @returns {Promise<ArrayBuffer>}
   */
  _webWorkerToBlob() {
    this._flush();
    return new Promise((resolve, reject) => {
      this._worker.addEventListener('message', e => {
        resolve(e.data);
        this._buffer = [];
        this._chanks = [this._buffer];
        this._count = 0;
        this._totalCount = 0;
        this._stack = [];
        this._rollbacks = [];
        this._worker.terminate();
        this._worker = null;
      });
      this._worker.onerror = e => {
        reject(e);
      };
      this._worker.postMessage({type: 'end'});
    });
  }

  /**
   *
   * @returns {Promise<ArrayBuffer>}
   */
  toArrayBuffer() {
    this.closeAll();
    if (this._worker === null) {
      return new Blob(this._parts).arrayBuffer();
    } else {
      return this._webWorkerToBlob();
    }
  }
}

XmlStream.StdDocAttributes = {
  version: '1.0',
  encoding: 'UTF-8',
  standalone: 'yes',
};

module.exports = XmlStream;
