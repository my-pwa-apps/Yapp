import React, { useState, useRef, useEffect, useCallback } from 'react';
import { formatDuration } from '../../utils';

interface Props {
  onSend: (blob: Blob, duration: number) => void;
  onCancel: () => void;
  onPermissionError?: (msg: string) => void;
}

export const VoiceRecorder: React.FC<Props> = ({ onSend, onCancel, onPermissionError }) => {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const startTimeRef = useRef(0);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      startTimeRef.current = Date.now();
      setRecording(true);
      setAudioBlob(null);
      setAudioUrl(null);

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 200);
    } catch {
      // Mic permission denied
      if (onPermissionError) onPermissionError('Microphone access denied. Please allow microphone permission in your browser settings.');
      onCancel();
    }
  }, [onCancel, onPermissionError]);

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  };

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob, duration);
    }
  };

  const handleCancel = () => {
    stopRecording();
    onCancel();
  };

  // Start recording immediately on mount (only once)
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startRecording();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Revoke blob URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  return (
    <div className="voice-recorder">
      {recording ? (
        <>
          <button className="voice-cancel-btn" onClick={handleCancel} title="Cancel">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
          </button>
          <div className="voice-recording-indicator">
            <span className="voice-dot" />
            <span className="voice-time">{formatDuration(duration)}</span>
          </div>
          <button className="voice-stop-btn" onClick={stopRecording} title="Stop">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        </>
      ) : audioBlob ? (
        <>
          <button className="voice-cancel-btn" onClick={handleCancel} title="Discard">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
          </button>
          <audio src={audioUrl!} controls className="voice-preview" />
          <span className="voice-time">{formatDuration(duration)}</span>
          <button className="voice-send-btn" onClick={handleSend} title="Send">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </>
      ) : null}
    </div>
  );
};
