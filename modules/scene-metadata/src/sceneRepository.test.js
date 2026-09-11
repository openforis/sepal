import {selectBest} from './sceneRepository.js'

// Greedy accumulation over already-scored rows: how many scenes to take once the database has ranked
// them. Pure, so it is tested here rather than through a query.

describe('selectBest', () => {

    test('empty input returns empty array', () => {
        expect(selectBest([], {minScenes: 1, maxScenes: 10, cloudCoverTarget: 0.1})).toEqual([])
    })

    test('stops after maxScenes regardless of cloudCover', () => {
        // cloudCover=80% → cumulative stays > cloudCoverTarget=0.1 for many scenes
        // maxScenes=2 caps at 2: after 2nd push, maxScenes(2) <= scenes.length(2) → break
        const rows = [mkRow(80), mkRow(80), mkRow(80), mkRow(80)]
        const result = selectBest(rows, {minScenes: 1, maxScenes: 2, cloudCoverTarget: 0.1})
        expect(result).toHaveLength(2)
    })

    test('includes at least minScenes even when cloudCover is 0', () => {
        // cloudCover=0 → cumulative=0 immediately; but minScenes=3 forces 3 scenes
        const rows = [mkRow(0), mkRow(0), mkRow(0), mkRow(0)]
        const result = selectBest(rows, {minScenes: 3, maxScenes: 10, cloudCoverTarget: 0.1})
        expect(result).toHaveLength(3)
    })

    test('stops as soon as cumulative <= cloudCoverTarget and >= minScenes', () => {
        // Scene 1: cloudCover=5 → cumulative=0.05 ≤ 0.1, scenes.length=1 >= minScenes=1 → stop
        const rows = [mkRow(5), mkRow(5), mkRow(5)]
        const result = selectBest(rows, {minScenes: 1, maxScenes: 10, cloudCoverTarget: 0.1})
        expect(result).toHaveLength(1)
    })

    test('continues while cumulative > cloudCoverTarget', () => {
        // Scene 1: cloudCover=50 → cumulative=0.5 > 0.1 → continue
        // Scene 2: cloudCover=50 → cumulative=0.25 > 0.1 → continue
        // Scene 3: cloudCover=50 → cumulative=0.125 > 0.1 → continue
        // Scene 4: cloudCover=50 → cumulative=0.0625 ≤ 0.1, length=4 >= 1 → stop
        const rows = [mkRow(50), mkRow(50), mkRow(50), mkRow(50), mkRow(50)]
        const result = selectBest(rows, {minScenes: 1, maxScenes: 10, cloudCoverTarget: 0.1})
        expect(result).toHaveLength(4)
    })

    test('minScenes overrides early stop (minScenes=3 forces 3 despite low cloud)', () => {
        // Scene 1: cloudCover=5 → cumulative=0.05 ≤ 0.1, but length=1 < minScenes=3 → continue
        // Scene 2: cloudCover=5 → cumulative=0.0025 ≤ 0.1, but length=2 < 3 → continue
        // Scene 3: cloudCover=5 → cumulative tiny, length=3 >= 3 → stop
        const rows = [mkRow(5), mkRow(5), mkRow(5), mkRow(5)]
        const result = selectBest(rows, {minScenes: 3, maxScenes: 10, cloudCoverTarget: 0.1})
        expect(result).toHaveLength(3)
    })

    test('maxScenes=1 returns at most 1 scene', () => {
        const rows = [mkRow(80), mkRow(80)]
        const result = selectBest(rows, {minScenes: 1, maxScenes: 1, cloudCoverTarget: 0.5})
        expect(result).toHaveLength(1)
    })

    test('returns rows with cloud_cover accessible (raw rows passed through)', () => {
        const row = {cloud_cover: 20, id: 'abc'}
        const result = selectBest([row], {minScenes: 1, maxScenes: 5, cloudCoverTarget: 0.5})
        expect(result[0]).toBe(row)
    })
    const mkRow = cloudCover => ({cloud_cover: cloudCover})
})
