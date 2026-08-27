// The automatic allocation strategies, and what each of them reads.
//
// One table, because four places need to agree about it: the resolver that decides whether a saved strategy
// can still run, the planner that decides which upstream change invalidates counts, the allocator that
// executes it, and the panel that offers it. Splitting that knowledge is how a strategy ends up selectable
// but not executable, or recalculated for a change it never reads.
//
// `weights` and `proportions` are what the count arithmetic reads - not what the derived uncertainty reads,
// which always reads both. Pure: labels, order and tooltips are presentation and stay with the panel.
const STRATEGIES = {
    EQUAL: {weights: false, proportions: false},
    PROPORTIONAL: {weights: true, proportions: false},
    BALANCED: {weights: true, proportions: false},
    OPTIMAL: {weights: true, proportions: true},
    POWER: {weights: true, proportions: true}
}

export const ALLOCATION_STRATEGIES = Object.keys(STRATEGIES)

export const isAllocationStrategy = strategy =>
    Object.prototype.hasOwnProperty.call(STRATEGIES, strategy)

// A strategy that reads no proportions can run in a design that has none.
export const readsProportions = strategy =>
    !!STRATEGIES[isAllocationStrategy(strategy) ? strategy : null]?.proportions

export const readsWeights = strategy =>
    !!STRATEGIES[isAllocationStrategy(strategy) ? strategy : null]?.weights
