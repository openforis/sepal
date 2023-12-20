const ee = require('#sepal/ee')

const setWorkloadTag = recipe => {
    const tag = `sepal-task-${recipe.type}`
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .substring(0, 63)
    ee.data.setDefaultWorkloadTag(tag)
}

module.exports = {setWorkloadTag}
