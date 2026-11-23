console.info('STARTUP_DEPENDENCY_REACHED')
process.kill(process.pid, 'SIGTERM')
