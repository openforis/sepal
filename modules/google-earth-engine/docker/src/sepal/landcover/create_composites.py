import time

from ..task.task import ThreadTask


def create(spec, context):
    print('create_composites, create: ', spec, context)
    return CreateComposites()


class CreateComposites(ThreadTask):
    def __init__(self):
        super(CreateComposites, self).__init__('create_composites')

    def run(self):
        time.sleep(1)
        # TODO: Asset directory path as input?
        # Create a composite per year
        # Export as asset
        # {2015: /foo/bar/baz}
        self.resolve()

    # def status(self):
    #     print('CreateComposites: status')
    #     return super.status()

    def status_message(self):
        print('CreateComposites: status_message')
        return 'Some status message'

    def close(self):
        print('CreateComposites: close')
        pass

    def __str__(self):
        return '{0}()'.format(
            type(self).__name__
        )
