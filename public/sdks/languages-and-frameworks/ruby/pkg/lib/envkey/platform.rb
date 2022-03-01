module Envkey::Platform
  # Normalize the platform OS
  OS = case os = RbConfig::CONFIG['host_os'].downcase
  when /linux/
    "linux"
  when /darwin/
    "darwin"
  when /bsd/
    "freebsd"
  when /mingw|mswin/
    "windows"
  else
    "linux"
  end

  # Normalize the platform CPU
  ARCH = case cpu = RbConfig::CONFIG['host_cpu'].downcase
  when /amd64|x86_64/
    "x86_64"
  when /i?86|x86|i86pc/
    "x86"
  when /ppc|powerpc/
    "powerpc"
  when /^arm|^aarch/
    "arm"
  else
    cpu
  end

  def self.platform_part
    case OS
      when "darwin", "linux", "windows", "freebsd"
        OS
      else
        "linux"
      end
  end

  def self.arch_part
    if (platform_part == "darwin" || platform_part == "linux") && ARCH == "arm"
      "arm64"
    elsif ARCH == "x86_64"
      "amd64"
    else
      raise "As of 1.3.0, envkey-ruby only supports 64-bit systems. Please use an earlier version for 32-bit support."
    end
  end

  def self.ext
    platform_part == "windows" ? ".exe" : ""
  end

  def self.fetch_env_path
    File.expand_path("../../ext/#{lib_file_dir}/envkey-source#{ext}", File.dirname(__FILE__))
  end

  def self.lib_file_dir
    ["envkey-source", Envkey::ENVKEY_SOURCE_VERSION.to_s, platform_part, arch_part].join("_")
  end

end
