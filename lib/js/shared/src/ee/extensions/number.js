module.exports = _ee => {
    // class methods

    // instance methods

    return {
        toDegrees() {
            return this.multiply(180).divide(Math.PI)
        },

        toRadians() {
            return this.multiply(Math.PI).divide(180)
        }
    }
}
