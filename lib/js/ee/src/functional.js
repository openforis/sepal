const compose = (initialValue, ...operations) =>
    operations
        .filter(operation => typeof operation === 'function')
        .reduce(
            (acc, operation) => operation(acc),
            initialValue
        )

module.exports = {compose}
