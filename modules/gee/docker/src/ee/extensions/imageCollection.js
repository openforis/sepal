// const ee = require('@google/earthengine')

// class methods

// instance methods

module.exports = {
    compose(...operations) {
        return operations
            .reduce(
                (collection, operation) =>
                    typeof operation === 'function'
                        ? operation(collection)
                        : collection,
                this
            )
    },
}
