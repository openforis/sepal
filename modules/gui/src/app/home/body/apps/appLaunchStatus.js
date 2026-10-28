// The phases an app tab goes through before its iframe is showing, in order. Sandbox apps pass
// through all three; docker and external apps have no session or server of their own and go
// straight to STARTING_APP.
export const STARTING_SESSION = 'STARTING_SESSION'
export const STARTING_SERVER = 'STARTING_SERVER'
export const STARTING_APP = 'STARTING_APP'
export const READY = 'READY'
export const FAILED = 'FAILED'

const MESSAGE_KEY = {
    [STARTING_SESSION]: 'apps.launch.startingSession',
    [STARTING_SERVER]: 'apps.launch.startingServer',
    [STARTING_APP]: 'apps.launch.startingApp',
    [FAILED]: 'apps.run.error'
}

export const launchStatusMessageKey = appState =>
    MESSAGE_KEY[appState]
