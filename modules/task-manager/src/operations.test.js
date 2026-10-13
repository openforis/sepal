import {isLocalWork} from './operations.js'

test('image exports to Data run on the main host, like those to the workspace', () => {
    expect(isLocalWork('image.DATA')).toBe(true)
    expect(isLocalWork('image.GEE')).toBe(false)
})
