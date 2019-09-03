import json


class Progress(object):
    def __init__(self, default_message, message_key, **message_args) -> None:
        super().__init__()
        self.__dict__.update(message_args)
        self.default_message = default_message
        self.message_key = message_key
        self.message_args = message_args

    def to_json(self):
        return json.dumps({
            'default_message': self.default_message,
            'message_key': self.message_key,
            'message_args': self.message_args
        })

    def __str__(self) -> str:
        return self.default_message.format(**self.message_args)
