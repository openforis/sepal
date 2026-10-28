// storedUsername — the one normalization a username gets on its way INTO the database.
//
// Every `username` column is ascii_general_ci, so a lookup already matches whatever case it is
// given and needs no conversion of its own — that is the point of the collation, and wrapping a
// column in LOWER() would only suppress its index.
//
// What a collation cannot decide is which spelling gets STORED. Two rows agreeing case-insensitively
// are still two different strings to everything that reads them back as data rather than comparing
// them in SQL: an event payload, a Map key, a Redis key, a filesystem path, a log line. Normalizing
// at every INSERT keeps one spelling in the database, which is what lets every read path drop its
// own conversion.
//
// `email` deliberately has no equivalent: it is stored as the user typed it, and its own
// ascii_general_ci column is what makes the lookup and the UNIQUE index case-insensitive.

const storedUsername = username => username?.toLowerCase()

const isStoredUsername = username => username === storedUsername(username)

export {isStoredUsername, storedUsername}
