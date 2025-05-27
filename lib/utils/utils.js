const fs = require('fs');

const ESC = {
  34: '&quot;',
  38: '&amp;',
  39: '&apos;',
  60: '&lt;',
  62: '&gt;',
};
// useful stuff
const inherits = function(cls, superCtor, statics, prototype) {
  // eslint-disable-next-line no-underscore-dangle
  cls.super_ = superCtor;

  if (!prototype) {
    prototype = statics;
    statics = null;
  }

  if (statics) {
    Object.keys(statics).forEach(i => {
      Object.defineProperty(cls, i, Object.getOwnPropertyDescriptor(statics, i));
    });
  }

  const properties = {
    constructor: {
      value: cls,
      enumerable: false,
      writable: false,
      configurable: true,
    },
  };
  if (prototype) {
    Object.keys(prototype).forEach(i => {
      properties[i] = Object.getOwnPropertyDescriptor(prototype, i);
    });
  }

  cls.prototype = Object.create(superCtor.prototype, properties);
};
function escapeAt(text) {
  if (!text) {
    return -1;
  }

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    if (code === 127) {
      return i;
    }
    if (code <= 31 && (code <= 8 || (code >= 11 && code !== 13))) {
      return i;
    }
   
    if (code === 34 || code === 38 || code === 39 || code === 60 || code === 62) {
      return i;
    }
  }
  return -1;
}
// eslint-disable-next-line no-control-regex
const utils = {
  nop() {},
  promiseImmediate(value) {
    return new Promise(resolve => {
      if (global.setImmediate) {
        setImmediate(() => {
          resolve(value);
        });
      } else {
        // poorman's setImmediate - must wait at least 1ms
        setTimeout(() => {
          resolve(value);
        }, 1);
      }
    });
  },
  inherits,
  dateToExcel(d, date1904) {
    // eslint-disable-next-line no-mixed-operators
    return 25569 + d.getTime() / (24 * 3600 * 1000) - (date1904 ? 1462 : 0);
  },
  excelToDate(v, date1904) {
    // eslint-disable-next-line no-mixed-operators
    const millisecondSinceEpoch = Math.round((v - 25569 + (date1904 ? 1462 : 0)) * 24 * 3600 * 1000);
    return new Date(millisecondSinceEpoch);
  },
  parsePath(filepath) {
    const last = filepath.lastIndexOf('/');
    return {
      path: filepath.substring(0, last),
      name: filepath.substring(last + 1),
    };
  },
  getRelsPath(filepath) {
    const path = utils.parsePath(filepath);
    return `${path.path}/_rels/${path.name}.rels`;
  },
  /**
   *
   * @param {string} text
   */
  xmlEncode(text) {
    const index = escapeAt(text);
    if (index === -1) {
      return text;
    }

    const out = index > 0 ? [text.slice(0, index)] : [];

    for (let i = index; i < text.length; i++) {
      const code = text.charCodeAt(i);

      if (code === 127) {
        continue;
      }
      if (code <= 31 && (code <= 8 || (code >= 11 && code !== 13))) {
        continue;
      }

      const esc = ESC[code];
      if (esc) out.push(esc);
      else {
        out.push(text[i]);
      }
    }
    return out.join('');
  },
  xmlDecode(text) {
    return text.replace(/&([a-z]*);/g, c => {
      switch (c) {
        case '&lt;':
          return '<';
        case '&gt;':
          return '>';
        case '&amp;':
          return '&';
        case '&apos;':
          return '\'';
        case '&quot;':
          return '"';
        default:
          return c;
      }
    });
  },
  validInt(value) {
    const i = parseInt(value, 10);
    return !Number.isNaN(i) ? i : 0;
  },

  isDateFmt(fmt) {
    if (!fmt) {
      return false;
    }

    // must remove all chars inside quotes and []
    fmt = fmt.replace(/\[[^\]]*]/g, '');
    fmt = fmt.replace(/"[^"]*"/g, '');
    // then check for date formatting chars
    const result = fmt.match(/[ymdhMsb]+/) !== null;
    return result;
  },

  fs: {
    exists(path) {
      return new Promise(resolve => {
        fs.access(path, fs.constants.F_OK, err => {
          resolve(!err);
        });
      });
    },
  },

  toIsoDateString(dt) {
    return dt.toIsoString().subsstr(0, 10);
  },

  parseBoolean(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
  },

  *range(start, stop, step = 1) {
    const compareOrder = step > 0 ? (a, b) => a < b : (a, b) => a > b;
    for (let value = start; compareOrder(value, stop); value += step) {
      yield value;
    }
  },

  toSortedArray(values) {
    const result = Array.from(values);

    // Note: per default, `Array.prototype.sort()` converts values
    // to strings when comparing. Here, if we have numbers, we use
    // numeric sort.
    if (result.every(item => Number.isFinite(item))) {
      const compareNumbers = (a, b) => a - b;
      return result.sort(compareNumbers);
    }

    return result.sort();
  },

  objectFromProps(props, value = null) {
    // *Note*: Using `reduce` as `Object.fromEntries` requires Node 12+;
    // ExcelJs is >=8.3.0 (as of 2023-10-08).
    // return Object.fromEntries(props.map(property => [property, value]));
    return props.reduce((result, property) => {
      result[property] = value;
      return result;
    }, {});
  },
};

module.exports = utils;
