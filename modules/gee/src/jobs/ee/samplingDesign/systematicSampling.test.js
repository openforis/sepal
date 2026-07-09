import {filterToExactStratificationMembership, materializeStratifiedExactGeometry} from '#sepal/ee/samplingDesign/systematicSampling'

// Structural smoke for the exact-location EE helpers. Their bodies build EE graphs that reach a live server to
// execute (real behaviour is covered by the slice's live-smoke), so this only asserts the module exposes them.
// We can't build+assert the graph offline: constructing any EE ApiFunction / geometry lazily fetches the
// algorithm registry, which needs auth. The null/match/mismatch membership semantics are unit-tested purely
// via isExactMembershipMatch (systematicLatticeMath.test.js). Like the sibling EE-importing suites this must
// run under `sepal npm-test gee` (the gee service container), not a raw dev-env `npx jest`.
describe('stratified exact-location helpers', () => {
    it('exports the geometry-materializer and membership-filter helpers', () => {
        expect(typeof materializeStratifiedExactGeometry).toBe('function')
        expect(typeof filterToExactStratificationMembership).toBe('function')
    })
})
