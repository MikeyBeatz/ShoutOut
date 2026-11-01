import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Timestamp} from 'firebase-admin/firestore';
import {maskDeletedAccountPublicIdentity as mask} from './account_public_identity.js';
import {maskDeletedAccountPublicIdentityLab as lab} from './account_public_identity_lab.js';
test('identity prototype requires a trusted identity and transaction fence before touching a database', async()=>{
  const db={projectId:'shoutout-rules-test'}, identity={projectId:db.projectId,userId:'valid_uid',requestCreateTime:Timestamp.now()};
  await assert.rejects(mask(identity,db,{}),/invalid-public-identity-options/);
  for(const userId of ['../other','',null])await assert.rejects(mask({...identity,userId},db,{}, {transactionGuard:()=>{}}),/invalid-public-identity-options/);
  await assert.rejects(mask({...identity,projectId:'other'},db,{}, {transactionGuard:()=>{}}),/invalid-public-identity-options/);
});
test('identity lab refuses both real Firebase projects before initializing clients',async()=>{
  for(const projectId of ['shoutout-dev-46c81','shoutout-production-a1b34'])await assert.rejects(lab({}, {projectId}, {}),/public-identity-emulator-required/);
});
