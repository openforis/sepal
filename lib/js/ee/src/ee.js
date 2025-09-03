const {requireOnce} = require('#sepal/util')

module.exports = requireOnce('@google/earthengine', ee =>
    require('#sepal/ee/extensions')(ee)
)
