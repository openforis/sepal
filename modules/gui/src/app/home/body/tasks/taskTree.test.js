import {TaskTree} from './taskTree'

const task = (id, creationTime, status = 'PENDING') =>
    ({id, name: `Task ${id}`, status, creationTime})

describe('TaskTree', () => {
    it('creates an empty tree with no tasks', () => {
        expect(TaskTree.toTasks(TaskTree.create())).toEqual([])
    })

    it('adds items from a full listing', () => {
        const tree = TaskTree.updateItem(TaskTree.create(), [], {
            't-1': task('t-1', '2026-07-01T00:00:00Z'),
            't-2': task('t-2', '2026-07-02T00:00:00Z')
        })
        expect(TaskTree.toTasks(tree).map(({id}) => id)).toEqual(['t-1', 't-2'])
    })

    it('merges updated values into existing items', () => {
        const tree = TaskTree.updateItem(TaskTree.create(), [], {
            't-1': task('t-1', '2026-07-01T00:00:00Z', 'PENDING')
        })
        const updated = TaskTree.updateItem(tree, [], {
            't-1': task('t-1', '2026-07-01T00:00:00Z', 'ACTIVE')
        })
        expect(TaskTree.toTasks(updated)[0].status).toEqual('ACTIVE')
    })

    it('prunes items missing from the listing', () => {
        const tree = TaskTree.updateItem(TaskTree.create(), [], {
            't-1': task('t-1', '2026-07-01T00:00:00Z'),
            't-2': task('t-2', '2026-07-02T00:00:00Z')
        })
        const updated = TaskTree.updateItem(tree, [], {
            't-2': task('t-2', '2026-07-02T00:00:00Z')
        })
        expect(TaskTree.toTasks(updated).map(({id}) => id)).toEqual(['t-2'])
    })

    it('does not mutate the previous tree (copy-on-write)', () => {
        const tree = TaskTree.updateItem(TaskTree.create(), [], {
            't-1': task('t-1', '2026-07-01T00:00:00Z')
        })
        TaskTree.updateItem(tree, [], {})
        expect(TaskTree.toTasks(tree).map(({id}) => id)).toEqual(['t-1'])
    })

    it('sorts tasks by creationTime', () => {
        const tree = TaskTree.updateItem(TaskTree.create(), [], {
            't-2': task('t-2', '2026-07-02T00:00:00Z'),
            't-1': task('t-1', '2026-07-01T00:00:00Z')
        })
        expect(TaskTree.toTasks(tree).map(({id}) => id)).toEqual(['t-1', 't-2'])
    })

    it('converts a string path from the wire format', () => {
        expect(TaskTree.fromStringPath('')).toEqual([])
    })
})
