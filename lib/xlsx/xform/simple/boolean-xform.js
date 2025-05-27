const XmlStream = require('../../../utils/xml-stream');
const BaseXform = require('../base-xform');

class BooleanXform extends BaseXform {
  constructor(options) {
    super();

    this.tag = options.tag;
    this.attr = options.attr;
  }

  /**
   * 
   * @param {XmlStream} xmlStream 
   * @param {*} model 
   */
  render(xmlStream, model) {
    if (model) {
        xmlStream.writeRaw(`<${this.tag}/>`)
    }
  }

  parseOpen(node) {
    if (node.name === this.tag) {
      this.model = true;
    }
  }

  parseText() {}

  parseClose() {
    return false;
  }
}

module.exports = BooleanXform;
