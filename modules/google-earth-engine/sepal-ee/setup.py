# -*- coding: utf-8 -*-

from os import path
from setuptools import setup, find_packages

root = path.abspath(path.dirname(__file__))

setup(
    name='sepal-ee',
    packages=find_packages(),
)