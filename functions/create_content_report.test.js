import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { validateContentReport, nextReportRate, createContentReportOperation } from './create_content_report.js';

const valid = { idempotencyKey: 'first', shoutId: 'shout', targetType: 'shout', reason: 'Spam' };
test('content reports accept only supported targets and caller intent, never snapshots or moderation fields', () => {
  assert.deepEqual(validateContentReport(valid), valid);
  for (const targetType of ['comment','privateReply']) {
    assert.equal(validateContentReport({ ...valid, targetType, targetId:'child' }).targetId,'child');
    assert.throws(() => validateContentReport({ ...valid, targetType }), e => e.code === 'invalid-argument');
  }
  for (const change of [{targetType:'account'}, {targetType:'bug'}, {targetType:'__proto__'},
    {targetType:{toString:null}}, {targetId:'child'}, {shoutId:'a/b'}, {idempotencyKey:''},
    {reason:''}, {reason:'😀'.repeat(501)}, {expectedUserId:'a/b'}, {reporterId:'forged'},
    {authorId:'forged'}, {text:'forged'}, {status:'closed'}, {priority:'high'}, {createdAt:0}]) {
    assert.throws(() => validateContentReport({ ...valid, ...change }), e => e.code === 'invalid-argument');
  }
  for (const input of [null,[],42]) assert.throws(() => validateContentReport(input), e => e.code === 'invalid-argument');
  assert.doesNotThrow(() => validateContentReport({...valid, reason:'😀'.repeat(500)}));
});

test('report rate keeps the shared twenty-per-day maximum and exact one-minute cooldown', () => {
  const now=Timestamp.fromMillis(172800000);
  const old={lastAt:Timestamp.fromMillis(now.toMillis()-59999),windowStartedAt:Timestamp.fromMillis(now.toMillis()-100000),count:19};
  assert.throws(()=>nextReportRate(old,now,'report'),e=>e.code==='resource-exhausted');
  old.lastAt=Timestamp.fromMillis(now.toMillis()-60000);
  assert.equal(nextReportRate(old,now,'report').count,20);
  old.count=20;
  assert.throws(()=>nextReportRate(old,now,'report'),e=>e.code==='resource-exhausted');
  old.windowStartedAt=Timestamp.fromMillis(now.toMillis()-86400000);
  assert.equal(nextReportRate(old,now,'report').count,1);
  for(const corrupt of [{count:0},{count:1.5},{lastAt:0},{windowStartedAt:null}]) {
    assert.throws(()=>nextReportRate({...old,...corrupt},now,'report'),e=>e.code==='failed-precondition');
  }
});

test('identity, attestation, verification and expected account are checked before database access', async () => {
  const request={auth:{uid:'reader',token:{email_verified:true,email:'reader@example.test'}},app:{appId:'web'},data:valid};
  for (const change of [{auth:null},{app:null},{auth:{uid:'reader',token:{email_verified:false,email:'reader@example.test'}}},
    {data:{...valid,expectedUserId:'other'}}]) {
    await assert.rejects(createContentReportOperation({...request,...change},null),e=>['unauthenticated','permission-denied'].includes(e.code));
  }
});
