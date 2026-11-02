import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'shoutout-rules-test',firestore:{host:'127.0.0.1',port:8080,
 rules:readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8')}});});
after(async()=>{if(env){await env.clearFirestore();await env.cleanup();}});
const actor=uid=>env.authenticatedContext(uid,{email:`${uid}@example.test`,email_verified:true}).firestore();
for(const kind of ['moderator','seniorModerator','administrator','owner','legacy'])test(`${kind}: a pending or confirmed deletion cannot retain privileged reads and rollback restores the original role`,async()=>{
 await env.clearFirestore();const uid='retiring',db=actor(uid),paths=['businessProfiles/target','businessApplications/target','bans/target','contentRestrictions/target'];
 const role=kind==='legacy'?null:{role:kind,level:{moderator:3,seniorModerator:4,administrator:5,owner:6}[kind]};
 await env.withSecurityRulesDisabled(async c=>{const admin=c.firestore();for(const path of paths)await setDoc(doc(admin,path),{privateFixture:'retained'});
  await setDoc(doc(admin,`users/${uid}`),{nickname:'Staff'});await setDoc(doc(admin,`users/${uid}/legal/acceptance_2026_07_25`),{});
  await setDoc(doc(admin,role?`accountRoles/${uid}`:`moderators/${uid}`),role??{});
 });
 for(const path of paths)await assertSucceeds(getDoc(doc(db,path)));
 const roleRef=doc(db,role?`accountRoles/${uid}`:`moderators/${uid}`),beforeRole=(await getDoc(roleRef)).data();
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),`accountDeletionRequests/${uid}`),{userId:uid,status:'pending',requestedAt:new Date()}));
 for(const path of paths)await assertFails(getDoc(doc(db,path)));
 assert.deepEqual((await getDoc(roleRef)).data(),beforeRole);
 await assertFails(updateDoc(roleRef,{level:6}));
 await assertSucceeds(deleteDoc(doc(db,`accountDeletionRequests/${uid}`)));
 for(const path of paths)await assertSucceeds(getDoc(doc(db,path)));
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),`accountDeletionRequests/${uid}`),{userId:uid,status:'pending',requestedAt:new Date(),authDeletionConfirmedAt:new Date()}));
 for(const path of paths)await assertFails(getDoc(doc(db,path)));
 await assertFails(deleteDoc(doc(db,`accountDeletionRequests/${uid}`)));
 assert.deepEqual((await getDoc(roleRef)).data(),beforeRole);
 await env.withSecurityRulesDisabled(async c=>{
  await deleteDoc(doc(c.firestore(),`accountDeletionRequests/${uid}`));
  await updateDoc(doc(c.firestore(),roleRef.path),{accountStatus:'deleted'});
 });
 for(const path of paths)await assertFails(getDoc(doc(db,path)));
});
