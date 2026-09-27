Pod::Spec.new do |s|
  s.name             = 'DSPPicture'
  s.version          = '1.0.0'
  s.summary          = 'DS,P picture: an AVPlayerLayer host with the first-frame witness, PiP and trace rows; the tuning static.'
  s.description      = 'The picture cell of Dead Simple Player on iOS. Hosts expo-video\'s AVPlayer in an app-owned AVPlayerLayer, ends the tuning static only on an observed first frame (docs/native-witness.md), and draws the static as a Core Animation keyframe animation.'
  s.license          = 'MIT'
  s.author           = 'DS,P'
  s.homepage         = 'https://github.com/rabsef-bicrym/dead-simple-player'
  s.platforms        = { :ios => '15.1' }
  s.swift_version    = '5.9'
  s.source           = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
