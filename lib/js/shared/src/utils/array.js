const sequence = (start, end, step) =>
    Array.apply(null, {length: Math.floor((end - start) / step) + 1})
        .map((_, i) => i * step + start)

const chunk = (array, size) =>
    sequence(0, array.length - 1, size).map(i => array.slice(i, i + size))

module.exports = {chunk, sequence}
