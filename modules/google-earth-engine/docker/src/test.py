from sepal.tests.test_timeseries import test_timeseries()

import logging

logging.basicConfig(level=logging.DEBUG)
for handler in logging.root.handlers:
    handler.addFilter(logging.Filter('sepal'))
test_timeseries()