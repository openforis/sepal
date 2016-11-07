#this file is being picked up

class Rack::Handler::WEBrick
  class << self
    alias_method :run_original, :run
  end
  def self.run(app, options={})
    options[:DoNotReverseLookup] = true
    run_original(app, options)
  end
end

set  :bind, "0.0.0.0"
config.store[:ws_config] = '/etc/riemann/custom/dashboard.json'