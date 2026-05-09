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
  it('chat creation must be by and include the authenticated user', async () => {
    await seedUser('alice');
    await seedUser('bob');
    const alice = env.authenticatedContext('alice').database();

    await assertSucceeds(alice.ref('chats/c1').set({
      type: 'direct',
      members: { alice: true, bob: true },
      createdBy: 'alice',
      createdAt: Date.now(),
    }));

    await assertFails(alice.ref('chats/c2').set({
      type: 'direct',
      members: { bob: true },
      createdBy: 'alice',
      createdAt: Date.now(),
    }));

    await assertFails(alice.ref('chats/c3').set({
      type: 'direct',
      members: { alice: true, bob: true },
      createdBy: 'bob',
      createdAt: Date.now(),
    }));
  });

  it('member cannot add another user chat index unless they are contacts', async () => {
    await seedDirectChat();
    const alice = env.authenticatedContext('alice').database();

    await assertFails(alice.ref('userChats/bob/c1').set(true));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('contacts/bob/alice').set(true);
    });

    await assertSucceeds(alice.ref('userChats/bob/c1').set(true));
  });

  it('group admin can add an approved join requester to the chat index', async () => {
    await seedUser('alice');
    await seedUser('eve');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('chats/g1').set({
        type: 'group',
        name: 'Group',
        members: { alice: true },
        admins: { alice: true },
        pendingMembers: {
          eve: { type: 'request', fromUid: 'eve', fromName: 'Eve', timestamp: Date.now() },
        },
        createdBy: 'alice',
        createdAt: Date.now(),
      });
    });
    const alice = env.authenticatedContext('alice').database();
    await assertSucceeds(alice.ref('userChats/eve/g1').set(true));
  });

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

  it('member cannot spoof the synthetic system sender id', async () => {
    await seedDirectChat();
    const alice = env.authenticatedContext('alice').database();

    await assertFails(alice.ref('messages/c1/system-spoof').set({
      chatId: 'c1',
      senderId: 'system',
      senderName: 'System',
      text: 'Bob left the group',
      timestamp: Date.now(),
      type: 'system',
    }));

    await assertSucceeds(alice.ref('messages/c1/system-real-actor').set({
      chatId: 'c1',
      senderId: 'alice',
      senderName: 'Alice',
      text: 'Alice created the group',
      timestamp: Date.now(),
      type: 'system',
    }));
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
  async function seedYapp(id = 'y1', authorId = 'alice', privacy: 'public' | 'contacts' = 'public') {
    await seedUser(authorId);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref(`yapps/${id}`).set({
        id,
        authorId,
        authorName: authorId === 'alice' ? 'Alice' : 'Bob',
        text: 'hi',
        timestamp: Date.now(),
        likeCount: 0,
        replyCount: 0,
        reyappCount: 0,
        privacy,
      });
    });
  }

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

  it('author can edit text but cannot mutate identity or aggregate counts', async () => {
    await seedYapp();
    const alice = env.authenticatedContext('alice').database();

    await assertSucceeds(alice.ref().update({
      'yapps/y1/text': 'edited',
      'yapps/y1/edited': true,
      'yapps/y1/editedAt': Date.now(),
    }));

    await assertFails(alice.ref('yapps/y1/authorId').set('bob'));
    await assertFails(alice.ref('yapps/y1/likeCount').set(1));
    await assertFails(alice.ref('yapps/y1/replyCount').set(1));
    await assertFails(alice.ref('yapps/y1/reyappCount').set(1));
  });

  it('likes are stored per user while aggregate like count writes are denied', async () => {
    await seedYapp();
    await seedUser('bob');
    const bob = env.authenticatedContext('bob').database();

    await assertSucceeds(bob.ref('yappLikes/y1/bob').set(true));
    await assertFails(bob.ref('yapps/y1/likeCount').set(1));
  });

  it('reyapp index is allowed for public yapps and denied for contacts-only yapps', async () => {
    await seedYapp('original', 'alice', 'public');
    await seedYapp('private-original', 'alice', 'contacts');
    await seedYapp('reyapp-public', 'bob', 'public');
    await seedYapp('reyapp-private', 'bob', 'public');
    const bob = env.authenticatedContext('bob').database();

    await assertSucceeds(bob.ref().update({
      'yapps/reyapp-public/reyappOf': 'original',
      'yapps/reyapp-public/reyappByUid': 'bob',
      'yapps/reyapp-public/reyappByName': 'Bob',
    }));
    await assertSucceeds(bob.ref('reyappIds/original/reyapp-public').set(Date.now()));

    await assertFails(bob.ref().update({
      'yapps/reyapp-private/reyappOf': 'private-original',
      'yapps/reyapp-private/reyappByUid': 'bob',
      'yapps/reyapp-private/reyappByName': 'Bob',
    }));
  });
});
