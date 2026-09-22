const fs = require('fs');
const vm = require('vm');

describe('XML worker', () => {
  [true, false].forEach(cached => {
    it(`keeps the shared module registry unchanged for a ${cached ? 'cached' : 'standalone'} worker`, async () => {
      const worker = function(self) { self.ready = true; };
      const sources = {worker: [`function(require,module,exports){module.exports=${worker};}`, {}]};
      const cache = cached ? {worker: {exports: worker}} : {};
      const original = JSON.stringify(sources);
      const module = {exports: {}};
      const source = fs.readFileSync(require.resolve('../../../lib/worker-loader'), 'utf8');
      const init = vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {Blob});
      const bundle = function(modules, unused, entries) {
        const load = id => {
          const m = {exports: {}};
          modules[id][0](name => load(modules[id][1][name]), m, m.exports);
          return m.exports;
        };
        entries.forEach(load);
      };
      init(null, module, module.exports, bundle, sources, cache);

      for (let i = 0; i < 3; i++) {
        const blob = module.exports(worker, {bare: true});
        if (cached) {
          const self = {};
          vm.runInNewContext(await blob.text(), {self});
          expect(self.ready).to.equal(true);
        }
        expect(JSON.stringify(sources)).to.equal(original);
      }
    });
  });

  it('rejects output at the buffer limit without allocating the same capacity again', () => {
    const sizes = [];
    const module = {exports: {}};
    const source = fs.readFileSync(require.resolve('../../../lib/workers/xml-stream.worker'), 'utf8');
    vm.runInNewContext(source, {
      module,
      TextEncoder: class {
        encodeInto() { return {read: 0, written: 0}; }
      },
      ArrayBuffer: class {
        constructor(size) {
          if (sizes.includes(size)) throw new Error('Repeated buffer allocation');
          sizes.push(size);
          this.byteLength = size;
        }
      },
      Uint8Array: class {
        constructor(buffer) { this.length = buffer.byteLength; }
        subarray() { return this; }
        set() {}
      },
    });
    const self = {};
    module.exports(self);
    expect(() => self.onmessage({data: {type: 'addChank', args: ['x']}}))
      .to.throw('ExcelJS XML output exceeds the 2 GiB worker buffer limit');
    expect(sizes[sizes.length - 1]).to.equal(2 * 1024 * 1024 * 1024);
  });
});
