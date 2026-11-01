import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {maskDeletedAccountPublicIdentityLab as mask} from './account_public_identity_lab.js';
const enabled=process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8080';
const app=enabled?initializeApp({projectId:'shoutout-rules-test'},'public-identity-tests'):null;
const db=app?getFirestore(app):null,roots=[];
const missing={getUser(){throw Object.assign(new Error('missing'),{code:'auth/user-not-found'});}};
after(async()=>{if(!app)return;for(const root of roots)await db.recursiveDelete(root);await db.terminate();await deleteApp(app);});
async function fixture(){
 const uid=randomUUID(),key='user_'+uid.replaceAll('-','').slice(0,12);
 const request=db.doc('accountDeletionRequests/'+uid),user=db.doc('users/'+uid),profile=db.doc('publicProfiles/'+uid),name=db.doc('nicknames/'+key),progress=db.doc('identityLabState/'+uid);
 const business=db.doc('businessProfiles/'+uid),role=db.doc('accountRoles/'+uid);
 roots.push(request,user,profile,name,progress,business,role);
 await user.set({nickname:key,nicknameLower:key,email:'retain@example.test',avatarId:'fox'});
 await user.collection('legal').doc('fixture').set({retained:true});await business.set({status:'active',billingEmail:'retained@example.test'});await role.set({role:'business',level:2});
 await profile.set({nickname:key,avatarId:'fox',publicRole:'business',businessLogoPath:`businessLogos/${uid}/logo-1.png`,businessLogoVersion:1});
 await name.set({uid,nickname:key,nicknameLower:key,createdAt:Timestamp.now()});await request.set({userId:uid,status:'pending'});await progress.set({lease:'first',leaseUntil:Timestamp.fromMillis(Date.now()+120000),maskedCount:0});
 const identity={projectId:db.projectId,userId:uid,requestCreateTime:(await request.get()).createTime};let millis=Date.now();
 const options={clock:()=>new Date(millis),transactionGuard:async(transaction,change)=>{const p=await transaction.get(progress);if(p.data().lease!=='first'||p.data().leaseUntil.toMillis()<=millis)throw new Error('lease-lost');return ()=>{if(change.changed)transaction.update(progress,{maskedCount:p.data().maskedCount+1});};}};
 return {uid,key,request,user,profile,name,progress,business,role,identity,options,tick:n=>{millis=n;}};
}
test('public identity becomes minimal while the owned nickname, private/legal, Business profile and role stay byte-for-byte unchanged',{skip:!enabled},async()=>{
 const f=await fixture(),refs=[f.name,f.user,f.business,f.role,f.user.collection('legal').doc('fixture')],before=await db.getAll(...refs);
 const result=await mask(f.identity,db,missing,f.options);assert.equal(result.changed,true);assert.equal(result.reservationKey,f.key);assert.equal(result.retainUntil.toMillis()-f.identity.requestCreateTime.toMillis(),60*86400000);
 assert.deepEqual((await f.profile.get()).data(),{schemaVersion:1,accountStatus:'deleted'});
 const after=await db.getAll(...refs);after.forEach((d,i)=>{assert.deepEqual(d.data(),before[i].data());assert(d.updateTime.isEqual(before[i].updateTime));});assert.equal((await f.progress.get()).data().maskedCount,1);
 const masked=await f.profile.get();await f.progress.update({leaseUntil:Timestamp.fromMillis(Date.now()+7200000)});f.tick(Date.now()+3600000);const retry=await mask(f.identity,db,missing,f.options);assert.equal(retry.changed,false);assert(retry.retainUntil.isEqual(result.retainUntil));assert((await f.profile.get()).updateTime.isEqual(masked.updateTime));assert.equal((await f.progress.get()).data().maskedCount,1);
});
test('present Auth or an Auth outage cannot authorize masking',{skip:!enabled},async()=>{
 const f=await fixture(),before=await f.profile.get();assert.equal((await mask(f.identity,db,{getUser:()=>({uid:f.uid})},f.options)).state,'waiting-for-auth-deletion');
 await assert.rejects(mask(f.identity,db,{getUser(){throw new Error('Auth outage');}},f.options),/Auth outage/);assert((await f.profile.get()).updateTime.isEqual(before.updateTime));
});
test('foreign or missing nickname reservation is never changed or released',{skip:!enabled},async()=>{
 const f=await fixture(),before=await f.profile.get();await f.name.update({uid:'other-account'});const foreign=await f.name.get();await assert.rejects(mask(f.identity,db,missing,f.options),/nickname-reservation-not-owned/);assert((await f.name.get()).updateTime.isEqual(foreign.updateTime));assert((await f.profile.get()).updateTime.isEqual(before.updateTime));
 await f.name.delete();await assert.rejects(mask(f.identity,db,missing,f.options),/nickname-reservation-not-owned/);assert.equal((await f.name.get()).exists,false);
});
test('lease loss rolls back both the public marker and its progress record',{skip:!enabled},async()=>{
 const f=await fixture(),before=await f.profile.get();await assert.rejects(mask(f.identity,db,missing,{...f.options,beforeTransaction:()=>f.progress.update({lease:'replacement'})}),/lease-lost/);assert((await f.profile.get()).updateTime.isEqual(before.updateTime));assert.equal((await f.progress.get()).data().maskedCount,0);
});
test('replacement or withdrawal of the deletion request stops the transaction',{skip:!enabled},async()=>{
 for(const replacement of [false,true]){const f=await fixture(),before=await f.profile.get();await assert.rejects(mask(f.identity,db,missing,{...f.options,beforeTransaction:async()=>{await f.request.delete();if(replacement)await f.request.set({userId:f.uid,status:'pending'});}}));assert((await f.profile.get()).updateTime.isEqual(before.updateTime));}
});
test('unknown public fields or children are preserved for review',{skip:!enabled},async()=>{
 for(const children of [false,true]){const f=await fixture();if(children)await f.profile.collection('unexpected').doc('child').set({keep:true});else await f.profile.update({unknown:'keep'});const before=await f.profile.get();await assert.rejects(mask(f.identity,db,missing,f.options),/unexpected-public/);assert((await f.profile.get()).updateTime.isEqual(before.updateTime));if(children)assert.equal((await f.profile.collection('unexpected').doc('child').get()).exists,true);}
});
test('missing public profile receives a marker instead of falling back to stale author names',{skip:!enabled},async()=>{
 const f=await fixture();await f.profile.delete();await mask(f.identity,db,missing,f.options);assert.deepEqual((await f.profile.get()).data(),{schemaVersion:1,accountStatus:'deleted'});
});
test('the exact original 60-day deadline refuses new identity work without extending reservation',{skip:!enabled},async()=>{
 const f=await fixture(),before=await f.name.get();f.tick(f.identity.requestCreateTime.toMillis()+60*86400000);await assert.rejects(mask(f.identity,db,missing,f.options),/identity-retention-expired/);assert((await f.name.get()).updateTime.isEqual(before.updateTime));assert.equal((await f.profile.get()).data().nickname,f.key);
});
test('a progress write failure rolls the identity replacement back atomically',{skip:!enabled},async()=>{
 const f=await fixture(),before=await f.profile.get();await assert.rejects(mask(f.identity,db,missing,{...f.options,transactionGuard:async()=>()=>{throw new Error('progress-write-failed');}}),/progress-write-failed/);assert((await f.profile.get()).updateTime.isEqual(before.updateTime));
});
test('an expired caller lease cannot write the public marker',{skip:!enabled},async()=>{
 const f=await fixture(),before=await f.profile.get();f.tick((await f.progress.get()).data().leaseUntil.toMillis());await assert.rejects(mask(f.identity,db,missing,f.options),/lease-lost/);assert((await f.profile.get()).updateTime.isEqual(before.updateTime));
});
test('lost transaction acknowledgement does not duplicate progress or extend the nickname deadline',{skip:!enabled},async()=>{
 const f=await fixture();let lost=false;
 const proxy={projectId:db.projectId,doc:db.doc.bind(db),collection:db.collection.bind(db),runTransaction:async(...args)=>{const result=await db.runTransaction(...args);if(!lost){lost=true;throw new Error('lost acknowledgement');}return result;}};
 await assert.rejects(mask(f.identity,proxy,missing,f.options),/lost acknowledgement/);const before=await f.profile.get();assert.equal((await f.progress.get()).data().maskedCount,1);
 const replay=await mask(f.identity,db,missing,f.options);assert.equal(replay.changed,false);assert.equal(replay.retainUntil.toMillis()-f.identity.requestCreateTime.toMillis(),60*86400000);assert((await f.profile.get()).updateTime.isEqual(before.updateTime));assert.equal((await f.progress.get()).data().maskedCount,1);
});
