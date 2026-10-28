// A note a tab leaves for itself about who the browser was logged in as, before its login session
// changes under it (a password reset in this or another tab, a logout elsewhere). It is per tab and
// survives a reload, so each window can tell the user when it comes back as another account.

const PREVIOUS_USERNAME_KEY = 'loginSession.previousUsername'

export const notePreviousUsername = username =>
    username && window.sessionStorage.setItem(PREVIOUS_USERNAME_KEY, username)

export const forgetPreviousUsername = () =>
    window.sessionStorage.removeItem(PREVIOUS_USERNAME_KEY)

export const takePreviousUsername = () => {
    const username = window.sessionStorage.getItem(PREVIOUS_USERNAME_KEY)
    window.sessionStorage.removeItem(PREVIOUS_USERNAME_KEY)
    return username
}
