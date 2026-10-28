// round2 — round half-up to 2 decimals. The EPSILON nudge is what makes 1.005 round to 1.01
// rather than 1 (its double is a hair below the midpoint).
//
// Shared because the same number is rounded on its way through several layers — the sampler's
// percentages, the usage report's weighted averages, the session report's cost — and they have to
// agree.

const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100

export {round2}
