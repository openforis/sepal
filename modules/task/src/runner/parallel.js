export const forEachInParallel = async (items, limit, signal, work) => {
    const child = new AbortController()
    const abortChild = () => child.abort()
    signal.addEventListener('abort', abortChild)
    if (signal.aborted) {
        abortChild()
    }
    const queue = [...items]
    let failure = null
    const worker = async () => {
        while (queue.length && !child.signal.aborted) {
            const item = queue.shift()
            try {
                await work(item, child.signal)
            } catch (error) {
                failure ??= error
                child.abort()
            }
        }
    }
    try {
        await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker))
    } finally {
        signal.removeEventListener('abort', abortChild)
    }
    if (failure) {
        throw failure
    }
}
