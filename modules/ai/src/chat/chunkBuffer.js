const {Subject, bufferTime, filter} = require('rxjs')

const CHUNK_BUFFER_MS = 100

const createChunkBuffer = onFlush => {
    const chunk$ = new Subject()
    const subscription = chunk$.pipe(
        bufferTime(CHUNK_BUFFER_MS),
        filter(chunks => chunks.length > 0)
    ).subscribe(chunks => onFlush(chunks.join('')))

    return {
        append: text => chunk$.next(text),
        end: () => {
            chunk$.complete()
            subscription.unsubscribe()
        }
    }
}

module.exports = {createChunkBuffer}
