require "envkey/version"
require "envkey/core"

Envkey::Core.load_env

begin
  require "envkey/rails"
rescue LoadError
end



