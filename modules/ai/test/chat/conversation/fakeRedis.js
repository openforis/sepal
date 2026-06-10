function aFakeRedis() {
    const hashes = new Map()
    const lists = new Map()
    const expirations = []
    const deletedKeys = []

    return {
        hset(key, field, value) {
            if (!hashes.has(key)) hashes.set(key, new Map())
            const hash = hashes.get(key)
            const isNew = !hash.has(field)
            hash.set(field, value)
            return Promise.resolve(isNew ? 1 : 0)
        },
        hget(key, field) {
            return Promise.resolve(hashes.get(key)?.get(field) ?? null)
        },
        hvals(key) {
            return Promise.resolve([...hashes.get(key)?.values() ?? []])
        },
        hdel(key, field) {
            const removed = hashes.get(key)?.delete(field) ? 1 : 0
            return Promise.resolve(removed)
        },
        rpush(key, value) {
            if (!lists.has(key)) lists.set(key, [])
            const list = lists.get(key)
            list.push(value)
            return Promise.resolve(list.length)
        },
        lrange(key, start, stop) {
            const list = lists.get(key) ?? []
            const end = stop < 0 ? list.length : stop + 1
            return Promise.resolve(list.slice(start, end))
        },
        del(key) {
            deletedKeys.push(key)
            const removed = (hashes.delete(key) ? 1 : 0) + (lists.delete(key) ? 1 : 0)
            return Promise.resolve(removed)
        },
        expire(key, seconds) {
            expirations.push({key, seconds})
            return Promise.resolve(1)
        },
        hashes,
        lists,
        expirations,
        deletedKeys
    }
}

export {aFakeRedis}
