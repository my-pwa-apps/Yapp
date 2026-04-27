/**
 * Minimal security-rule unit tests against the Firebase RTDB emulator.
 * Run via: `firebase emulators:exec --only database --project yapp-ci "npm run test:rules"`
 */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import fs from 'node:fs';
import path from 'node:path';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'yapp-ci',
    database: {
      rules: fs.readFileSync(path.resolve(__dirname, '../database.rules.json'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();
});

/** Seed a minimal user profile so rule preconditions pass. */
async function seedUser(uid: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref(`users/${uid}`).set({
      uid,
      displayName: `u-${uid}`,
      email: `${uid}@example.com`,
      online: true,
      lastSeen: Date.now(),
      createdAt: Date.now(),
    });
  });
}

async function seedDirectChat(chatId = 'c1') {
  await seedUser('alice');
  await seedUser('bob');
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref(`chats/${chatId}`).set({
      type: 'direct',
      members: { alice: true, bob: true },
      createdBy: 'alice',
      createdAt: Date.now(),
    });
  });
}

async function seedMessage(chatId = 'c1', messageId = 'm1', senderId = 'alice') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref(`messages/${chatId}/${messageId}`).set({
      chatId,
      senderId,
      senderName: senderId === 'alice' ? 'Alice' : 'Bob',
      text: 'hello',
      timestamp: Date.now(),
      type: 'text',
      readBy: { [senderId]: true },
    });
  });
}

describe('users', () => {
  it('authed user can write their own profile', async () => {
    const alice = env.authenticatedContext('alice').database();
    await assertSucceeds(
      alice.ref('users/alice').set({
        uid: 'alice',
        displayName: 'Alice',
        email: 'a@example.com',
        online: true,
        lastSeen: Date.now(),
        createdAt: Date.now(),
      }),
    );
  });

  it('authed user cannot overwrite another user', async () => {
    await seedUser('bob');
    const alice = env.authenticatedContext('alice').database();
    await assertFails(
      alice.ref('users/bob').update({ displayName: 'pwned' }),
    );
  });

  it('unauthed user cannot read /users', async () => {
    await seedUser('bob');
    const anon = env.unauthenticatedContext().database();
    await assertFails(anon.ref('users/bob').get());
  });
});

describe('chats & messages', () => {
  it('non-member cannot read a chat', async () => {
    await seedUser('alice');
    await seedUser('bob');
    await seedUser('eve');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('chats/c1').set({
        type: 'direct',
        members: { alice: true, bob: true },
        createdBy: 'alice',
        createdAt: Date.now(),
      });
    });
    const eve = env.authenticatedContext('eve').database();
    await assertFails(eve.ref('chats/c1').get());
  });

  it('non-member cannot write a message', async () => {
    await seedUser('alice');
    await seedUser('eve');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('chats/c1').set({
        type: 'direct',
        members: { alice: true },
        createdBy: 'alice',
        createdAt: Date.now(),
      });
    });
    const eve = env.authenticatedContext('eve').database();
    await assertFails(
      eve.ref('messages/c1/m1').set({
        chatId: 'c1',
        senderId: 'eve',
        senderName: 'Eve',
        text: 'hi',
        timestamp: Date.now(),
        type: 'text',
      }),
    );
  });

  it('member cannot edit another member\'s message', async () => {
    await seedDirectChat();
    await seedMessage();
    const bob = env.authenticatedContext('bob').database();
    await assertFails(bob.ref('messages/c1/m1/text').set('tampered'));
  });

  it('sender can edit their own message', async () => {
    await seedDirectChat();
    await seedMessage();
    const alice = env.authenticatedContext('alice').database();
    await assertSucceeds(alice.ref().update({
      'messages/c1/m1/text': 'edited',
      'messages/c1/m1/edited': true,
      'messages/c1/m1/editedAt': Date.now(),
    }));
  });

  it('member cannot mutate protected chat metadata', async () => {
    await seedDirectChat();
    const bob = env.authenticatedContext('bob').database();
    await assertFails(bob.ref('chats/c1/name').set('renamed'));
    await assertFails(bob.ref('chats/c1/admins/bob').set(true));
  });

  it('member can update allowed chat activity fields', async () => {
    await seedDirectChat();
    const alice = env.authenticatedContext('alice').database();
    await assertSucceeds(alice.ref('chats/c1/typing/alice').set(true));
    await assertSucceeds(alice.ref('chats/c1/ephemeralTTL').set(3600));
    await assertSucceeds(alice.ref('chats/c1/lastMessage').set({
      text: 'hello',
      senderId: 'alice',
      timestamp: Date.now(),
    }));
  });

  it('recipient can only write their own read receipt', async () => {
    await seedDirectChat();
    await seedMessage();
    const bob = env.authenticatedContext('bob').database();
    await assertSucceeds(bob.ref('messages/c1/m1/readBy/bob').set(true));
    await assertFails(bob.ref('messages/c1/m1/readBy/alice').set(true));
  });
});

describe('calls', () => {
  it('non-participant cannot read a call', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('calls/call1').set({
        chatId: 'c1',
        callerId: 'alice',
        callerName: 'Alice',
        callType: 'audio',
        status: 'ringing',
        participants: { alice: true, bob: true },
        createdAt: Date.now(),
      });
    });
    const eve = env.authenticatedContext('eve').database();
    await assertFails(eve.ref('calls/call1').get());
  });

  it('participant can read their own callsForUser index', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('callsForUser/bob/call1').set({
        status: 'ringing',
        callerId: 'alice',
      });
    });
    const bob = env.authenticatedContext('bob').database();
    await assertSucceeds(bob.ref('callsForUser/bob').get());
  });
});

describe('yapps', () => {
  it('non-author cannot edit someone else\'s yapp', async () => {
    await seedUser('alice');
    await seedUser('bob');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('yapps/y1').set({
        id: 'y1',
        authorId: 'alice',
        authorName: 'Alice',
        text: 'hi',
        timestamp: Date.now(),
        likeCount: 0,
        replyCount: 0,
        reyappCount: 0,
        privacy: 'public',
      });
    });
    const bob = env.authenticatedContext('bob').database();
    await assertFails(bob.ref('yapps/y1/text').set('pwned'));
  });
});
