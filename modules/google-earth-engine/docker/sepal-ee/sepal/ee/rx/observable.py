import ee
from sepal.rx.workqueue import WorkQueue

# A single group is used to execute EE operations, independent of user and credentials used.
_ee_operations = WorkQueue(
    concurrency_per_group=20,
    description='ee_operations'
)


def ee_observable(action, retries=3, description=None, credentials=None):
    if not credentials:
        credentials = ee.Credentials()

        if not credentials:
            raise Exception(
                'Failed to create ee_observable {}: '
                'No credentials is provided and ee.InitializeThread() has not been called for current thread.'.format(
                    description
                )
            )

    def execute():
        ee.InitializeThread(credentials)
        return action()

    return _ee_operations.enqueue(
        callable=execute,
        retries=retries,
        group='ee',
        description=description
    )
