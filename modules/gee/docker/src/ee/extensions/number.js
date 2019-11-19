// class methods

// instance methods

module.exports = {
    toDegrees() {
        return this.multiply(180).divide(Math.PI)
    },

    toRadians() {
        return this.multiply(Math.PI).divide(180)
    }
}
