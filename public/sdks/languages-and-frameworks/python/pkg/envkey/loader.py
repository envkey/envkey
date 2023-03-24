import os
import sys
import json
from .fetch import fetch_env

def load(is_init=False, cache_enabled=None, dot_env_path=None):
  if is_init and os.environ.get("ENVKEY_DISABLE_AUTOLOAD"):
    return dict()

  fetch_res = fetch_env(cache_enabled=cache_enabled, dot_env_path=dot_env_path)

  vars_set = dict()

  for k in fetch_res:
    if os.environ.get(k) == None:
      if k is not None and fetch_res[k] is not None:
        val = to_env(fetch_res[k])
        os.environ[to_env(k)] = val
        vars_set[to_env(k)] = val

  return vars_set

def to_env(s):
  if sys.version_info[0] == 2:
      return s.encode(sys.getfilesystemencoding() or "utf-8")
  else:
      return s