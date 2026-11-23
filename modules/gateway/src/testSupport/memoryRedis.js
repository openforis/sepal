// An in-process stand-in for the Redis commands the user store issues. Its compare-and-set is reimplemented, so it
// shows nothing about atomicity: userStore.integration.test.js runs the store against a real Redis for that when
// GATEWAY_TEST_REDIS_URL names one.
export class MemoryRedis {
    values = new Map()

    async get(key) {
        return this.values.get(key) ?? null
    }

    async set(key, value, options = {}) {
        if (options.NX && this.values.has(key)) {
            return null
        }
        this.values.set(key, value)
        return 'OK'
    }

    async del(key) {
        return this.values.delete(key) ? 1 : 0
    }

    // The user store's only script: replace the value if it is still the expected one.
    async eval(_script, {keys: [key], arguments: [expected, replacement]}) {
        if (this.values.get(key) !== expected) {
            return 0
        }
        this.values.set(key, replacement)
        return 1
    }
}
