import React from 'react';

const JITSI_DOMAIN = 'meet.jit.si';

export default function JitsiMeet({
  roomName,
  displayName,
  isTeacher = false,
  style = {},
  className = '',
  onLeft,
}) {
  const fragments = [
    `userInfo.displayName=${encodeURIComponent(displayName || 'مشارك')}`,
    'config.prejoinPageEnabled=false',
    `config.startWithAudioMuted=${!isTeacher}`,
    `config.startWithVideoMuted=${!isTeacher}`,
    'config.disableDeepLinking=true',
    'config.defaultLanguage=ar',
    'config.disableInviteFunctions=true',
    'config.toolbarConfig.alwaysVisible=true',
    'config.disableRemoteMute=false',
    'config.enableNoisyMicDetection=false',
    'interfaceConfig.SHOW_JITSI_WATERMARK=false',
    'interfaceConfig.HIDE_INVITE_MORE_HEADER=true',
    'interfaceConfig.DISABLE_JOIN_LEAVE_NOTIFICATIONS=false',
  ].join('&');

  const src = `https://${JITSI_DOMAIN}/${encodeURIComponent(roomName)}#${fragments}`;

  return (
    <iframe
      key={roomName}
      src={src}
      allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write; screen-wake-lock"
      className={className}
      style={{ border: 'none', width: '100%', height: '100%', minHeight: 300, ...style }}
      title="Jitsi Meet"
    />
  );
}
