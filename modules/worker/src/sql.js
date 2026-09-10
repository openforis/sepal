// placeholders(3) → '?, ?, ?' — the parameter list for an IN clause whose width is only known at
// call time. Kept out of db.js so a repository can pick it up without its unit tests having to
// mock it alongside the pool.

const placeholders = count => Array(count).fill('?').join(', ')

export {placeholders}
