import type { Chat, Message, UserProfile, Yapp } from '../types';

export function isE2EMockMode() {
  return import.meta.env.VITE_E2E_MOCK_AUTH === 'true'
    && typeof window !== 'undefined'
    && window.localStorage.getItem('yapp:e2e-mock-auth') === 'true';
}

const now = Date.now();

export const e2eProfile: UserProfile = {
  uid: 'e2e-user',
  displayName: 'E2E Tester',
  email: 'e2e@example.com',
  photoURL: null,
  status: "Hey there! I'm using Yappin'",
  online: true,
  lastSeen: now,
  createdAt: now - 86_400_000,
};

export const e2eChats: Chat[] = [
  {
    id: 'e2e-chat',
    type: 'group',
    name: 'Launch Squad',
    members: { 'e2e-user': true, 'e2e-friend': true },
    admins: { 'e2e-user': true },
    createdBy: 'e2e-user',
    createdAt: now - 60_000,
    lastMessage: {
      text: 'Ship it when it is ready.',
      senderId: 'e2e-friend',
      senderName: 'Avery',
      timestamp: now - 5_000,
    },
  },
  {
    id: 'e2e-scroll-chat',
    type: 'group',
    name: 'Scroll Lab',
    members: { 'e2e-user': true, 'e2e-friend': true },
    admins: { 'e2e-user': true },
    createdBy: 'e2e-user',
    createdAt: now - 50_000,
    lastMessage: {
      text: 'Scroll memory message 36',
      senderId: 'e2e-friend',
      senderName: 'Avery',
      timestamp: now - 1_000,
    },
  },
];

const initialMessages: Message[] = [
  {
    id: 'e2e-message-1',
    chatId: 'e2e-chat',
    senderId: 'e2e-friend',
    senderName: 'Avery',
    text: 'Welcome to the launch room.',
    timestamp: now - 20_000,
    readBy: { 'e2e-friend': true },
    type: 'text',
  },
  {
    id: 'e2e-message-2',
    chatId: 'e2e-chat',
    senderId: 'e2e-user',
    senderName: 'E2E Tester',
    text: 'Ship it when it is ready.',
    timestamp: now - 5_000,
    readBy: { 'e2e-user': true },
    type: 'text',
  },
];

const initialScrollMessages: Message[] = Array.from({ length: 36 }, (_unused, index) => {
  const messageNumber = index + 1;
  return {
    id: `e2e-scroll-message-${messageNumber}`,
    chatId: 'e2e-scroll-chat',
    senderId: messageNumber % 2 === 0 ? 'e2e-user' : 'e2e-friend',
    senderName: messageNumber % 2 === 0 ? 'E2E Tester' : 'Avery',
    text: `Scroll memory message ${messageNumber}`,
    timestamp: now - 40_000 + messageNumber * 1_000,
    readBy: { 'e2e-user': true },
    type: 'text',
  } satisfies Message;
});

const initialYapps: Yapp[] = [
  {
    id: 'e2e-yapp-1',
    authorId: 'e2e-friend',
    authorName: 'Avery',
    authorPhotoURL: null,
    text: 'A public test yapp for the feed.',
    privacy: 'public',
    timestamp: now - 30_000,
    likeCount: 1,
    replyCount: 0,
    reyappCount: 0,
  },
];

const messagesByChat = new Map<string, Message[]>([
  ['e2e-chat', [...initialMessages]],
  ['e2e-scroll-chat', [...initialScrollMessages]],
]);
let yapps = [...initialYapps];
const likedYapps = new Set<string>();

function notify(name: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(name));
}

export function getE2EMessages(chatId: string | null): Message[] {
  if (!chatId) return [];
  return [...(messagesByChat.get(chatId) ?? [])];
}

export function addE2EMessage(message: Omit<Message, 'id'>) {
  const id = `e2e-message-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const next = { ...message, id };
  const existing = messagesByChat.get(message.chatId) ?? [];
  messagesByChat.set(message.chatId, [...existing, next]);
  notify('yapp:e2e-messages-changed');
}

export function subscribeE2EMessages(listener: () => void) {
  window.addEventListener('yapp:e2e-messages-changed', listener);
  return () => window.removeEventListener('yapp:e2e-messages-changed', listener);
}

export function getE2EYapps(): Yapp[] {
  return [...yapps].sort((a, b) => b.timestamp - a.timestamp);
}

export function addE2EYapp(yapp: Omit<Yapp, 'id' | 'timestamp' | 'likeCount' | 'replyCount' | 'reyappCount'>): string {
  const id = `e2e-yapp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  yapps = [{ ...yapp, id, timestamp: Date.now(), likeCount: 0, replyCount: 0, reyappCount: 0 }, ...yapps];
  notify('yapp:e2e-yapps-changed');
  return id;
}

export function subscribeE2EYapps(listener: () => void) {
  window.addEventListener('yapp:e2e-yapps-changed', listener);
  return () => window.removeEventListener('yapp:e2e-yapps-changed', listener);
}

export function getE2EYappLiked(yappId: string | undefined) {
  return !!yappId && likedYapps.has(yappId);
}

export function toggleE2EYappLike(yappId: string) {
  if (likedYapps.has(yappId)) likedYapps.delete(yappId);
  else likedYapps.add(yappId);
  notify('yapp:e2e-yapps-changed');
}