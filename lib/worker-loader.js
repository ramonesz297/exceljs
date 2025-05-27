const bundleFn = arguments[3];
const sources = arguments[4];
const cache = arguments[5];

const {stringify} = JSON;

/**
 *
 * @param {*} fn
 * @param {*} options
 * @returns {Worker}
 */
function workerLoader(fn, options) {
  let wkey;
  const cacheKeys = Object.keys(cache);

  for (var i = 0, l = cacheKeys.length; i < l; i++) {
    var key = cacheKeys[i];
    const exp = cache[key].exports;
    // Using babel as a transpiler to use esmodule, the export will always
    // be an object with the default export as a property of it. To ensure
    // the existing api and babel esmodule exports are both supported we
    // check for both
    if (exp === fn || (exp && exp.default === fn)) {
      wkey = key;
      break;
    }
  }

  if (!wkey) {
    wkey = Math.floor(Math.pow(16, 8) * Math.random()).toString(16);
    const wcache = {};
    for (var i = 0, l = cacheKeys.length; i < l; i++) {
      var key = cacheKeys[i];
      wcache[key] = key;
    }
    sources[wkey] = [`function(require,module,exports){${fn}(self); }`, wcache];
  }
  const skey = Math.floor(Math.pow(16, 8) * Math.random()).toString(16);

  const scache = {};
  scache[wkey] = wkey;
  sources[skey] = [
    `${
      'function(require,module,exports){' +
      // try to call default if defined to also support babel esmodule exports
      'var f = require('
    }${stringify(wkey)});` +
      '(f.default ? f.default : f)(self);' +
      '}',
    scache,
  ];

  const workerSources = {};
  resolveSources(skey);

  function resolveSources(key) {
    workerSources[key] = true;

    for (const depPath in sources[key][1]) {
      const depKey = sources[key][1][depPath];
      if (!workerSources[depKey]) {
        resolveSources(depKey);
      }
    }
  }

  const src = `(${bundleFn})({${Object.keys(workerSources)
    .map(function(key) {
      return `${stringify(key)}:[${sources[key][0]},${stringify(sources[key][1])}]`;
    })
    .join(',')}},{},[${stringify(skey)}])`;
  const URL = window.URL || window.webkitURL || window.mozURL || window.msURL;

  const blob = new Blob([src], {type: 'text/javascript'});
  if (options && options.bare) {
    return blob;
  }
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl,{
    name:'exceljs-worker',
  });
  worker.objectURL = workerUrl;
  return worker;
}

module.exports = workerLoader;
