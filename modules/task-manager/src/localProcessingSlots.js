const ABANDONED_AFTER_MS = 30 * 1000

// The line is kept in memory only: after a restart, containers still waiting take their place again on their next
// poll. A free slot is reserved for the waiter in turn, so asking more often does not jump the line.
export class LocalProcessingSlots {
    #waiters = new Map()

    request({task, free, heldByUser, now}) {
        const waiter = this.#waiters.get(task.id)
        this.#waiters.set(task.id, {id: task.id, username: task.username, since: waiter?.since ?? now, seen: now})
        this.#dropAbandoned(now)
        if (this.#inTurn(free, heldByUser).includes(task.id)) {
            this.#waiters.delete(task.id)
            return true
        }
        return false
    }

    isWaiting(taskId) {
        return this.#waiters.has(taskId)
    }

    remove(taskId) {
        this.#waiters.delete(taskId)
    }

    #dropAbandoned(now) {
        for (const [id, {seen}] of this.#waiters) {
            if (now - seen > ABANDONED_AFTER_MS) {
                this.#waiters.delete(id)
            }
        }
    }

    #inTurn(free, heldByUser) {
        const held = ({username}) => heldByUser.get(username) ?? 0
        return [...this.#waiters.values()]
            .sort((a, b) => held(a) - held(b) || a.since - b.since)
            .slice(0, Math.max(0, free))
            .map(({id}) => id)
    }
}
