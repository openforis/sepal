import _ from 'lodash'

export default ee => {
    // instance methods
    return {
        isEmpty() {
            return ee.isNull(this.first())
        }
    }
}
