// Declare the dependencies
const snekfetch = require('node-fetch')
// For XML only apis
const xml2js = require('xml2js')
const parser = new xml2js.Parser()
const sites = require('./sites.json')

// Custom error type for when the boorus error or for user-side error, not my code
function BooruError(message) {
    this.name = 'BooruError'
    this.message = message || 'Error messsage unspecified.'
    this.stack = (new Error()).stack
}
BooruError.prototype = Object.create(Error.prototype)
BooruError.prototype.constructor = BooruError

/**
 * An image from a booru, has a few props and stuff
 * Properties vary per booru
 * @typedef  {Object} Image
 */

/**
  * An image from a booru with a few common props
  * @typedef  {Object}   ImageCommon
  * @property {Object}   common          - Contains several useful and common props for each booru
  * @property {String}   common.file_url - The direct link to the image
  * @property {String}   common.id       - The id of the post
  * @property {String[]} common.tags     - The tags of the image in an array
  * @property {Number}   common.score    - The score of the image
  * @property {String}   common.source   - Source of the image, if supplied
  * @property {String}   common.rating   - Rating of the image
  *
  * @example
  *  common: {
  *    file_url: 'https://aaaa.com/image.jpg',
  *    id: '124125',
  *    tags: ['cat', 'cute'],
  *    score: 5,
  *    source: 'https://giraffeduck.com/aaaa.png',
  *    rating: 's'
  *  }
  */

/**
 * Search options to use with booru.search()
 * @typedef  {Object}  SearchOptions
 * @property {Number}  [limit=1] The number of images to return
 * @property {Boolean} [random=false] If it should randomly grab results
 */

/**
 * Searches a site for images with tags and returns the results
 * @param  {String}        site      The site to search
 * @param  {String[]}      [tags=[]] Tags to search with
 * @param  {SearchOptions}
 * @return {Promise}           A promise with the images as an array of objects
 *
 * @example
 * booru.search('e926', ['glaceon', 'cute'])
 * //returns a promise with the latest cute glace pic from e926
 */
function search(site, tags = [], {limit = 1, random = false} = {}) {
    return new Promise((resolve, reject) => {
        site = resolveSite(site)
        limit = parseInt(limit)

        if (site === false) { return reject(new BooruError('Site not supported')) }

        if (!(tags instanceof Array)) { return reject(new BooruError('`tags` should be an array')) }

        if (typeof limit !== 'number' || Number.isNaN(limit)) { return reject(new BooruError('`limit` should be an int')) }

        resolve(searchPosts(site, tags, {limit, random}))
    })
}

/**
 * Check if `site` is a supported site (and check if it's an alias and return the sites's true name)
 * @param  {String}           siteToResolve The site to resolveSite
 * @return {(String|Boolean)}               False if site is not supported, the site otherwise
 */
function resolveSite(siteToResolve) {
    if (typeof siteToResolve !== 'string') { return false }

    siteToResolve = siteToResolve.toLowerCase()

    for (let site in sites) {
        if (site === siteToResolve || sites[site].aliases.includes(siteToResolve)) {
            return site
        }
    }

    return false
}

/**
 * Actual searching code
 * @private
 * @param  {String}  site   The full site url, name + tld
 * @param  {Array}   tags   The array of tags to search for
 * @param  {Number}  limit  Number of posts to fetch
 * @param  {searchOptions}
 * @return {Promise}        Response with the site's api
 */
function searchPosts(site, tags, {limit = 1, random = false} = {}) {
    return new Promise((resolve, reject) => {
    // derpibooru requires '*' to show all images
        if (tags[0] === undefined && site === 'derpibooru.org') { tags[0] = '*' }

        // derpibooru requires spaces instead of _
        if (site === 'derpibooru.org') { tags = tags.map(v => v.replace(/_/g, '%20')) }

        let uri = `http://${site}${sites[site].api}${(sites[site].tagQuery) ? sites[site].tagQuery : 'tags'}=${tags.join('+')}&limit=${limit}`
        let options = {
            headers: {'User-Agent': 'Booru, a node package for booru searching (by AtlasTheBot)'}
        }

        if (!random) {
            resolve(
                snekfetch
                    .get(uri, options)
                    .then(result => result.body)
                    .catch(err => reject(new BooruError(err.error.message || err.error)))
            )
        }

        // If we request random images...
        // First check if the site supports order:random (or some other way to randomize it)
        if (sites[site].random) {
            // If it's a string it's (likely) randomized using a user-provided random hex
            if (typeof sites[site].random === 'string') {
                uri = `http://${site}${sites[site].api}${(sites[site].tagQuery) ? sites[site].tagQuery : 'tags'}=${tags.join('+')}&limit=${limit}` +
            `&${sites[site].random}${(sites[site].random.endsWith('%')) ? Array(7).fill(0).map(v => randInt(0, 16)).join('') : ''}`
                // http://example.com/posts/?tags=some_example&limit=100&sf=random%AB43FF
                // Sorry, but derpibooru has an odd and confusing api that's not similar to the others at all
            } else {
                // We can just add `order:random` and get random results!
                uri = `http://${site}${sites[site].api}tags=order:random+${tags.join('+')}&limit=${limit}`
            }

            snekfetch
                .get(uri, options)
            // Once again, derpi is weird and has it's results in body.search and not just in body
                .then(result => resolve(((result.body.search) ? result.body.search : result.body).slice(0, limit)))
                .catch(err => reject(new BooruError(err.message || err.error)))
        } else {
            // The site doesn't support random sorting in any way, so we need to do it ourselves
            // This is done by just getting the 100 latest and randomly sorting those
            // Which isn't really an amazing way, but works well enough and doesn't require keeping track
            // of how many pages or whatever
            uri = `http://${site}${sites[site].api}tags=${tags.join('+')}&limit=100`

            // This does automatically jsonfy results, but that's because I can't really sort them otherwise
            snekfetch
                .get(uri, options)
                .then(result => jsonfy(result.text))
                .then(images => resolve(shuffle(images).slice(0, limit)))
                .catch(err => resolve(new BooruError(err.message || err.error)))
        }
    })
}

