const fs = require('fs')
const koaStatic = require('koa-static')
const path = require('path')

function getLabextensionsDir(appName) {
    const baseDir = '/usr/local/share/jupyter/current-kernels'
    return path.join(baseDir, `venv-${appName}`, 'venv/share/jupyter/labextensions')
}

const staticLabextensionsMiddleware = async (ctx, next) => {

    const {app_name} = ctx.params
    const labextensionsDir = getLabextensionsDir(app_name)
    
    if (!fs.existsSync(labextensionsDir)) {
        
        ctx.throw(404, `Labextensions directory for app '${app_name}' not found`)
        return
    }
    // Extract the original path requested
    const originalPath = ctx.path
    const relativePath = originalPath.split(`/labextensions/${app_name}`)[1] || '/'
    
    if (relativePath.includes('..')) {
        ctx.throw(400, 'Invalid path')
        return
    }

    // Update the request path to the relative path for static serving
    ctx.path = relativePath

    // Serve static files from the dynamic directory
    return koaStatic(labextensionsDir)(ctx, next)
}

module.exports = {staticLabextensionsMiddleware}
