// Task-layer error types. The routes map these to HTTP status codes
// (Unauthorized → 403, InvalidCommand → 400).

class Unauthorized extends Error {
    constructor(message) {
        super(message)
        this.name = 'Unauthorized'
    }
}

class InvalidCommand extends Error {
    constructor(message) {
        super(message)
        this.name = 'InvalidCommand'
    }
}

export {InvalidCommand, Unauthorized}
