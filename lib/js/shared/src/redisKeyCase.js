// planKeyNormalization — decide what to do with Redis keys that name a user in more than one case.
//
// Keys of the form `<prefix>:<username>` predate `storedUsername` (see ./username.js), so the same
// person can own several: one per spelling the database happened to hold when each was written.
// Only the stored spelling is ever looked up again, which makes the others unreachable state that
// nothing reaps — a duplicate storage size, a session flag that contradicts the live one, a cached
// user holding tokens years out of date.
//
// The planning is separated from the executing because the decision is the part worth testing: the
// modules differ only in `orphans`, and each drives its own client with its own scan and delete.
//
// `separator` is the character between the prefix and the name: ':' for a plain key, '-' for a
// BullMQ job id, whose `job-<username>-<action>` shape normalizes the same way because the action is
// lowercase already.
//
// `orphans` says what to do with a key whose stored spelling is absent, which is the only case where
// the two are not interchangeable. 'rename' keeps the state under the name that will be looked up;
// 'remove' is for a store whose reads are already normalized, where such a key is simply unreachable
// and a rename would resurrect a value no one asked for.
//
// Several spellings can collide onto one stored name with none of them being it. Exactly one can be
// renamed, so the rest are removed; which one survives is arbitrary but must be deterministic, so
// keys are sorted and the last one wins.

import {storedUsername} from './username.js'

const planKeyNormalization = (keys, {prefix, orphans = 'rename', separator = ':'}) => {
    const remove = []
    const rename = []
    const stored = new Set()
    const collisions = new Map()

    const start = `${prefix}${separator}`
    const named = [...keys].sort().filter(key => key.startsWith(start) && key.length > start.length)

    named.forEach(key => {
        const target = `${start}${storedUsername(key.slice(start.length))}`
        if (key === target) {
            stored.add(target)
        } else {
            collisions.set(target, [...(collisions.get(target) ?? []), key])
        }
    })

    collisions.forEach((keys, target) => {
        const survivor = orphans === 'rename' && !stored.has(target)
            ? keys.at(-1)
            : null
        if (survivor) {
            rename.push({from: survivor, to: target})
        }
        remove.push(...keys.filter(key => key !== survivor))
    })

    return {remove: remove.sort(), rename}
}

// applyKeyNormalization — carry out a plan against a client the caller drives.
//
// A rename is conditional (RENAMENX, or ioredis `renamenx`): the plan is computed from a scan, and
// a module writing under the stored spelling between that scan and this call would otherwise have
// its fresh value clobbered by the stale one. `renameKey` reports whether the rename happened, and a
// refusal means the state we were preserving now exists in a newer form, leaving nothing to keep.
//
// Removals are batched because a store can hold thousands of them and a single DEL of that many keys
// blocks the server for the duration.

const applyKeyNormalization = async (keys, {prefix, orphans, separator, renameKey, removeKeys, batchSize = 500}) => {
    const {remove, rename} = planKeyNormalization(keys, {prefix, orphans, separator})

    if (rename.length && !renameKey) {
        throw new Error(`Cannot normalize ${prefix} keys without a renameKey function`)
    }

    let renamed = 0
    for (const {from, to} of rename) {
        await renameKey(from, to)
            ? renamed++
            : remove.push(from)
    }

    for (let index = 0; index < remove.length; index += batchSize) {
        await removeKeys(remove.slice(index, index + batchSize))
    }

    return {removed: remove.length, renamed}
}

export {applyKeyNormalization, planKeyNormalization}
