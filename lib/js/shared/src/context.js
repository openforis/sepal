let config

module.exports = {
    configure: c => config = c,
    context: () => config
}
