import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {before,after,beforeEach,test} from 'node:test';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,deleteDoc} from 'firebase/firestore';
import {ref,uploadBytes,getBytes,getDownloadURL,updateMetadata,deleteObject} from 'firebase/storage';
const projectId='shoutout-rules-test';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST,'127.0.0.1:9199');
let env;
before(async()=>{env=await initializeTestEnvironment({projectId,
 firestore:{host:'127.0.0.1',port:8080,rules:readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8')},
 storage:{host:'127.0.0.1',port:9199,rules:readFileSync(new URL('../../storage.rules',import.meta.url),'utf8')},
});});
after(async()=>{if(env){await env.clearStorage();await env.clearFirestore();await env.cleanup();}});
beforeEach(async()=>{await env.clearStorage();await env.clearFirestore();});
const actor=(uid,verified=true)=>env.authenticatedContext(uid,{email:uid+'@example.test',email_verified:verified});
const logo=context=>ref(context.storage(), 'businessLogos/owner/logo-1.png');
async function seed(){await env.withSecurityRulesDisabled(async context=>{
 const db=context.firestore();await setDoc(doc(db,'accountRoles/owner'),{role:'business',level:2});
 await setDoc(doc(db,'publicProfiles/owner'),{nickname:'Original business'});
 await uploadBytes(logo(context),new Uint8Array([1,2,3]),{contentType:'image/png'});
});}
test('verified clients still read an active Business logo; anonymous and unverified clients cannot',async()=>{
 await seed();const bytes=await assertSucceeds(getBytes(logo(actor('viewer'))));assert.equal(bytes.byteLength,3);
 await assertSucceeds(getBytes(logo(actor('owner'))));await assertFails(getBytes(logo(env.unauthenticatedContext())));await assertFails(getBytes(logo(actor('unverified',false))));
});
test('a server-side deleted identity blocks SDK logo reads for owner, ordinary users and all staff roles',async()=>{
 await seed();await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'publicProfiles/owner'),{schemaVersion:1,accountStatus:'deleted'});for(let n=1;n<=6;n++)await setDoc(doc(c.firestore(),'accountRoles/role'+n),{level:n});});
 for(const uid of ['owner','viewer',...Array.from({length:6},(_,i)=>'role'+(i+1))])await assertFails(getBytes(logo(actor(uid))));
});
test('an old owner token cannot overwrite, delete or inject a fresh download token after masking',async()=>{
 await seed();await assertSucceeds(uploadBytes(logo(actor('owner')),new Uint8Array([1,2,3]),{contentType:'image/png'}));
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'publicProfiles/owner'),{schemaVersion:1,accountStatus:'deleted'}));
 await assertFails(uploadBytes(logo(actor('owner')),new Uint8Array([4,5,6]),{contentType:'image/png'}));
 await assertFails(uploadBytes(ref(actor('owner').storage(),'businessLogos/owner/logo-2.png'),new Uint8Array([4]),{contentType:'image/png'}));
 await assertFails(updateMetadata(logo(actor('owner')),{customMetadata:{firebaseStorageDownloadTokens:'attacker-selected-token'}}));
 await assertFails(deleteObject(logo(actor('owner'))));
});
test('missing legacy public profiles keep the previous logo read behavior',async()=>{
 await seed();await env.withSecurityRulesDisabled(c=>deleteDoc(doc(c.firestore(),'publicProfiles/owner')));await assertSucceeds(getBytes(logo(actor('viewer'))));
});
test('previously issued token URLs need server-side revocation in the later integration step',async()=>{
 await seed();const url=await getDownloadURL(logo(actor('viewer')));assert.equal(new URL(url).host,'127.0.0.1:9199');
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'publicProfiles/owner'),{schemaVersion:1,accountStatus:'deleted'}));
 await assertFails(getDownloadURL(logo(actor('viewer'))));
 // Known remaining gap: an SDK rule is not revocation of a bearer URL.
 const oldUrl=await fetch(url);assert.equal(oldUrl.status,200);assert.equal((await oldUrl.arrayBuffer()).byteLength,3);
});
test('a pending request alone does not masquerade as confirmed Auth removal',async()=>{
 await seed();await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'accountDeletionRequests/owner'),{userId:'owner',status:'pending'}));await assertSucceeds(getBytes(logo(actor('viewer'))));
});
test('clients cannot forge, remove or restore a server-written deleted public identity',async()=>{
 await seed();await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await setDoc(doc(db,'users/owner'),{nickname:'Owner',nicknameLower:'owner'});await setDoc(doc(db,'users/owner/legal/acceptance_2026_07_25'),{});await setDoc(doc(db,'accountDeletionRequests/owner'),{userId:'owner',status:'pending'});await setDoc(doc(db,'publicProfiles/owner'),{schemaVersion:1,accountStatus:'deleted'});});
 const db=actor('owner').firestore();await assertFails(setDoc(doc(db,'publicProfiles/owner'),{nickname:'Restored'}));await assertFails(deleteDoc(doc(db,'publicProfiles/owner')));await assertFails(setDoc(doc(actor('viewer').firestore(),'publicProfiles/viewer'),{schemaVersion:1,accountStatus:'deleted'}));
});
test('the independent bug screenshot owner and support-staff access remains intact',async()=>{
 const path='bugReports/reporter/bug/screenshot';await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'bugReports/bug'),{userId:'reporter',status:'open',screenshotPath:path,screenshotContentType:'image/png',screenshotSize:3});await setDoc(doc(c.firestore(),'accountRoles/support'),{level:5});});
 await assertSucceeds(uploadBytes(ref(actor('reporter').storage(),path),new Uint8Array([1,2,3]),{contentType:'image/png'}));
 await assertSucceeds(getBytes(ref(actor('reporter').storage(),path)));await assertSucceeds(getBytes(ref(actor('support').storage(),path)));await assertFails(getBytes(ref(actor('other').storage(),path)));
});
