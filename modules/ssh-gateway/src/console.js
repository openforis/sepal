const {defer, first, fromEvent, tap} = require('rxjs')
const readline = require('readline')

const readLine$ = () => {
    return defer(() => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        })
        return fromEvent(rl, 'line').pipe(
            first(),
            tap(() => {
                rl.close()
                rl.removeAllListeners()
            })
        )
    })
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

module.exports = {format, highlight, print, println, readLine$}
