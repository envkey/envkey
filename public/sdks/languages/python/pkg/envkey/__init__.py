from .loader import load
from .fetch import fetch_env
from os import environ

get = environ.get

load(is_init=True)

__all__ = ['load', 'fetch_env', 'get']
