import os
import pytest

from sys import version_info
if version_info[0] < 3:
    pass # Python 2 has built in reload
elif version_info[0] == 3 and version_info[1] <= 4:
    from imp import reload # Python 3.0 - 3.4
else:
    from importlib import reload # Python 3.5+

VALID_ENVKEY = "ekAc8p6PiPp1Di7nQu5vGomx-qXknocWWVYqyVMaxaBco12"
INVALID_ENVKEY = "ekunDrefdPeELwPpupdzJpsz-2Hs3HCiscoY1TfGinvalid"

def clear_env():
  for k in ["ENVKEY", "TEST", "TEST_2", "ENVKEY_DISABLE_AUTOLOAD"]:
    if k in os.environ:
      del os.environ[k]

os.environ["ENVKEY"] = VALID_ENVKEY
import envkey

def test_valid():
  clear_env()
  os.environ["ENVKEY"] = VALID_ENVKEY
  reload(envkey)
  assert(os.environ["TEST"] == "it")
  assert(os.environ["TEST_2"] == "works!")

def test_no_overwrite():
  clear_env()
  os.environ["TEST"] = "otherthing"
  os.environ["ENVKEY"] = VALID_ENVKEY
  reload(envkey)
  assert(os.environ["TEST"] == "otherthing")
  assert(os.environ["TEST_2"] == "works!")

def test_invalid():
  clear_env()
  os.environ["ENVKEY"] = INVALID_ENVKEY
  with pytest.raises(ValueError):
    reload(envkey)

def test_no_envkey():
  clear_env()
  with pytest.raises(ValueError):
    reload(envkey)

def test_autoload_disabled():
  clear_env()
  os.environ["ENVKEY"] = VALID_ENVKEY

  # ensure import doesn't autload when disabled via env var
  os.environ["ENVKEY_DISABLE_AUTOLOAD"] = "1"

  reload(envkey)
  assert(os.environ.get("TEST") == None)

  # test calling fetch directly
  assert(envkey.fetch_env(VALID_ENVKEY)['TEST'] == "it")
  assert(envkey.fetch_env(VALID_ENVKEY, cache_enabled=False)['TEST'] == "it")
  assert(envkey.fetch_env()['TEST'] == "it")
  assert(envkey.fetch_env(cache_enabled=False)['TEST'] == "it")

  with pytest.raises(ValueError):
    envkey.fetch_env(INVALID_ENVKEY)

  # test calling load directly
  envkey.load()
  assert(os.environ["TEST"] == "it")
  assert(os.environ["TEST_2"] == "works!")

def test_dot_env_valid():
  clear_env()
  dot_env_path = os.path.join(os.path.dirname(__file__), '.env.test.valid')
  envkey.load(dot_env_path=dot_env_path)
  assert(os.environ["TEST"] == "it")
  assert(os.environ["TEST_2"] == "works!")

def test_dot_env_invalid():
  clear_env()
  dot_env_path = os.path.join(os.path.dirname(__file__), '.env.test.invalid')
  with pytest.raises(ValueError):
      envkey.load(dot_env_path=dot_env_path)

def test_dot_env_no_file():
  clear_env()
  dot_env_path = os.path.join(os.path.dirname(__file__), '.env.test.nonexistent')
  with pytest.raises(ValueError):
      envkey.load(dot_env_path=dot_env_path)