export const taskWorkloadTag = recipe =>
    `sepal-task-${recipe.type}`
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .substring(0, 63)
