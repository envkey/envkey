require "envkey/core"
require "rails"

module Envkey
  class Railtie < Rails::Railtie
    config.before_configuration do
      begin
        require "spring/commands"
        Spring.after_fork do
          Envkey::Core.load_env
        end
      rescue LoadError
      end
    end
  end
end