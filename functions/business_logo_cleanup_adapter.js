import { businessLogoConfiguration, createBusinessLogoRuntime } from './business_logo_runtime.js';

// Composed after parent retention/queue and its global time reserve. Disabled configuration
// performs no database/Storage calls and does not construct a Storage client.
export async function runBusinessLogoMaintenance(db, storageFactory, options = businessLogoConfiguration) {
  if (options.enabled !== true) return { status: 'disabled', examined: 0 };
  return createBusinessLogoRuntime(db, storageFactory(), options).maintenance();
}
