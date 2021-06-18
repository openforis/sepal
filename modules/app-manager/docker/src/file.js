const fs = require('fs')
const {Subject} = require('rxjs')

const fileToJson$ = path => {
    const json$ = new Subject()
    fs.readFile(path, 'utf8', (error, s) => {
        if (error) {
            json$.error(error)
        } else {
            try {
                json$.next(JSON.parse(s))
                json$.complete()
            } catch (e) {
                json$.error(e)
            }
        }
    })
    return json$
}

module.exports = {fileToJson$}
