import React, { useEffect, useRef } from 'react';

const JITSI_DOMAIN = 'meet.jit.si';

let scriptLoading = false;
let scriptLoaded  = false;
const scriptCallbacks = [];

function loadJitsiScript() {
  return new Promise((resolve, reject) => {
    if (scriptLoaded && window.JitsiMeetExternalAPI) { resolve(); return; }
    scriptCallbacks.push({ resolve, reject });
    if (scriptLoading) return;
    scriptLoading = true;
    const s = document.createElement('script');
    s.id  = 'jitsi-external-api';
    s.src = `https://${JITSI_DOMAIN}/external_api.js`;
    s.async = true;
    s.onload  = () => { scriptLoaded = true; scriptCallbacks.forEach(cb => cb.resolve()); };
    s.onerror = () => scriptCallbacks.forEach(cb => cb.reject(new Error('Jitsi script failed')));
    document.head.appendChild(s);
  });
}

export default function JitsiMeet({
  roomName,
  displayName,
  isTeacher = false,
  onLeft,
  className = '',
  style = {},
}) {
  const containerRef = useRef(null);
  const apiRef       = useRef(null);
  const onLeftRef    = useRef(onLeft);
  useEffect(() => { onLeftRef.current = onLeft; }, [onLeft]);

  useEffect(() => {
    let mounted = true;

    loadJitsiScript().then(() => {
      if (!mounted || !containerRef.current || apiRef.current) return;

      const teacherToolbar = [
        'microphone', 'camera', 'desktop',
        'fullscreen', 'fodeviceselection',
        'hangup', 'tileview', 'settings',
        'recording', 'livestreaming',
        'participants-pane', 'mute-everyone',
      ];

      const studentToolbar = [
        'microphone', 'camera',
        'fullscreen', 'hangup', 'tileview',
        'fodeviceselection', 'raisehand',
      ];

      const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
        roomName,
        parentNode: containerRef.current,
        userInfo: { displayName },
        configOverwrite: {
          startWithAudioMuted:     !isTeacher,
          startWithVideoMuted:     !isTeacher,
          prejoinPageEnabled:      false,
          disableDeepLinking:      true,
          defaultLanguage:         'ar',
          disableInviteFunctions:  true,
          enableNoAudioDetection:  false,
          enableNoisyMicDetection: false,
          disableScreensharing:    !isTeacher,
          toolbarConfig:           { alwaysVisible: true },
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: isTeacher ? teacherToolbar : studentToolbar,
          SHOW_JITSI_WATERMARK:             false,
          SHOW_WATERMARK_FOR_GUESTS:        false,
          SHOW_BRAND_WATERMARK:             false,
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
          DEFAULT_REMOTE_DISPLAY_NAME:      'مشارك',
          LANG_DETECTION:                   false,
          RECENT_LIST_ENABLED:              false,
          HIDE_INVITE_MORE_HEADER:          true,
          DISABLE_PRESENCE_STATUS:          true,
        },
      });

      apiRef.current = api;

      api.addEventListener('videoConferenceLeft', () => {
        if (onLeftRef.current) onLeftRef.current();
      });
      api.addEventListener('readyToClose', () => {
        if (onLeftRef.current) onLeftRef.current();
      });
    }).catch((err) => {
      console.error('[JitsiMeet] Failed to load API:', err);
    });

    return () => {
      mounted = false;
      if (apiRef.current) {
        try { apiRef.current.dispose(); } catch (_) {}
        apiRef.current = null;
      }
    };
  }, [roomName]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ minHeight: 300, ...style }}
    />
  );
}
