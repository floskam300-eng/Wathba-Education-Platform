import React, { useState } from 'react';

const JITSI_DOMAIN = 'meet.jit.si';

export default function JitsiMeet({
  roomName,
  displayName,
  isTeacher = false,
  style = {},
  className = '',
  onLeft,
}) {
  const [loaded, setLoaded] = useState(false);

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
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0a0a', ...style }} className={className}>
      {/* Dark loading overlay — hides Jitsi's blue loading screen */}
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: '#0a0a0a',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '3px solid rgba(249,115,22,0.2)',
            borderTopColor: '#f97316',
            animation: 'spin 1s linear infinite',
          }} />
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: 'inherit' }}>
            جارٍ الاتصال بغرفة البث...
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      <iframe
        key={roomName}
        src={src}
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write; screen-wake-lock"
        style={{ border: 'none', width: '100%', height: '100%', minHeight: 300, display: 'block' }}
        title="Jitsi Meet"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
