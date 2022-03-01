require 'set'
require 'json'
require 'envkey/fetch'

module Envkey::Core

  def self.load_env
    original_env = ENV.to_h
    overwrite_envkey_vars = JSON.parse(ENV["__ENVKEY_VARS"] || "[]")

    res = Envkey::Fetch.fetch_env
    if res && res.gsub("\n","").gsub("\r", "") != "" && !res.start_with?("error:")
      envs = JSON.parse(res)
      updated_envkey_vars = []
      envs.each do |k,v|
        var = k.upcase
        if !ENV[var] || overwrite_envkey_vars.include?(var)
          updated_envkey_vars << var
          ENV[var] = v
        end
      end

      ENV["__ENVKEY_VARS"] = updated_envkey_vars.to_json

      return updated_envkey_vars
    elsif res.start_with?("error:")
      STDERR.puts "envkey-source " + res
      raise "ENVKEY invalid. Couldn't load vars."
    else
      raise "ENVKEY invalid. Couldn't load vars."
    end
  end

end

