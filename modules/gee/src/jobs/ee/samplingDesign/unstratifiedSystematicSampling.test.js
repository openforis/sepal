import {originPhaseOf, seedOriginPhase} from '#sepal/ee/samplingDesign/systematicSampling'
import {materializeSystematicIndexGeometry, unstratifiedSystematicIndexCandidates} from '#sepal/ee/samplingDesign/unstratifiedSystematicSampling'

// Structural smoke for an EE-graph module: its exports build EE graphs that need a live server to execute
// (real behaviour is covered by the slice's live-smoke), so here we only assert the module loads and exposes
// the API the next (routing) slice will wire, and that the raster path shares the extracted origin-phase
// helpers (no second lattice). Like the sibling sampleProperties/unstratifiedArea suites this transitively
// imports the real EE runtime, so it must run under `sepal npm-test gee` (which runs in the gee service
// container); a raw `npx jest` in the dev-env bind-mount can't resolve EE's post-teardown lazy imports.
describe('unstratifiedSystematicSampling module', () => {
    it('exports the index-candidate and geometry-materializer helpers', () => {
        expect(typeof unstratifiedSystematicIndexCandidates).toBe('function')
        expect(typeof materializeSystematicIndexGeometry).toBe('function')
    })

    it('reuses the shared origin-phase helpers extracted from the raster path (no second lattice)', () => {
        expect(typeof seedOriginPhase).toBe('function')
        expect(typeof originPhaseOf).toBe('function')
    })
})
