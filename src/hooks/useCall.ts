import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ref,
  set,
  get,
  update,
  onValue,
  onChildAdded,
  push,
  remove,
} from 'firebase/database';
import { db } from '../firebase';
import type { CallData } from '../types';
import { useCallSounds } from './useCallSounds';
import { sendPushToUsers } from '../utils/sendPushNotification';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'active' | 'ended';

export interface UseCallReturn {
  callState: CallState;
  callData: CallData | null;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  startCall: (chatId: string, callType: 'audio' | 'video', members: string[]) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  addParticipant: (uid: string) => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  isMuted: boolean;
  isVideoOff: boolean;
}

export function useCall(currentUid: string, currentName: string, onMediaError?: (msg: string) => void): UseCallReturn {
  const showError = onMediaError ?? ((msg: string) => { alert(msg); });
  const [callState, setCallState] = useState<CallState>('idle');
  const [callData, setCallData] = useState<CallData | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const callIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const unsubscribersRef = useRef<(() => void)[]>([]);
  // Queue ICE candidates that arrive before remoteDescription is set
  const iceCandidateQueues = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Call sounds (dialtone for outgoing, ringtone for incoming)
  const { playSound, stopSound } = useCallSounds();

  // Play / stop sounds based on call state
  useEffect(() => {
    if (callState === 'outgoing') {
      playSound('dialtone');
    } else if (callState === 'incoming') {
      playSound('ringtone');
    } else {
      stopSound();
    }
  }, [callState, playSound, stopSound]);

  const cleanup = useCallback(() => {
    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    iceCandidateQueues.current.clear();

    // Stop local stream tracks (use ref to avoid stale closure)
    localStreamRef.current?.getTracks().forEach((t) => t.stop());

    // Remove all Firebase listeners
    unsubscribersRef.current.forEach((unsub) => unsub());
    unsubscribersRef.current = [];

    setLocalStream(null);
    localStreamRef.current = null;
    setRemoteStreams(new Map());
    setIsMuted(false);
    setIsVideoOff(false);
  }, []);

  // Listen for incoming calls
  useEffect(() => {
    if (!currentUid) return;
    const callsRef = ref(db, 'calls');
    const unsub = onValue(callsRef, (snap) => {
      if (callState !== 'idle') return;
      snap.forEach((child) => {
        const data = { ...child.val(), id: child.key! } as CallData;
        if (
          data.status === 'ringing' &&
          data.participants?.[currentUid] &&
          data.callerId !== currentUid
        ) {
          setCallData(data);
          callIdRef.current = data.id;
          setCallState('incoming');
        }
      });
    }, (err) => {
      console.warn('[useCall] Cannot listen for calls:', err.message);
    });
    return () => unsub();
  }, [currentUid, callState]);

  const getMediaStream = async (callType: 'audio' | 'video'): Promise<MediaStream> => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });
    } catch (err) {
      // iOS fallback: if video fails, try audio-only
      if (callType === 'video') {
        console.warn('[useCall] Video getUserMedia failed, trying audio-only:', err);
        try {
          return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (audioErr) {
          console.error('[useCall] Audio getUserMedia also failed:', audioErr);
          throw audioErr;
        }
      }
      throw err;
    }
  };

  /** Flush queued ICE candidates once remoteDescription is set */
  const flushIceCandidates = useCallback((pc: RTCPeerConnection, remoteUid: string) => {
    const queue = iceCandidateQueues.current.get(remoteUid);
    if (queue && queue.length > 0) {
      queue.forEach((c) => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
      iceCandidateQueues.current.set(remoteUid, []);
    }
  }, []);

  const createPeerConnection = (
    callId: string,
    remoteUid: string,
    stream: MediaStream,
    isCaller: boolean
  ): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // Handle ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const candidateRef = push(
          ref(db, `callSignaling/${callId}/${currentUid}_${remoteUid}/candidates`)
        );
        set(candidateRef, e.candidate.toJSON());
      }
    };

    // Handle remote stream
    pc.ontrack = (e) => {
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.set(remoteUid, e.streams[0]);
        return next;
      });
    };

    // Initialise candidate queue for this peer
    iceCandidateQueues.current.set(remoteUid, []);

    // Listen for remote ICE candidates
    const remoteCandidatesRef = ref(
      db,
      `callSignaling/${callId}/${remoteUid}_${currentUid}/candidates`
    );
    const unsubCandidates = onChildAdded(remoteCandidatesRef, (snap) => {
      const candidate = snap.val();
      if (!candidate) return;
      // If remoteDescription is set we can add immediately, otherwise queue
      if (pc.remoteDescription) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        const q = iceCandidateQueues.current.get(remoteUid) || [];
        q.push(candidate);
        iceCandidateQueues.current.set(remoteUid, q);
      }
    });
    unsubscribersRef.current.push(unsubCandidates);

    peerConnectionsRef.current.set(remoteUid, pc);
    return pc;
  };

  const startCall = async (
    chatId: string,
    callType: 'audio' | 'video',
    members: string[]
  ) => {
    let stream: MediaStream;
    try {
      stream = await getMediaStream(callType);
    } catch (err) {
      console.error('[useCall] Cannot start call – media access denied:', err);
      showError('Could not access camera/microphone. Please allow media permissions and try again.');
      return;
    }
    setLocalStream(stream);
    localStreamRef.current = stream;

    // Create call record in Firebase
    const callRef = push(ref(db, 'calls'));
    const callId = callRef.key!;
    callIdRef.current = callId;

    const participants: Record<string, boolean> = {};
    members.forEach((uid) => { participants[uid] = true; });

    const newCall: Omit<CallData, 'id'> = {
      chatId,
      callerId: currentUid,
      callerName: currentName,
      callType,
      status: 'ringing',
      participants,
      createdAt: Date.now(),
    };

    await set(callRef, newCall);
    setCallData({ ...newCall, id: callId });
    setCallState('outgoing');

    // Send push notification to remote members (wakes them up even if app is closed)
    const remoteMembers = members.filter((uid) => uid !== currentUid);
    sendPushToUsers(remoteMembers, {
      title: '\u{1F4DE} Incoming Call',
      body: `${currentName} is calling you`,
      data: { type: 'call', callId, callType, tag: `call-${callId}` },
    }).catch(() => {});
    for (const remoteUid of remoteMembers) {
      const pc = createPeerConnection(callId, remoteUid, stream, true);

      // Create and set offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await set(ref(db, `callSignaling/${callId}/${currentUid}_${remoteUid}/offer`), {
        type: offer.type,
        sdp: offer.sdp,
      });

      // Listen for answer
      const answerRef = ref(db, `callSignaling/${callId}/${remoteUid}_${currentUid}/answer`);
      const unsubAnswer = onValue(answerRef, async (snap) => {
        const answer = snap.val();
        if (answer && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          // Flush any ICE candidates that arrived before remoteDescription
          flushIceCandidates(pc, remoteUid);
          setCallState('active');
          await update(ref(db, `calls/${callId}`), { status: 'active' });
        }
      });
      unsubscribersRef.current.push(unsubAnswer);
    }

    // Listen for call status changes
    const statusRef = ref(db, `calls/${callId}/status`);
    const unsubStatus = onValue(statusRef, (snap) => {
      const status = snap.val();
      if (status === 'ended') {
        cleanup();
        setCallState('ended');
        setTimeout(() => {
          setCallState('idle');
          setCallData(null);
        }, 2000);
      }
    });
    unsubscribersRef.current.push(unsubStatus);
  };

  // Listen for newly added participants (someone else was added to our active call)
  useEffect(() => {
    if (!callIdRef.current || (callState !== 'active' && callState !== 'outgoing')) return;
    const callId = callIdRef.current;

    const participantsRef = ref(db, `calls/${callId}/participants`);
    const unsubParticipants = onValue(participantsRef, async (snap) => {
      const participants = snap.val() as Record<string, boolean> | null;
      if (!participants) return;

      const stream = localStreamRef.current;
      if (!stream) return;

      // Find participants we don't have a peer connection for yet
      const allUids = Object.keys(participants).filter((uid) => uid !== currentUid);
      for (const remoteUid of allUids) {
        if (peerConnectionsRef.current.has(remoteUid)) continue;
        // New participant — check if they have an offer for us (they are the caller for this leg)
        const offerSnap = await get(
          ref(db, `callSignaling/${callId}/${remoteUid}_${currentUid}/offer`)
        );
        const offer = offerSnap.val();
        if (offer) {
          // They sent us an offer — we answer
          const pc = createPeerConnection(callId, remoteUid, stream, false);
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          flushIceCandidates(pc, remoteUid);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await set(ref(db, `callSignaling/${callId}/${currentUid}_${remoteUid}/answer`), {
            type: answer.type,
            sdp: answer.sdp,
          });
        }
        // If no offer yet, the addParticipant flow will create offers from the caller's side
      }

      // Update callData with new participants
      setCallData((prev) => prev ? { ...prev, participants } : prev);
    });
    unsubscribersRef.current.push(unsubParticipants);

    return () => unsubParticipants();
  }, [callState, currentUid, flushIceCandidates]);

  const acceptCall = async () => {
    if (!callData || !callIdRef.current) return;

    let stream: MediaStream;
    try {
      stream = await getMediaStream(callData.callType);
    } catch (err) {
      console.error('[useCall] Cannot accept call – media access denied:', err);
      showError('Could not access camera/microphone. Please allow media permissions.');
      rejectCall();
      return;
    }
    setLocalStream(stream);
    localStreamRef.current = stream;
    setCallState('active');

    const callId = callIdRef.current;
    const remoteMembers = Object.keys(callData.participants).filter(
      (uid) => uid !== currentUid
    );

    for (const remoteUid of remoteMembers) {
      const pc = createPeerConnection(callId, remoteUid, stream, false);

      // Get the offer
      const offerSnap = await get(
        ref(db, `callSignaling/${callId}/${remoteUid}_${currentUid}/offer`)
      );
      const offer = offerSnap.val();

      if (offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Flush any ICE candidates that arrived before remoteDescription
        flushIceCandidates(pc, remoteUid);

        // Create and set answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await set(ref(db, `callSignaling/${callId}/${currentUid}_${remoteUid}/answer`), {
          type: answer.type,
          sdp: answer.sdp,
        });
      }
    }

    await update(ref(db, `calls/${callId}`), { status: 'active' });

    // Listen for call status changes
    const statusRef = ref(db, `calls/${callId}/status`);
    const unsubStatus = onValue(statusRef, (snap) => {
      const status = snap.val();
      if (status === 'ended') {
        cleanup();
        setCallState('ended');
        setTimeout(() => {
          setCallState('idle');
          setCallData(null);
        }, 2000);
      }
    });
    unsubscribersRef.current.push(unsubStatus);
  };

  const rejectCall = () => {
    if (callIdRef.current) {
      update(ref(db, `calls/${callIdRef.current}`), { status: 'ended' });
      remove(ref(db, `callSignaling/${callIdRef.current}`));
    }
    cleanup();
    setCallState('idle');
    setCallData(null);
  };

  const endCall = () => {
    if (callIdRef.current) {
      update(ref(db, `calls/${callIdRef.current}`), { status: 'ended' });
      remove(ref(db, `callSignaling/${callIdRef.current}`));
    }
    cleanup();
    setCallState('ended');
    setTimeout(() => {
      setCallState('idle');
      setCallData(null);
    }, 1500);
  };

  /** Add a new participant to the current call */
  const addParticipant = async (uid: string) => {
    const callId = callIdRef.current;
    const stream = localStreamRef.current;
    if (!callId || !stream) return;
    if (peerConnectionsRef.current.has(uid)) return; // already connected

    // Add participant to the call record in Firebase
    await update(ref(db, `calls/${callId}/participants`), { [uid]: true });

    // Send push notification to the added participant
    sendPushToUsers([uid], {
      title: '\u{1F4DE} Incoming Call',
      body: `${currentName} added you to a call`,
      data: { type: 'call', callId, callType: callData?.callType || 'audio', tag: `call-${callId}` },
    }).catch(() => {});

    // Create peer connection and send offer
    const pc = createPeerConnection(callId, uid, stream, true);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await set(ref(db, `callSignaling/${callId}/${currentUid}_${uid}/offer`), {
      type: offer.type,
      sdp: offer.sdp,
    });

    // Listen for their answer
    const answerRef = ref(db, `callSignaling/${callId}/${uid}_${currentUid}/answer`);
    const unsubAnswer = onValue(answerRef, async (snap) => {
      const answer = snap.val();
      if (answer && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        flushIceCandidates(pc, uid);
      }
    });
    unsubscribersRef.current.push(unsubAnswer);
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
      setIsMuted((prev) => !prev);
    }
  };

  const toggleVideo = () => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getVideoTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
      setIsVideoOff((prev) => !prev);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  return {
    callState,
    callData,
    localStream,
    remoteStreams,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    addParticipant,
    toggleMute,
    toggleVideo,
    isMuted,
    isVideoOff,
  };
}
