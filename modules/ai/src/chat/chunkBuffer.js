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
        // drop=true discards any text still inside the bufferTime window so
        // that aborted streams don't leak a final partial flush downstream.
        end: ({drop = false} = {}) => {
            if (!drop) chunk$.complete()
            subscription.unsubscribe()
        }
    }
}

module.exports = {createChunkBuffer}
