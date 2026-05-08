export const respondError = ({log, respond, fallback, error}) => {
    log.error(fallback, error)
    respond({success: false, error: error.message || fallback})
}
