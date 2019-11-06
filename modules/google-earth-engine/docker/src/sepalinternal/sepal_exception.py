class SepalException(Exception):
    def __init__(self, code, message, data={}, cause=None):
        super(SepalException, self).__init__(message)
        self.code = code
        self.data = data
        self.cause = cause
