export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  status: string;
  online: boolean;
  lastSeen: number;
  createdAt: number;
  /** ECDH P-256 public key (JWK JSON string) */
  publicKey?: string;
  /** Private key encrypted with login password (PBKDF2 + AES-GCM) */
  encryptedPrivateKey?: { ciphertext: string; iv: string; salt: string };
}

export interface Chat {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  photoURL?: string;
  members: Record<string, boolean>;  // uid -> true
  admins?: Record<string, boolean>;
  createdBy: string;
  createdAt: number;
  lastMessage?: {
    text: string;
    senderId: string;
    senderName: string;
    timestamp: number;
    encrypted?: boolean;
    ciphertext?: string;
    iv?: string;
  };
  typing?: Record<string, boolean>;
  /** Pending join/invite requests: uid -> { type, fromName, timestamp } */
  pendingMembers?: Record<string, PendingMember>;
}

export interface PendingMember {
  type: 'invite' | 'request';  // invite = admin invited them, request = user asked to join
  fromUid: string;             // who initiated (admin uid for invite, user uid for request)
  fromName: string;
  timestamp: number;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  readBy: Record<string, boolean>;
  type: 'text' | 'image' | 'gif' | 'sticker' | 'voice' | 'system';
  mediaURL?: string;
  voiceDuration?: number;
  /** E2EE fields */
  encrypted?: boolean;
  ciphertext?: string;
  iv?: string;
}

export interface CallData {
  id: string;
  chatId: string;
  callerId: string;
  callerName: string;
  callType: 'audio' | 'video';
  status: 'ringing' | 'active' | 'ended';
  participants: Record<string, boolean>;
  createdAt: number;
}

export interface ContactRequest {
  id: string;
  from: string;
  fromName: string;
  fromEmail: string;
  to: string;
  timestamp: number;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface CryptoKeys {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

/* ── Yapps (social feed) ── */

export interface Yapp {
  id: string;
  authorId: string;
  authorName: string;
  authorPhotoURL: string | null;
  text: string;
  mediaURL?: string;
  mediaType?: 'image' | 'gif' | 'sticker' | 'voice';
  voiceDuration?: number;
  /** Visibility: 'public' = visible to everyone, 'contacts' = only author's contacts */
  privacy: 'public' | 'contacts';
  timestamp: number;
  likeCount: number;
  replyCount: number;
  reyappCount: number;
  /** If this yapp is a reply, the parent yapp id */
  parentId?: string;
  /** If this is a reyapp (retweet), the original yapp id */
  reyappOf?: string;
  /** Display name of who reyapped it */
  reyappByUid?: string;
  reyappByName?: string;
}
