import fetch from 'node-fetch'
import { Parser } from 'xml2js'

import BooruError from './error/BooruError'
import ArrayUtil from './util/ArrayUtil'

import sites from '../sites.json'

/**
 * Search options to use with booru.search()
 * @typedef  {Object}  SearchOptions
 * @property {Number}  [limit=1] The number of images to return
 * @property {Boolean} [random=false] If it should randomly grab results
 */

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

export default class Booru {
    /**
     * Parse images xml to json, which can be used with js
     * @static
     * @param  {Image[]} images The images to convert to jsonfy
     * @return {Image[]}        The images in JSON format
     */
    static jsonfy(images) {
        return new Promise((resolve, reject) => {
        // If it's an object, assume it's already jsonfied
            if (typeof images !== 'object') {
                this.parser.parseString(images, (err, res) => {
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
     * Takes an array of images and converts to json is needed, and add an extra property called "common" with a few common properties
     * Allow you to simply use "images[2].common.tags" and get the tags instead of having to check if it uses .tags then realizing it doesn't
     * then having to use "tag_string" instead and aaaa i hate xml aaaa
     * @param  {Image[]}       images Array of {@link Image} objects
     * @return {ImageCommon[]}        Array of {@link ImageCommon} objects
     */
    static commonfy(images) {
        return new Promise((resolve, reject) => {
            if (typeof images[0] === 'undefined') {
                return reject(new BooruError('You didn\'t give any images'))
            }

            Booru.jsonfy(images)
                .then(Booru.createCommon)
                .then(resolve)
                .catch(e => reject(new BooruError('This function should only receive images: ' + e)))
        })
    }

    /**
     * Create the .common property for each {@link Image} passed and removes images without a link to the image
     * @param  {Image[]}       images The images to add common props to
     * @return {ImageCommon[]}        The images with common props added
     */
    static createCommon(images) {
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

                if (images[i].common.rating === 'suggestive') {
                    images[i].common.rating = 'q' // i just give up at this point
                }
                images[i].common.rating = images[i].common.rating.charAt(0)

                if (images[i].common.file_url === undefined) {
                    images[i].common.file_url = images[i].source
                }

                // if the image's file_url is *still* undefined or the source is empty or it's deleted: don't use
                // thanks danbooru *grumble grumble*
                if (images[i].common.file_url === undefined || images[i].common.file_url.trim() === '' || images[i].is_deleted) {
                    continue
                }

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
                    images[i].common.file_url = images[i].sample_url.replace(/(.*booru \d+ ).*(\..*)/, '$1sample$2')
                }

                finalImages.push(images[i])
            }

            resolve(finalImages)
        })
    }

    /**
     * Check if `site` is a supported site (and check if it's an alias and return the sites's true name)
     * @param  {String}           siteToResolve The site to resolveSite
     * @return {(String|Boolean)}               False if site is not supported, the site otherwise
     */
    static resolveSite(siteToResolve) {
        if (typeof siteToResolve !== 'string') { return false }

        siteToResolve = siteToResolve.toLowerCase()

        for (let site in sites) {
            if (site === siteToResolve || sites[site].aliases.includes(siteToResolve)) {
                return site
            }
        }

        return false
    }

    parser = new Parser()

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
    search(site, tags = [], {limit = 1, random = false} = {}) {
        return new Promise((resolve, reject) => {
            site = Booru.resolveSite(site)
            limit = parseInt(limit)

            if (site === false) {
                return reject(new BooruError('Site not supported'))
            }

            if (!(tags instanceof Array)) {
                return reject(new BooruError('`tags` should be an array'))
            }

            if (typeof limit !== 'number' || Number.isNaN(limit)) {
                return reject(new BooruError('`limit` should be an int'))
            }

            resolve(this.searchPosts(site, tags, {limit, random}))
        })
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
    searchPosts(site, tags, {limit = 1, random = false} = {}) {
        return new Promise((resolve, reject) => {
            // derpibooru requires '*' to show all images
            if (tags[0] === undefined && site === 'derpibooru.org') { tags[0] = '*' }

            // derpibooru requires spaces instead of _
            if (site === 'derpibooru.org') { tags = tags.map(v => v.replace(/_/g, '%20')) }

            let uri = `http://${site}${sites[site].api}${(sites[site].tagQuery) ? sites[site].tagQuery : 'tags'}=${tags.join('+')}&limit=${limit}`
            let options = {
                headers: {'User-Agent': 'Booru, a node package for booru searching (by AtlasTheBot)'},
                gzip: true,
                json: true
            }

            if (!random) {
                resolve(
                    fetch(uri, options)
                        .then(result => result.json())
                        .catch(err => reject(new BooruError(err.message || (err.error && err.error.message) || err.error)))
                )
            }

            // If we request random images...
            // First check if the site supports order:random (or some other way to randomize it)
            if (sites[site].random) {
                // If it's a string it's (likely) randomized using a user-provided random hex
                if (typeof sites[site].random === 'string') {
                    uri = `http://${site}${sites[site].api}${(sites[site].tagQuery) ? sites[site].tagQuery : 'tags'}=${tags.join('+')}&limit=${limit}` +
                    `&${sites[site].random}${(sites[site].random.endsWith('%')) ? Array(7).fill(0).map(v => ArrayUtil.randInt(0, 16)).join('') : ''}`
                    // http://example.com/posts/?tags=some_example&limit=100&sf=random%AB43FF
                    // Sorry, but derpibooru has an odd and confusing api that's not similar to the others at all
                } else {
                    // We can just add `order:random` and get random results!
                    uri = `http://${site}${sites[site].api}tags=order:random+${tags.join('+')}&limit=${limit}`
                }

                fetch(uri, options)
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
                fetch(uri, options)
                    .then(result => Booru.jsonfy(result.text))
                    .then(images => resolve(ArrayUtil.shuffle(images).slice(0, limit)))
                    .catch(err => resolve(new BooruError(err.message || err.error)))
            }
        })
    }

    /**
     * For some reason, this won't return anything but `null`
     * @param {String} site
     * @param {String} md5
     */
    show(site, md5) {
        return new Promise((resolve, reject) => {
            site = Booru.resolveSite(site)

            let uri = `https://${site}${sites[site].api.replace('index', 'show')}md5=${md5}`
            let options = {
                headers: {
                    'User-Agent': 'Booru, a node package for booru searching (by AtlasTheBot)'
                }
            }

            fetch(uri, options)
                .then(result => result.json())
                .then(resolve)
                .catch(err => reject(new BooruError((err.error && err.error.message) || err.error || err)))
        })
    }
}
