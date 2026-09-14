// The gateway reads an api key as HTTP Basic with an empty username and the key as the password; a
// non-empty username selects ordinary password authentication instead.
export const sessionAuth = apiKey => ({
    username: '',
    password: apiKey
})
