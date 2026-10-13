import {storedUsername} from '#sepal/username'

const DATA_QUOTA = 'DATA_QUOTA'

// Users over their Data quota, from budget's level-triggered verdicts (every user hourly, users with sessions every
// minute). Held in memory: after a restart a user over the quota can write until budget's next hourly verdict.
export class QuotaState {
    #overQuota = new Set()

    onExceeded({username, reason}) {
        if (reason === DATA_QUOTA) {
            this.#overQuota.add(storedUsername(username))
        } else {
            this.#overQuota.delete(storedUsername(username))
        }
    }

    onCleared({username}) {
        this.#overQuota.delete(storedUsername(username))
    }

    mode(username) {
        return this.#overQuota.has(storedUsername(username)) ? 'read' : 'readWrite'
    }
}
