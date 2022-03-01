from .loader import load
from .fetch import fetch_env
from os import environ

get = environ.get

load(is_init=True, cache_enabled=("ENVKEY_SHOULD_CACHE" in environ))

__all__ = ['load', 'fetch_env', 'get']
