import {requireOnce} from '#sepal/util'
import extensions from '#sepal/ee/extensions'

export default requireOnce('@google/earthengine', ee =>
    extensions(ee)
)
