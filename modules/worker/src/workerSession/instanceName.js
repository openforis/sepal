// instanceName — the two-word name a user knows an instance by, DERIVED from its session id.
//
// Nothing is stored. The name is a pure function of the id, which is already generated once per
// session and carried on every surface that needs to name the machine, so the GUI list, the expiry
// notification, the email, its management page and the SSH menu all arrive at the same name
// without a column, a migration, or a value passed between them. It survives a close (the id
// does), survives a restart, and applies retroactively to sessions that already exist.
//
// It replaces the 1-based ordinal as the thing a user READS. The ordinal remains what they TYPE in
// the SSH menu — a name is a poor thing to retype over a flaky link — and so both travel together.
//
// Uniqueness is best-effort by construction: a pure function has no freedom to retry on a clash.
// The space is |ADJECTIVES| x |NOUNS| (see the test that pins both lists duplicate-free), which
// puts a collision between one user's handful of open instances far below the rate at which the
// ordinal already renumbers under them.
//
// CHANGING THESE LISTS RENAMES EVERY LIVE INSTANCE, including any named in an email already sent.
// Sessions live hours, so the blast radius is whatever is running at deploy time — but reorder or
// prune only deliberately. Appending is safe for existing names only if nothing before it moves.

import crypto from 'crypto'

const ADJECTIVES = [
    'amber', 'ancient', 'azure', 'balmy', 'blissful', 'bold', 'brave', 'breezy', 'bright', 'brisk',
    'bubbly', 'buoyant', 'calm', 'candid', 'cheerful', 'cheery', 'chipper', 'chirpy', 'classy',
    'clever', 'cobalt', 'cosmic', 'cozy', 'crafty', 'crimson', 'crisp', 'curious', 'dandy',
    'dapper', 'daring', 'dazzling', 'deft', 'dreamy', 'dusty', 'eager', 'earnest', 'easy',
    'electric', 'elegant', 'emerald', 'fabled', 'fancy', 'fearless', 'feisty', 'fleet', 'fluffy',
    'fond', 'frosty', 'fuzzy', 'gallant', 'gentle', 'giddy', 'gilded', 'glad', 'gleeful', 'glowing',
    'golden', 'graceful', 'grand', 'groovy', 'hardy', 'hazy', 'hearty', 'heroic', 'honest',
    'hopeful', 'humble', 'ivory', 'jade', 'jaunty', 'jazzy', 'jolly', 'joyful', 'keen', 'kind',
    'lively', 'lofty', 'lucid', 'lucky', 'lunar', 'lush', 'magnetic', 'marble', 'mellow', 'merry',
    'mighty', 'misty', 'modest', 'mystic', 'neat', 'nifty', 'nimble', 'noble', 'olive', 'peachy',
    'pearly', 'peppy', 'perky', 'placid', 'plucky', 'polar', 'prime', 'proud', 'quick', 'quiet',
    'quirky', 'radiant', 'rapid', 'rosy', 'ruby', 'rugged', 'rustic', 'sage', 'sandy', 'sassy',
    'savvy', 'scarlet', 'serene', 'sharp', 'shiny', 'silent', 'silky', 'silver', 'sleek', 'snappy',
    'snowy', 'snug', 'solar', 'sparkling', 'spicy', 'spirited', 'sprightly', 'spry', 'steady',
    'stellar', 'sturdy', 'sunlit', 'sunny', 'sweet', 'swift', 'tangy', 'teal', 'tender', 'tidy',
    'topaz', 'tranquil', 'trusty', 'upbeat', 'valiant', 'velvet', 'vivid', 'warm', 'wily', 'windy',
    'winsome', 'witty', 'zany', 'zesty'
]

const NOUNS = [
    'acorn', 'albatross', 'almond', 'anchor', 'antler', 'apple', 'apricot', 'arrow', 'aspen',
    'badger', 'bamboo', 'banana', 'beacon', 'beetle', 'bison', 'blossom', 'boulder', 'breeze',
    'bridge', 'bugle', 'cactus', 'canyon', 'caravan', 'cardinal', 'cedar', 'chestnut', 'cinder',
    'citron', 'clover', 'comet', 'compass', 'coral', 'cricket', 'crocus', 'crystal', 'cypress',
    'daisy', 'dolphin', 'dragon', 'dune', 'eagle', 'ember', 'falcon', 'fennel', 'fern', 'ferret',
    'finch', 'firefly', 'fjord', 'flamingo', 'fossil', 'fountain', 'foxglove', 'galaxy', 'garnet',
    'gazelle', 'geyser', 'ginger', 'glacier', 'gopher', 'granite', 'grotto', 'guava', 'harbor',
    'hazel', 'heron', 'hickory', 'honey', 'hornet', 'iris', 'ivy', 'jaguar', 'juniper', 'kayak',
    'kelp', 'kestrel', 'kiwi', 'koala', 'lagoon', 'lantern', 'larch', 'lark', 'lemon', 'lentil',
    'lighthouse', 'lily', 'lobster', 'lotus', 'lynx', 'magnolia', 'mango', 'maple', 'marmot',
    'meadow', 'melon', 'meteor', 'mimosa', 'mint', 'moose', 'moss', 'nebula', 'nectar', 'nutmeg',
    'oak', 'oasis', 'ocelot', 'onyx', 'opal', 'orchid', 'osprey', 'otter', 'owl', 'palm', 'panda',
    'pangolin', 'papaya', 'parsnip', 'peach', 'pear', 'pebble', 'pelican', 'penguin', 'pepper',
    'petal', 'pigeon', 'pine', 'plum', 'pond', 'poppy', 'prairie', 'puffin', 'quail', 'quartz',
    'quince', 'rabbit', 'raccoon', 'radish', 'raven', 'reef', 'ridge', 'river', 'robin', 'rowan',
    'saffron', 'salmon', 'sapphire', 'sequoia', 'shale', 'shrimp', 'sparrow', 'spruce', 'starling',
    'summit', 'sunflower', 'swallow', 'tamarind', 'thistle', 'thrush', 'tiger', 'tulip', 'turtle',
    'valley', 'vulture', 'walnut', 'walrus', 'willow', 'wombat', 'yarrow', 'zebra', 'zinnia'
]

// Two independent 32-bit reads off one sha256, so the adjective and the noun do not co-vary.
// sha256 rather than a cheap string hash because the mapping has to stay identical across Node
// versions and across every module that might ever compute it.
const instanceName = sessionId => {
    if (!sessionId || typeof sessionId !== 'string') {
        return null
    }
    const digest = crypto.createHash('sha256').update(sessionId).digest()
    const adjective = ADJECTIVES[digest.readUInt32BE(0) % ADJECTIVES.length]
    const noun = NOUNS[digest.readUInt32BE(4) % NOUNS.length]
    return `${adjective}-${noun}`
}

export {ADJECTIVES, instanceName, NOUNS}
