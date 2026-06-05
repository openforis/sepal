let config

const configure = c => config = c
const context = () => config

export {configure, context}
