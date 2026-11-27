import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {archiveReleaseConfiguration,archiveFunctionGroups,prepareArchiveDevRelease} from './archive_dev_release.mjs';
const root=resolve(import.meta.dirname,'..'),config=JSON.parse(readFileSync(resolve(root,'config/dev.json'),'utf8')),
  rules=readFileSync(resolve(root,'firestore.rules'),'utf8');
test('capture, active and compatible fallback pair the same new legal policy with sticky purge',()=>{
  for(const phase of ['capture','active','rollback']){
    const result=archiveReleaseConfiguration(config,rules,phase);
    assert.equal(result.web.legalVersion,'2026-11-27');assert.equal(result.web.serverContentLifecycle,phase!=='capture');
    assert.equal(result.web.serverArchiveIdentity,phase!=='capture');assert(result.profile.identityPurge);
    assert.equal(result.profile.maintenance,phase==='active');assert(!result.rules.includes('acceptance_2026_07_25'));
    assert(result.rules.includes('acceptance_2026_11_27'));
  }
  assert.throws(()=>archiveReleaseConfiguration({...config,hostingSite:'production'},rules,'active'),/explicit-dev/);
  assert.throws(()=>archiveReleaseConfiguration(config,rules,'off'),/explicit-dev/);
  assert.throws(()=>archiveReleaseConfiguration(config,rules.replace('content-lifecycle-gate','changed'),'active'),/gate-drift/);
  const names=Object.values(archiveFunctionGroups).flatMap(g=>g.names);assert.equal(names.length,31);assert.equal(new Set(names).size,31);
});
test('materialized modules include the real phase and identity policy without laboratory/test code',()=>{
  const result=prepareArchiveDevRelease(root);
  for(const artifact of Object.values(result.manifest.functions)){
    assert(artifact.hashes['archive_deployment.js']);assert(artifact.hashes['legal_policy.js']);
    assert(Object.keys(artifact.hashes).every(name=>!/(?:_lab|\.test)\.js$/.test(name)));
    const pkg=JSON.parse(readFileSync(resolve(artifact.source,'package.json'),'utf8'));assert.equal(pkg.engines.node,'22');
    assert(!pkg.scripts);
  }
  assert.throws(()=>prepareArchiveDevRelease(root,'active'),/committed-phase/);
});
