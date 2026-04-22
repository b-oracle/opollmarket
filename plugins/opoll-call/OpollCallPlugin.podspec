Pod::Spec.new do |s|
  s.name = 'OpollCallPlugin'
  s.version = '0.0.1'
  s.summary = 'Local Capacitor plugin for incoming calls.'
  s.license = 'MIT'
  s.homepage = 'https://opollmarket.com'
  s.author = 'Opoll'
  s.source = { :git => 'https://example.com/opoll-call-plugin.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target  = '13.0'
  s.dependency 'Capacitor'
end
