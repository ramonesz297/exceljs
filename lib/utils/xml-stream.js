const _ = require('./under-dash');

const utils = require('./utils');

const CHANK_SIZE = 10000;
// constants
const OPEN_ANGLE = '<';
const CLOSE_ANGLE = '>';
const OPEN_ANGLE_SLASH = '</';
const CLOSE_SLASH_ANGLE = '/>';

/**
 *
 * @param {string} xml
 * @param {string} name
 * @param {string} value
 */
function pushAttribute(xml, name, value) {
  xml.push(` ${name}="${utils.xmlEncode(value.toString())}"`);
}
/**
 *
 * @param {XmlStream} xml
 * @param {string} name
 * @param {string} value
 */
function pushAttributeToStream(xml, name, value) {
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
        pushAttribute(tmp, name, value);
      }
    });
    xml.push(tmp.join(''));
  }
}

class XmlStream {
  constructor() {
    this._chanks = [new Array(CHANK_SIZE)];
    this._buffer = this._chanks[0];
    this._count = 0;
    this._totalCount = 0;
    // this._xml = [];
    this._stack = [];
    this._rollbacks = [];
  }

  get tos() {
    return this._stack.length ? this._stack[this._stack.length - 1] : undefined;
  }

  // get cursor() {
  //   // handy way to track whether anything has been added
  //   return this._xml.length;
  // }
  get cursor() {
    // handy way to track whether anything has been added
    return this._totalCount;
  }

  /**
   *
   * @param {string} val
   */
  push(val) {
    this._buffer[this._count++] = val;
    this._totalCount++;
    if (this._count >= CHANK_SIZE) {
      this._buffer = new Array(CHANK_SIZE);
      this._chanks.push(this._buffer);
      this._count = 0;
    }
  }

  openXml(docAttributes) {
    // const xml = this._xml;
    // <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    this.push('<?xml');
    pushAttributes(this, docAttributes);
    this.push('?>\n');
  }

  openNode(name, attributes) {
    const parent = this.tos;
    // const xml = this._xml;
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
      pushAttributeToStream(this, name, value);
    }
  }

  addAttributes(attrs) {
    if (!this.open) {
      throw new Error('Cannot write attributes to node if it is not open');
    }
    pushAttributes(this, attrs);
  }

  writeText(text) {
    // const xml = this._xml;
    if (this.open) {
      this.push(CLOSE_ANGLE);
      this.open = false;
    }
    this.leaf = false;
    this.push(utils.xmlEncode(text.toString()));
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
    // const xml = this._xml;
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
      // zeros need to be written
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
      // const targetIndex = r.xml % CHANK_SIZE;
      if (currentBucket > targetBucket) {
        this._chanks = this._chanks.slice(0, targetBucket + 1);
        if (!this._chanks.length) {
          this._chanks = [new Array(CHANK_SIZE)];
          this._buffer = this._chanks[0];
        } else {
          this._buffer = this._chanks[targetBucket];
        }
      }

      // const startIndex = r.xml;
      // const endIndex = totalCount - r.xml;
      this._count = r.xml % CHANK_SIZE;
      // this._buffer = this._buffer.slice(0, this._count);
      this._totalCount = r.xml;
    }

    if (this._stack.length > r.stack) {
      this._stack.splice(r.stack, this._stack.length - r.stack);
    }
    this.leaf = r.leaf;
    this.open = r.open;
  }

  get xml() {
    this.closeAll();
    let result = '';
    const buffer = this._buffer;
    for (let i = 0; i < this._chanks.length; i++) {
      const chank = this._chanks[i];
      if (chank === buffer) {
        result += chank.slice(0, this._count).join('');
      } else if (chank) {
        result += chank.join('');
      }
    }
    return result;
  }
}

XmlStream.StdDocAttributes = {
  version: '1.0',
  encoding: 'UTF-8',
  standalone: 'yes',
};

module.exports = XmlStream;
