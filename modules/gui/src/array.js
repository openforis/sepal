export const sequence = (start, end, step = 1) =>
    end >= start
        ? Array.apply(null, {length: Math.floor((end - start) / step) + 1})
            .map((_, i) => i * step + start)
        : []
