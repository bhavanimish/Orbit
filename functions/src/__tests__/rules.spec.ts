import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';
import 'firebase/compat/firestore';

describe('Firestore Security Rules', () => {
  let testEnv: RulesTestEnvironment;

  const PROJECT_ID = 'orbit-pa';
  const ALICE_UID = 'alice_uid';
  const BOB_UID = 'bob_uid';

  before(async () => {
    const rulesPath = path.resolve(__dirname, '../../../firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules,
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  after(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  // -------------------------------------------------------------------
  // 1. Unauthenticated read/write denied everywhere
  // -------------------------------------------------------------------
  describe('Unauthenticated access', () => {
    it('denies read and write for unauthenticated requests on all collections', async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();

      await assertFails(unauthDb.collection('users').doc(ALICE_UID).get());
      await assertFails(
        unauthDb.collection('users').doc(ALICE_UID).set({
          ownerUid: ALICE_UID,
          email: 'alice@example.com',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      );

      await assertFails(unauthDb.collection('goals').doc('g1').get());
      await assertFails(
        unauthDb.collection('goals').doc('g1').set({
          ownerUid: ALICE_UID,
          title: 'Goal 1',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      );

      await assertFails(unauthDb.collection('tasks').doc('t1').get());
      await assertFails(
        unauthDb.collection('tasks').doc('t1').set({
          ownerUid: ALICE_UID,
          goalId: 'g1',
          title: 'Task 1',
          status: 'todo',
          priority: 'high',
          order: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      );

      await assertFails(unauthDb.collection('plans').doc('p1').get());
      await assertFails(unauthDb.collection('agentActions').doc('a1').get());
      await assertFails(unauthDb.collection('activityLogs').doc('log1').get());
    });
  });

  // -------------------------------------------------------------------
  // 2. Owner can read/write own user doc, goals, tasks
  // -------------------------------------------------------------------
  describe('Owner access to users, goals, tasks', () => {
    it('allows Alice to create, read, and update her own user document', async () => {
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
      const userRef = aliceDb.collection('users').doc(ALICE_UID);

      const now = Date.now();
      await assertSucceeds(
        userRef.set({
          ownerUid: ALICE_UID,
          email: 'alice@example.com',
          displayName: 'Alice M',
          createdAt: now,
          updatedAt: now,
        })
      );

      await assertSucceeds(userRef.get());

      await assertSucceeds(
        userRef.update({
          displayName: 'Alice In Wonderland',
          updatedAt: Date.now(),
        })
      );
    });

    it('allows Alice to create, read, and update her own goal, but not delete it', async () => {
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
      const goalRef = aliceDb.collection('goals').doc('goal_1');

      const now = Date.now();
      await assertSucceeds(
        goalRef.set({
          ownerUid: ALICE_UID,
          title: 'Master Data Structures',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
      );

      await assertSucceeds(goalRef.get());

      await assertSucceeds(
        goalRef.update({
          title: 'Master Algorithms & Data Structures',
          status: 'completed',
        })
      );

      // Goals are archived, not deleted
      await assertFails(goalRef.delete());
    });

    it('allows Alice to create, read, and update (but not delete) her own task', async () => {
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
      const taskRef = aliceDb.collection('tasks').doc('task_1');

      const now = Date.now();
      await assertSucceeds(
        taskRef.set({
          ownerUid: ALICE_UID,
          goalId: 'goal_1',
          title: 'Practice Binary Search Trees',
          status: 'todo',
          priority: 'high',
          order: 1,
          createdAt: now,
          updatedAt: now,
        })
      );

      await assertSucceeds(taskRef.get());

      await assertSucceeds(
        taskRef.update({
          status: 'done',
        })
      );

      // Tasks are cancelled, not deleted
      await assertFails(taskRef.delete());
    });
  });

  // -------------------------------------------------------------------
  // 3. User A cannot read or write user B's documents
  // -------------------------------------------------------------------
  describe('Cross-user isolation', () => {
    beforeEach(async () => {
      // Seed Alice's documents via admin context
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        const now = Date.now();

        await adminDb.collection('users').doc(ALICE_UID).set({
          ownerUid: ALICE_UID,
          email: 'alice@example.com',
          createdAt: now,
          updatedAt: now,
        });

        await adminDb.collection('goals').doc('alice_goal').set({
          ownerUid: ALICE_UID,
          title: 'Alice Private Goal',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });

        await adminDb.collection('tasks').doc('alice_task').set({
          ownerUid: ALICE_UID,
          goalId: 'alice_goal',
          title: 'Alice Task',
          status: 'todo',
          priority: 'medium',
          order: 0,
          createdAt: now,
          updatedAt: now,
        });

        await adminDb.collection('plans').doc('alice_plan').set({
          ownerUid: ALICE_UID,
          goalId: 'alice_goal',
          version: 1,
          status: 'proposed',
          providerMode: 'mock',
          summary: 'A secret plan',
          tasks: [],
          createdAt: now,
          updatedAt: now,
        });

        await adminDb.collection('agentActions').doc('alice_action').set({
          ownerUid: ALICE_UID,
          actionType: 'CREATE_TASK',
          payload: {},
          approvalStatus: 'pending',
          executionStatus: 'pending',
          idempotencyKey: 'key_123',
          createdAt: now,
          updatedAt: now,
        });

        await adminDb.collection('activityLogs').doc('alice_log').set({
          ownerUid: ALICE_UID,
          actionType: 'TASK_CREATED',
          entityType: 'task',
          summary: 'Created task',
          createdAt: now,
        });
      });
    });

    it("denies Bob from reading or modifying Alice's resources", async () => {
      const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();

      await assertFails(bobDb.collection('users').doc(ALICE_UID).get());
      await assertFails(
        bobDb.collection('users').doc(ALICE_UID).update({ displayName: 'Hacked' })
      );

      await assertFails(bobDb.collection('goals').doc('alice_goal').get());
      await assertFails(
        bobDb.collection('goals').doc('alice_goal').update({ title: 'Hacked' })
      );
      await assertFails(bobDb.collection('goals').doc('alice_goal').delete());

      await assertFails(bobDb.collection('tasks').doc('alice_task').get());
      await assertFails(
        bobDb.collection('tasks').doc('alice_task').update({ title: 'Hacked' })
      );

      await assertFails(bobDb.collection('plans').doc('alice_plan').get());
      await assertFails(bobDb.collection('agentActions').doc('alice_action').get());
      await assertFails(bobDb.collection('activityLogs').doc('alice_log').get());
    });
  });

  // -------------------------------------------------------------------
  // 4. Creating a goal or task with someone else's ownerUid is denied
  // -------------------------------------------------------------------
  describe('Impersonation prevention', () => {
    it("denies Alice from creating a goal with Bob's ownerUid", async () => {
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
      await assertFails(
        aliceDb.collection('goals').doc('spoofed_goal').set({
          ownerUid: BOB_UID,
          title: 'Spoofed Goal',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      );
    });

    it("denies Alice from creating a task with Bob's ownerUid", async () => {
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
      await assertFails(
        aliceDb.collection('tasks').doc('spoofed_task').set({
          ownerUid: BOB_UID,
          goalId: 'any_goal',
          title: 'Spoofed Task',
          status: 'todo',
          priority: 'low',
          order: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      );
    });
  });

  // -------------------------------------------------------------------
  // 5. Updating ownerUid or createdAt is denied
  // -------------------------------------------------------------------
  describe('Immutability checks', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        const now = 100000;
        await adminDb.collection('goals').doc('alice_goal').set({
          ownerUid: ALICE_UID,
          title: 'Goal A',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        await adminDb.collection('tasks').doc('alice_task').set({
          ownerUid: ALICE_UID,
          goalId: 'alice_goal',
          title: 'Task A',
          status: 'todo',
          priority: 'high',
          order: 0,
          createdAt: now,
          updatedAt: now,
        });
      });
    });

    it('denies changing ownerUid on an existing goal or task', async () => {
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();

      await assertFails(
        aliceDb.collection('goals').doc('alice_goal').update({
          ownerUid: BOB_UID,
        })
      );

      await assertFails(
        aliceDb.collection('tasks').doc('alice_task').update({
          ownerUid: BOB_UID,
        })
      );
    });

    it('denies altering createdAt timestamp on an existing goal or task', async () => {
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();

      await assertFails(
        aliceDb.collection('goals').doc('alice_goal').update({
          createdAt: 9999999,
        })
      );

      await assertFails(
        aliceDb.collection('tasks').doc('alice_task').update({
          createdAt: 9999999,
        })
      );
    });
  });

  // -------------------------------------------------------------------
  // 6. Clients cannot write plans, agentActions, activityLogs
  // -------------------------------------------------------------------
  describe('Backend-only write collections', () => {
    it('denies Alice from creating or updating plans, agentActions, activityLogs directly', async () => {
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
      const now = Date.now();

      // Client write to plans
      await assertFails(
        aliceDb.collection('plans').doc('p1').set({
          ownerUid: ALICE_UID,
          goalId: 'g1',
          version: 1,
          status: 'approved',
          providerMode: 'mock',
          summary: 'Client created plan',
          tasks: [],
          createdAt: now,
          updatedAt: now,
        })
      );

      // Client write to agentActions
      await assertFails(
        aliceDb.collection('agentActions').doc('a1').set({
          ownerUid: ALICE_UID,
          actionType: 'CREATE_TASK',
          payload: {},
          approvalStatus: 'approved',
          executionStatus: 'success',
          idempotencyKey: 'idemp_1',
          createdAt: now,
          updatedAt: now,
        })
      );

      // Client write to activityLogs
      await assertFails(
        aliceDb.collection('activityLogs').doc('l1').set({
          ownerUid: ALICE_UID,
          actionType: 'SOMETHING',
          entityType: 'goal',
          summary: 'Injected log',
          createdAt: now,
        })
      );
    });
  });

  // -------------------------------------------------------------------
  // 7. Invalid field types or oversized strings are denied
  // -------------------------------------------------------------------
  describe('Schema validation & bounds checks', () => {
    it('denies oversized title (>200 chars) on goals', async () => {
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
      const longTitle = 'a'.repeat(201);

      await assertFails(
        aliceDb.collection('goals').doc('g_long').set({
          ownerUid: ALICE_UID,
          title: longTitle,
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      );
    });

    it('denies invalid status enum on goals', async () => {
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();

      await assertFails(
        aliceDb.collection('goals').doc('g_bad_status').set({
          ownerUid: ALICE_UID,
          title: 'Valid Title',
          status: 'invalid_status_enum',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      );
    });

    it('denies non-integer order or invalid priority on tasks', async () => {
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();

      await assertFails(
        aliceDb.collection('tasks').doc('t_float').set({
          ownerUid: ALICE_UID,
          goalId: 'g1',
          title: 'Task Float Order',
          status: 'todo',
          priority: 'high',
          order: 1.5, // float is not int
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      );

      await assertFails(
        aliceDb.collection('tasks').doc('t_bad_prio').set({
          ownerUid: ALICE_UID,
          goalId: 'g1',
          title: 'Task Bad Priority',
          status: 'todo',
          priority: 'urgent', // not in low | medium | high
          order: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      );
    });

    it('denies unexpected extra fields on user document', async () => {
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();

      await assertFails(
        aliceDb.collection('users').doc(ALICE_UID).set({
          ownerUid: ALICE_UID,
          email: 'alice@example.com',
          role: 'admin', // disallowed injected field
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      );
    });
  });

  // -------------------------------------------------------------------
  // 8. Extra checks: positive reads, extra fields, required dates
  // -------------------------------------------------------------------
  describe('Additional checks', () => {
    const seedBackendDocs = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        const now = Date.now();
        await adminDb.collection('plans').doc('p_a').set({
          ownerUid: ALICE_UID,
          goalId: 'g',
          version: 1,
          status: 'proposed',
          providerMode: 'mock',
          summary: 's',
          tasks: [],
          createdAt: now,
          updatedAt: now,
        });
        await adminDb.collection('agentActions').doc('a_a').set({
          ownerUid: ALICE_UID,
          actionType: 'CREATE_TASK',
          payload: {},
          approvalStatus: 'pending',
          executionStatus: 'pending',
          idempotencyKey: 'k1',
          createdAt: now,
          updatedAt: now,
        });
        await adminDb.collection('activityLogs').doc('l_a').set({
          ownerUid: ALICE_UID,
          actionType: 'X',
          entityType: 'task',
          summary: 's',
          createdAt: now,
        });
      });
    };

    it('lets Alice read her own plans, agentActions and activityLogs', async () => {
      await seedBackendDocs();
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
      await assertSucceeds(aliceDb.collection('plans').doc('p_a').get());
      await assertSucceeds(aliceDb.collection('agentActions').doc('a_a').get());
      await assertSucceeds(aliceDb.collection('activityLogs').doc('l_a').get());
    });

    it('denies Alice updating or deleting her own plan', async () => {
      await seedBackendDocs();
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
      await assertFails(
        aliceDb.collection('plans').doc('p_a').update({ status: 'approved' })
      );
      await assertFails(aliceDb.collection('plans').doc('p_a').delete());
    });

    it('denies extra fields on goals and tasks', async () => {
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
      const now = Date.now();
      await assertFails(
        aliceDb.collection('goals').doc('g_extra').set({
          ownerUid: ALICE_UID,
          title: 'T',
          status: 'active',
          isAdmin: true,
          createdAt: now,
          updatedAt: now,
        })
      );
      await assertFails(
        aliceDb.collection('tasks').doc('t_extra').set({
          ownerUid: ALICE_UID,
          goalId: 'g1',
          title: 'T',
          status: 'todo',
          priority: 'low',
          order: 0,
          hacked: 'yes',
          createdAt: now,
          updatedAt: now,
        })
      );
    });

    it('denies a goal created without createdAt/updatedAt', async () => {
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
      await assertFails(
        aliceDb.collection('goals').doc('g_nodate').set({
          ownerUid: ALICE_UID,
          title: 'T',
          status: 'active',
        })
      );
    });

    it('denies Alice creating a user document at another uid', async () => {
      const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
      const now = Date.now();
      await assertFails(
        aliceDb.collection('users').doc(BOB_UID).set({
          ownerUid: BOB_UID,
          email: 'bob@example.com',
          createdAt: now,
          updatedAt: now,
        })
      );
    });
  });
});