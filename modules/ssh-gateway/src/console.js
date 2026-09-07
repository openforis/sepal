import readline from 'readline'
import {defer, first, fromEvent} from 'rxjs'

// One persistent readline interface for the whole process. Each prompt subscribes to its
// 'line' events (fromEvent adds the listener on subscribe, removes it on unsubscribe —
// so a prompt losing the race to a session event releases cleanly). The interface itself
// is NEVER closed between prompts: readline's close() pauses the SHARED process.stdin,
// which mutes any interface created before the close — sequential prompts (menu → y/N
// confirmation) would hang forever waiting for input that no longer flows.
// closeConsole() releases stdin at the end of the session so the process can exit.
let sharedReadline = null

const getReadline = () => {
    if (!sharedReadline) {
        sharedReadline = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            // On a real connection (pty) readline runs in terminal mode and owns echo and
            // the pending line buffer — that's what lets prompt() re-display half-typed
            // input after a screen refresh. In canonical (kernel) mode the pending input
            // lives in the tty driver where it can't be re-echoed. Piped stdin (tests,
            // scripted ssh) falls back to the old non-terminal behavior.
            terminal: Boolean(process.stdin.isTTY),
            historySize: 0
        })
        // Terminal-mode readline swallows ctrl+C unless handled — keep it ending the
        // connection, as it does in canonical mode.
        sharedReadline.on('SIGINT', () => process.exit(130))
    }
    return sharedReadline
}

const readLine$ = () =>
    defer(() => fromEvent(getReadline(), 'line').pipe(first()))

// prompt — render a prompt through readline instead of a bare write: prompt(true)
// re-displays the prompt AND whatever the user has already typed, so an event-driven
// screen refresh doesn't leave the pending input invisible (it stayed in the buffer,
// but a plain print() after CLEAR_SCREEN never re-echoed it).
const prompt = text => {
    const rl = getReadline()
    rl.setPrompt(text)
    rl.prompt(true)
}

const closeConsole = () => {
    if (sharedReadline) {
        sharedReadline.close()
        sharedReadline = null
    }
}

const print = (...strings) =>
    process.stdout.write(strings.join(' '), 'utf-8')

const println = (...strings) => {
    print(...strings)
    print('\n')
}

const STYLE_CODES = {
    RESET: 0,
    BOLD: 1,
    FAINT: 2,
    ITALIC: 3,
    UNDERLINE: 4,
    REVERSE: 7,
    CROSSED_OUT: 9,

    BLACK: 30,
    RED: 31,
    GREEN: 32,
    YELLOW: 33,
    BLUE: 34,
    PURPLE: 35,
    CYAN: 36,
    WHITE: 37,

    BLACK_BACKGROUND: 40,
    RED_BACKGROUND: 41,
    GREEN_BACKGROUND: 42,
    YELLOW_BACKGROUND: 43,
    BLUE_BACKGROUND: 44,
    PURPLE_BACKGROUND: 45,
    CYAN_BACKGROUND: 46,
    WHITE_BACKGROUND: 47,

    BLACK_INTENSE: 90,
    RED_INTENSE: 91,
    GREEN_INTENSE: 92,
    YELLOW_INTENSE: 93,
    BLUE_INTENSE: 94,
    PURPLE_INTENSE: 95,
    CYAN_INTENSE: 96,
    WHITE_INTENSE: 97,

    BLACK_BACKGROUND_INTENSE: 100,
    RED_BACKGROUND_INTENSE: 101,
    GREEN_BACKGROUND_INTENSE: 102,
    YELLOW_BACKGROUND_INTENSE: 103,
    BLUE_BACKGROUND_INTENSE: 104,
    PURPLE_BACKGROUND_INTENSE: 105,
    CYAN_BACKGROUND_INTENSE: 106,
    WHITE_BACKGROUND_INTENSE: 107
}

const format = (string, ...styles) =>
    `${styles.map(style => `\u001B[${STYLE_CODES[style]}m`).join('')}${string}\u001b[0m`

const highlight = (text, style = 'YELLOW_INTENSE') =>
    format(text, style)

// setTitle — OSC 0, the terminal's window title. The GUI's xterm turns it into the tab's name
// (app/home/body/terminal), so this is how a session's identity gets out of the ssh session and
// into the surrounding UI. An empty title puts the tab back to its default name.
// Interactive sessions only: in non-interactive mode stdout carries the user's command output.
const setTitle = title =>
    print(`\u001B]0;${title}\u0007`)

export {closeConsole, format, highlight, print, println, prompt, readLine$, setTitle}
