class SepalException(Exception):
    def __init__(self, code, message, data={}):
        super(SepalException, self).__init__(message)
        self.code = code
        self.data = data