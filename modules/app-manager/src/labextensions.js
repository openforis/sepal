const fs = require('fs')
const koaStatic = require('koa-static')
const path = require('path')

function getLabextensionsDir(appName) {
    const baseDir = '/usr/local/share/jupyter/current-kernels'

    const app_labextensions_dir = path.join(baseDir, `venv-${appName}`, 'venv/share/jupyter/labextensions')
    const voila_labextensions_dir = path.join('/usr/local/share/jupyter/voila/labextensions')

    return [app_labextensions_dir, voila_labextensions_dir]
}

const staticLabextensionsMiddleware = async (ctx, next) => {
    const {app_name} = ctx.params
    const labextensionsDirs = getLabextensionsDir(app_name)
  
    // Extract the original path requested
    const originalPath = ctx.path
    const relativePath = originalPath.split(`/labextensions/${app_name}`)[1] || '/'
  
    if (relativePath.includes('..')) {
        ctx.throw(400, 'Invalid path')
        return
    }
  
    ctx.path = relativePath
  
    let fileServed = false
  
    for (const dir of labextensionsDirs) {
        const filePath = path.join(dir, relativePath)
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const staticMiddleware = koaStatic(dir)
            await staticMiddleware(ctx, next)
            fileServed = true
            break
        }
    }
  
    if (!fileServed) {
        await next()
    }
}
  
module.exports = {staticLabextensionsMiddleware}
