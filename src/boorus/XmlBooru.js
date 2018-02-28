//@ts-check
const IBooru = require('./IBooru.js')
const Utils = require('../Utils.js')
const Constants = require('../Constants.js')
const BooruImage = require('../Image.js')
const Snekfetch = require('snekfetch')

/**
 * A class designed for Xml-returning boorus
 *
 * @private
 * @extends IBooru
 * @inheritDoc
 */
class XmlBooru extends IBooru {
  /**
   * Create a new booru using XML from a site
   * @param {Site} site The site to use
   * @param {Object?} credentials Credentials for the API (Currently not used)
   */
  constructor(site, credentials) {
    super(site, credentials)
  }

  /** @inheritDoc */
  search(tags, {
    limit = 1,
    random = false
  } = {}) {
    if (!Array.isArray(tags)) {
      tags = [tags]
    }

    // Used for random on sites without order:random
    let fakeLimit

    if (random) {
      if (this.site.random) {
        tags.push('order:random')
      } else {
        fakeLimit = 100
      }
    }

    const uri = Constants.searchURI(this.domain, this.site, tags, fakeLimit || limit)
    const options = Constants.defaultOptions

    return new Promise((resolve, reject) => {
      Snekfetch.get(uri, options)
        .then(result => {
          let r = Utils.jsonfy(result.text)
          if (fakeLimit) {
            r = Utils.shuffle(r)
          }
          resolve(r.slice(0, limit).map(v => new BooruImage(v, this)))
        })
        .catch(e => reject(new Constants.BooruError(e.message || e.error)))
    })
  }
}
module.exports = XmlBooru