/**
 * Takes an array of images and converts to json is needed, and add an extra property called "common" with a few common properties
 * Allow you to simply use "images[2].common.tags" and get the tags instead of having to check if it uses .tags then realizing it doesn't
 * then having to use "tag_string" instead and aaaa i hate xml aaaa
 * @param  {Image[]}       images Array of {@link Image} objects
 * @return {ImageCommon[]}        Array of {@link ImageCommon} objects
 */
function commonfy(images) {
    return new Promise((resolve, reject) => {
        if (images[0] === undefined) return reject(new BooruError('You didn\'t give any images'))

        jsonfy(images).then(createCommon).then(resolve)
            .catch(e => reject(new BooruError('This function should only receive images: ' + e)))
    })
}

/**
 * Parse images xml to json, which can be used with js
 * @private
 * @param  {Image[]} images The images to convert to jsonfy
 * @return {Image[]}        The images in JSON format
 */
function jsonfy(images) {
    return new Promise((resolve, reject) => {
    // If it's an object, assume it's already jsonfied
        if (typeof images !== 'object') {
            parser.parseString(images, (err, res) => {
                if (err) { return reject(err) }

                if (res.posts.post !== undefined) {
                    resolve(res.posts.post.map(val => val.$))
                } else {
                    resolve([])
                }
            })
        } else resolve(images)
    })
}

/**
 * Create the .common property for each {@link Image} passed and removes images without a link to the image
 * @param  {Image[]}       images The images to add common props to
 * @return {ImageCommon[]}        The images with common props added
 */
function createCommon(images) {
    return new Promise((resolve, reject) => {
        const finalImages = []
        for (let i = 0; i < images.length; i++) {
            images[i].common = {}

            images[i].common.file_url = images[i].file_url || images[i].image
            images[i].common.id = images[i].id.toString()
            images[i].common.tags = ((images[i].tags !== undefined) ? images[i].tags.split(' ') : images[i].tag_string.split(' ')).map(v => v.replace(/,/g, '').replace(/ /g, '_'))
            images[i].common.tags = images[i].common.tags.filter(v => v !== '')
            images[i].common.score = parseInt(images[i].score)
            images[i].common.source = images[i].source
            images[i].common.rating = images[i].rating || /(safe|suggestive|questionable|explicit)/i.exec(images[i].tags)[0]

            if (images[i].common.rating === 'suggestive') images[i].common.rating = 'q' // i just give up at this point
            images[i].common.rating = images[i].common.rating.charAt(0)

            if (images[i].common.file_url === undefined) {
                images[i].common.file_url = images[i].source
            }

            // if the image's file_url is *still* undefined or the source is empty or it's deleted: don't use
            // thanks danbooru *grumble grumble*
            if (images[i].common.file_url === undefined ||
          images[i].common.file_url.trim() === '' ||
          images[i].is_deleted) { continue }

            if (images[i].common.file_url.startsWith('/data')) {
                images[i].common.file_url = 'https://danbooru.donmai.us' + images[i].file_url
            }

            if (images[i].common.file_url.startsWith('/cached')) {
                images[i].common.file_url = 'https://danbooru.donmai.us' + images[i].file_url
            }

            if (images[i].common.file_url.startsWith('/_images')) {
                images[i].common.file_url = 'https://dollbooru.org' + images[i].file_url
            }

            if (images[i].common.file_url.startsWith('//derpicdn.net')) {
                images[i].common.file_url = 'https:' + images[i].image
            }

            if (!images[i].common.file_url.startsWith('http')) {
                images[i].common.file_url = 'https:' + images[i].file_url
            }

            // lolibooru likes to shove all the tags into its urls, despite the fact you don't need the tags
            if (images[i].common.file_url.match(/https?:\/\/lolibooru.moe/)) {
                images[i].common.file_url =
          images[i].sample_url.replace(/(.*booru \d+ ).*(\..*)/, '$1sample$2')
            }

            finalImages.push(images[i])
        }

        resolve(finalImages)
    })
}

/**
 * Yay fisher-bates
 * Taken from http://stackoverflow.com/a/2450976
 * @private
 * @param  {Array} array Array of something
 * @return {Array}       Shuffled array of something
 */
function shuffle(array) {
    let currentIndex = array.length
    let temporaryValue
    let randomIndex

    // While there remain elements to shuffle...
    while (currentIndex !== 0) {
    // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex)
        currentIndex -= 1
        // And swap it with the current element.
        temporaryValue = array[currentIndex]
        array[currentIndex] = array[randomIndex]
        array[randomIndex] = temporaryValue
    }
    return array
}

// Thanks mdn and damnit derpibooru
function randInt(min, max) {
    min = Math.ceil(min)
    max = Math.floor(max)
    return Math.floor(Math.random() * (max - min + 1)) + min
}

module.exports = search // allow for shorthand `booru('site'...)` use
module.exports.search = search // The actual search function
module.exports.commonfy = commonfy // do the thing
module.exports.sites = sites // Sites in case you want to see what it supports
module.exports.resolveSite = resolveSite // might as well /shrug

// coding is fun :)
