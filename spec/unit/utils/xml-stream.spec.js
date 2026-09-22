const XmlStream = verquire('utils/xml-stream');

describe('XmlStream', () => {
  it('flushes many chunks without revisiting previously sent buckets', () => {
    const xmlStream = new XmlStream();
    const sent = [];
    xmlStream._worker = {postMessage: message => sent.push(message.args.join(''))};
    let bucketReads = 0;
    xmlStream._chanks = new Proxy(xmlStream._chanks, {
      get(target, key) {
        if (/^\d+$/.test(String(key))) bucketReads++;
        return Reflect.get(target, key);
      },
    });

    const count = 8196 * 10 + 7;
    for (let i = 0; i < count; i++) xmlStream.writeXml('x');
    xmlStream._flush();

    expect(sent.join('')).to.equal('x'.repeat(count));
    expect(bucketReads).to.be.at.most(sent.length * 2);
  });

  ['rollback', 'commit'].forEach(action => {
    it(`preserves worker output after ${action} across chunk boundaries`, () => {
      const xmlStream = new XmlStream();
      const sent = [];
      xmlStream._worker = {postMessage: message => sent.push(message.args.join(''))};
      for (let i = 0; i < 8199; i++) xmlStream.writeXml('a');
      xmlStream.addRollback();
      for (let i = 0; i < 16397; i++) xmlStream.writeXml('b');
      xmlStream[action]();
      for (let i = 0; i < 8201; i++) xmlStream.writeXml('c');
      xmlStream._flush();

      expect(sent.join('')).to.equal(
        'a'.repeat(8199) + (action === 'commit' ? 'b'.repeat(16397) : '') + 'c'.repeat(8201)
      );
    });
  });

  ['success', 'error', 'postMessage error', 'flush error'].forEach(outcome => {
    it(`releases the worker and Blob URL after ${outcome}`, async () => {
      const xmlStream = new XmlStream();
      const objectURL = URL.createObjectURL(new Blob(['worker source']));
      const error = new Error('Worker failed');
      const result = new ArrayBuffer(1);
      let onMessage;
      let terminated = false;
      xmlStream._worker = {
        objectURL,
        addEventListener(type, listener) {
          onMessage = listener;
        },
        postMessage() {
          if (outcome === 'postMessage error') throw error;
          if (outcome === 'error') this.onerror(error);
          else onMessage({data: result});
        },
        terminate() {
          terminated = true;
        },
      };
      if (outcome === 'flush error') {
        xmlStream._flush = () => { throw error; };
      }

      const actual = await xmlStream.toArrayBuffer().catch(e => e);
      expect(actual).to.equal(outcome === 'success' ? result : error);
      expect(terminated).to.equal(true);
      expect(xmlStream._worker).to.equal(null);
      expect(require('buffer').resolveObjectURL(objectURL)).to.equal(undefined);
    });
  });

  it('Writes simple XML doc', () => {
    const xmlStream = new XmlStream();

    xmlStream.openXml(XmlStream.StdDocAttributes);
    xmlStream.openNode('root', {
      attr1: 'attr1-value',
      attr2: 'attr2-value',
    });
    xmlStream.openNode('l1');
    xmlStream.openNode('l2');
    xmlStream.addAttribute('l2a1', 'v1');
    xmlStream.addAttribute('l2a2', 'v2');
    xmlStream.closeNode();
    xmlStream.closeNode();
    xmlStream.closeNode();
    expect(xmlStream.xml).to.equal(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<root attr1="attr1-value" attr2="attr2-value"><l1><l2 l2a1="v1" l2a2="v2"/></l1></root>'
    );
  });

  it('Writes text in XML doc', () => {
    const xmlStream = new XmlStream();

    xmlStream.openNode('root');
    xmlStream.openNode('l1');
    xmlStream.openNode('l2');
    xmlStream.addAttribute('l2a1', 'v1');
    xmlStream.writeText('Hello, World!');
    xmlStream.closeNode();
    xmlStream.openNode('l2');
    xmlStream.addAttribute('l2a1', 'v2');
    xmlStream.writeText('See ya later, Alligator!');
    xmlStream.closeNode();
    xmlStream.closeNode();
    xmlStream.closeNode();
    expect(xmlStream.xml).to.equal(
      '<root><l1><l2 l2a1="v1">Hello, World!</l2><l2 l2a1="v2">See ya later, Alligator!</l2></l1></root>'
    );
  });
  it('text is escaped', () => {
    const xmlStream = new XmlStream();

    xmlStream.openNode('root');
    xmlStream.openNode('l1');
    xmlStream.writeText('<escape this!>');
    xmlStream.closeNode();
    xmlStream.closeNode();
    expect(xmlStream.xml).to.equal(
      '<root><l1>&lt;escape this!&gt;</l1></root>'
    );
  });
  it('attributes are escaped', () => {
    const xmlStream = new XmlStream();

    xmlStream.openNode('root');
    xmlStream.openNode('l1');
    xmlStream.addAttribute('stuff', 'this & that');
    xmlStream.openNode('l2', {foo: '<bar>'});
    xmlStream.closeNode();
    xmlStream.leafNode('l2', {quote: '"this"'});
    xmlStream.closeNode();
    xmlStream.closeNode();
    expect(xmlStream.xml).to.equal(
      '<root><l1 stuff="this &amp; that"><l2 foo="&lt;bar&gt;"/><l2 quote="&quot;this&quot;"/></l1></root>'
    );
  });

  it('rolls back', () => {
    const xmlStream = new XmlStream();

    xmlStream.openNode('root');
    xmlStream.addAttribute('in', '1');
    xmlStream.addRollback();
    xmlStream.addAttribute('not', '1');
    xmlStream.openNode('invalid');
    xmlStream.rollback();
    xmlStream.addAttribute('also', '2');
    xmlStream.openNode('valid');
    xmlStream.closeNode();
    xmlStream.closeNode();
    expect(xmlStream.xml).to.equal('<root in="1" also="2"><valid/></root>');
  });
});
