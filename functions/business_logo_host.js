import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onCall } from 'firebase-functions/v2/https';
import { businessLogoStorage } from './business_logo_storage.js';
import { businessLogoConfiguration, businessLogoCallableOptions, createBusinessLogoRuntime } from './business_logo_runtime.js';
if (!getApps().length) initializeApp();
export const updateBusinessLogo = onCall(businessLogoCallableOptions, request => {
  if (!businessLogoConfiguration.enabled) return createBusinessLogoRuntime(null, null).update(request);
  const db = getFirestore(), bucket = getStorage().bucket();
  return createBusinessLogoRuntime(db, businessLogoStorage(bucket, db.projectId), businessLogoConfiguration).update(request);
});
