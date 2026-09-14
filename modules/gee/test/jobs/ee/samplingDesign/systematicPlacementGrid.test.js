import {systematicStratumMaxOffset} from '#sepal/ee/samplingDesign/samples'
import {MAX_DENSITY_OFFSETS} from '#sepal/ee/samplingDesign/systematicLatticeMath'

// Lattice spacing comes from the Stratification pixel size through the minimum-distance floor, while placement
// happens in the Arrangement CRS. The density offset therefore tracks the Stratification pixel size and must
// not change when only the Arrangement CRS differs.
//
// Expected offsets are derived independently from the documented formulas, not recorded from a run:
//   diameter = 0.5 * sqrt(8 * area / (3 * sqrt(3) * sampleSize)) * 0.75
//   minExponent = ceil(log2(max(minDistance, 2 * scale) / sqrt(3)))
//   offset = clamp(floor(log2(diameter)) - minExponent, 0, 24)
// A relative assertion alone would pass an off-by-one in the exponent arithmetic, so each case pins a value.
describe('systematicStratumMaxOffset reads the Stratification grid', () => {
    const stratum = {area: 1e10, sampleSize: 10}
    const arrangement = ({scale, minDistance = 60, arrangementCrs = 'EPSG:6933'}) => ({
        minDistance,
        stratificationGrid: {crs: 'EPSG:32636', scale},
        arrangementGrid: {crs: arrangementCrs}
    })

    // diameter 14714.15 -> floor(log2) = 13; minExponent(60, 2*10) = 6; 13 - 6 = 7.
    it('derives the offset from the Stratification pixel size', () => {
        expect(systematicStratumMaxOffset(stratum, arrangement({scale: 10}))).toBe(7)
    })

    // Same diameter, but 2*scale = 2000 raises the floor: minExponent = 11; 13 - 11 = 2.
    it('raises the spacing floor with the Stratification pixel size, lowering the offset', () => {
        expect(systematicStratumMaxOffset(stratum, arrangement({scale: 1000}))).toBe(2)
    })

    // minDistance 5000 exceeds 2*scale, so it sets the floor: minExponent = 12; 13 - 12 = 1.
    it('lets an explicit minimum distance above the floor set the exponent', () => {
        expect(systematicStratumMaxOffset(stratum, arrangement({scale: 10, minDistance: 5000}))).toBe(1)
    })

    // diameter 46.53 -> floor(log2) = 5; minExponent = 6; negative, so clamped to 0.
    it('clamps to zero when the base grid is already at the spacing floor', () => {
        expect(systematicStratumMaxOffset({area: 1e6, sampleSize: 100}, arrangement({scale: 30}))).toBe(0)
    })

    // diameter 3.2902e8 -> floor(log2) = 28; minExponent(unset, 2*1) = 1; raw 27, capped at MAX_DENSITY_OFFSETS.
    it('clamps to the densification ceiling when the raw offset exceeds it', () => {
        expect(systematicStratumMaxOffset(
            {area: 1e18, sampleSize: 2},
            {stratificationGrid: {crs: 'EPSG:32636', scale: 1}, arrangementGrid: {crs: 'EPSG:6933'}}
        )).toBe(MAX_DENSITY_OFFSETS)
    })

    it('ignores the Arrangement CRS', () => {
        expect(systematicStratumMaxOffset(stratum, arrangement({scale: 10, arrangementCrs: 'EPSG:6931'})))
            .toBe(systematicStratumMaxOffset(stratum, arrangement({scale: 10, arrangementCrs: 'EPSG:6933'})))
    })

    // Guards the NaN collapse: reading a pixel size off the wrong grid makes every offset 0, which no
    // relative assertion between two such calls can detect.
    it('returns a non-zero offset for a grid that warrants densification', () => {
        expect(systematicStratumMaxOffset(stratum, arrangement({scale: 10}))).toBeGreaterThan(0)
    })
})
