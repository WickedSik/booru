export default class ArrayUtil {
    // Thanks mdn and damnit derpibooru
    static randInt(min, max) {
        min = Math.ceil(min)
        max = Math.floor(max)
        return Math.floor(Math.random() * (max - min + 1)) + min
    }

    /**
     * Yay fisher-bates
     * Taken from http://stackoverflow.com/a/2450976
     * @private
     * @param  {Array} array Array of something
     * @return {Array}       Shuffled array of something
     */
    static shuffle(array) {
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
}
