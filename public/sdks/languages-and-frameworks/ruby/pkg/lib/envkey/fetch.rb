require 'envkey/platform'

module Envkey::Fetch

  def self.fetch_env
    fetch_env_path = Envkey::Platform.fetch_env_path
    `#{fetch_env_path} --json#{should_cache ? ' --cache' : ''} --client-name envkey-ruby --client-version #{Envkey::VERSION} 2>&1`
  end

  def self.should_cache
    is_dev || ENV["ENVKEY_SHOULD_CACHE"]
  end

  def self.is_dev
    dev_vals = %w(development test)
    dev_vals.include?(ENV["RAILS_ENV"]) ||
      dev_vals.include?(ENV["RACK_ENV"]) ||
      (ENV["RAILS_ENV"].nil? && ENV["RACK_ENV"].nil?)
  end

end