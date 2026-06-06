import extensions from '#sepal/ee/extensions'
import {requireOnce} from '#sepal/util'

export default requireOnce('@google/earthengine', ee =>
    extensions(ee)
)
