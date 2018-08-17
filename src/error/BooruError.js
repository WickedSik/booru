export default class BooruError extends Error {
    name = 'BooruError'

    constructor(message) {
        super(message || 'Error message unspecified.')
    }
}
