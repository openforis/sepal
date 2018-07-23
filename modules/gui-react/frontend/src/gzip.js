import pako from 'pako'
import {from} from 'rxjs'


export const gzip$ = (content) =>
    from(new Promise((resolve, reject) => {
        try {
            return resolve(pako.deflate(JSON.stringify(content)))
        } catch (exception) {
            return reject(exception)
        }
    }))