import logging

from sepal.cloudstorage.download import CloudStorageDownload

logging.basicConfig(level=logging.DEBUG)
for handler in logging.root.handlers:
    handler.addFilter(logging.Filter('sepal'))

task = CloudStorageDownload(
    environment='dev-daniel',
    source_path='wiell/small_timeseries_c7905cb0-da77-4d1d-94ab-e27836667406',
    destination_path='/Users/wiell/Downloads/test',
    matching=True,
    move=False
)

task.submit().get()
