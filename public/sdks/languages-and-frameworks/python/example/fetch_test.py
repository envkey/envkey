import os
print("EK Should cache? " + os.environ.get("ENVKEY_SHOULD_CACHE"))
import envkey
secrets = envkey.fetch_env(cache_enabled=True)
print("..Done!")