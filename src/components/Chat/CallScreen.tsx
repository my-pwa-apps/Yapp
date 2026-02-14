import React, { useEffect, useRef, useState } from 'react';
import type { CallData, UserProfile } from '../../types';
import type { CallState } from '../../hooks/useCall';

interface Props {
  callState: CallState;
  callData: CallData | null;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isMuted: boolean;
  isVideoOff: boolean;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  /** Chat members eligible to be added to the call (not already in it) */
  addableMembers?: UserProfile[];
  onAddParticipant?: (uid: string) => void;
}

export const CallScreen: React.FC<Props> = ({
  callState,
  callData,
  localStream,
  remoteStreams,
  isMuted,
  isVideoOff,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleVideo,
  addableMembers = [],
  onAddParticipant,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [showAddPicker, setShowAddPicker] = useState(false);

  const isVideo = callData?.callType === 'video';

  // Cleanup hidden audio elements on unmount (call ended)
  useEffect(() => {
    return () => {
      document.querySelectorAll('[id^="remote-audio-"]').forEach((el) => el.remove());
    };
  }, []);

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream]);

  // Attach remote streams — for audio calls, create hidden <audio> elements
  // so iOS Safari actually plays the remote audio
  useEffect(() => {
    remoteStreams.forEach((stream, uid) => {
      const el = remoteVideoRefs.current.get(uid);
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
        el.play().catch(() => {});
      }
    });

    // For audio calls (no video elements rendered), use hidden audio elements
    if (!isVideo || callState !== 'active') {
      remoteStreams.forEach((stream, uid) => {
        const existingAudio = document.getElementById(`remote-audio-${uid}`) as HTMLAudioElement;
        if (existingAudio) {
          if (existingAudio.srcObject !== stream) {
            existingAudio.srcObject = stream;
            existingAudio.play().catch(() => {});
          }
        } else {
          const audio = document.createElement('audio');
          audio.id = `remote-audio-${uid}`;
          audio.autoplay = true;
          audio.srcObject = stream;
          audio.setAttribute('playsinline', '');
          document.body.appendChild(audio);
          audio.play().catch(() => {});
        }
      });
    }

    // Cleanup hidden audio elements when streams are removed
    return () => {
      const audioEls = document.querySelectorAll('[id^="remote-audio-"]');
      audioEls.forEach((el) => {
        const uid = el.id.replace('remote-audio-', '');
        if (!remoteStreams.has(uid)) {
          el.remove();
        }
      });
    };
  }, [remoteStreams, isVideo, callState]);

  const getStatusText = () => {
    switch (callState) {
      case 'outgoing': return 'Calling...';
      case 'incoming': return 'Incoming call';
      case 'active': return '';
      case 'ended': return 'Call ended';
      default: return '';
    }
  };

  return (
    <div className={`call-overlay ${isVideo ? 'video-call' : 'audio-call'}`}>
      <div className="call-container">
        {/* Remote video(s) — fills the background for video calls */}
        {isVideo && callState === 'active' && (
          <div className="call-remote-videos">
            {Array.from(remoteStreams.entries()).map(([uid, stream]) => (
              <video
                key={uid}
                ref={(el) => {
                  if (el) {
                    remoteVideoRefs.current.set(uid, el);
                    if (el.srcObject !== stream) el.srcObject = stream;
                  }
                }}
                autoPlay
                playsInline
                className="remote-video"
              />
            ))}
          </div>
        )}

        {/* Local video (picture-in-picture) */}
        {isVideo && localStream && (
          <div className="call-local-video">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="local-video"
            />
          </div>
        )}

        {/* Call info */}
        <div className="call-info">
          {(!isVideo || callState !== 'active') && (
            <>
              <div className="call-avatar">
                {callData?.callerName?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="call-name">{callData?.callerName || 'Unknown'}</div>
              <div className="call-type-label">
                {isVideo ? '📹 Video call' : '📞 Audio call'}
              </div>
            </>
          )}
          <div className="call-status">{getStatusText()}</div>
        </div>

        {/* Audio visualization for audio calls */}
        {!isVideo && callState === 'active' && (
          <div className="call-audio-waves">
            <span className="wave" /><span className="wave" /><span className="wave" />
            <span className="wave" /><span className="wave" />
          </div>
        )}

        {/* Controls */}
        <div className="call-controls">
          {callState === 'incoming' ? (
            <>
              <button className="call-btn reject" onClick={onReject} title="Decline">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                  <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1 0-1.36C3.57 8.55 7.55 7 12 7s8.43 1.55 11.71 4.72c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                </svg>
              </button>
              <button className="call-btn accept" onClick={onAccept} title="Accept">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                  <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
                </svg>
              </button>
            </>
          ) : (
            <>
              <button
                className={`call-btn toggle ${isMuted ? 'active' : ''}`}
                onClick={onToggleMute}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                    <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                  </svg>
                )}
              </button>

              {isVideo && (
                <button
                  className={`call-btn toggle ${isVideoOff ? 'active' : ''}`}
                  onClick={onToggleVideo}
                  title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
                >
                  {isVideoOff ? (
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                      <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                    </svg>
                  )}
                </button>
              )}

              <button className="call-btn end" onClick={onEnd} title="End call">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                  <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1 0-1.36C3.57 8.55 7.55 7 12 7s8.43 1.55 11.71 4.72c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                </svg>
              </button>

              {/* Add participant button — only during active calls with addable members */}
              {callState === 'active' && addableMembers.length > 0 && onAddParticipant && (
                <div className="call-add-user-wrapper">
                  <button
                    className="call-btn toggle"
                    onClick={() => setShowAddPicker((prev) => !prev)}
                    title="Add user to call"
                  >
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                      <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </button>
                  {showAddPicker && (
                    <div className="call-add-picker">
                      <div className="call-add-picker-title">Add to call</div>
                      {addableMembers.map((member) => (
                        <button
                          key={member.uid}
                          className="call-add-picker-item"
                          onClick={() => {
                            onAddParticipant(member.uid);
                            setShowAddPicker(false);
                          }}
                        >
                          <div className="avatar avatar-xs">
                            {member.displayName.charAt(0).toUpperCase()}
                          </div>
                          <span>{member.displayName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
