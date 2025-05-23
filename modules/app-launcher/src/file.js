const {readFile} = require('fs/promises')
const {from, throwError, catchError, map} = require('rxjs')

const fileToJson$ = path => {
    return from(readFile(path, 'utf8')).pipe(
        map(content => JSON.parse(content)),
        catchError(error => {
            if (error.code === 'ENOENT') {
                return throwError(() => new Error(`File not found: ${path}`))
            } return throwError(() => new Error(`Error reading file ${path}: ${error.message}`))
        })
    )
}
module.exports = {fileToJson$}
