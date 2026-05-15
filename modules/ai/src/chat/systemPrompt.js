const fs = require('fs')
const path = require('path')

function defaultSystemPrompt() {
    return fs.readFileSync(path.join(__dirname, 'system-prompt.md'), 'utf8')
}

module.exports = {defaultSystemPrompt}
