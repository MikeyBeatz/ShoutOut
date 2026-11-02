export const purgedShoutContext = Object.freeze({ schemaVersion: 1, status: 'deleted', contentPurged: true });
export const isPurgedShoutContext = data => data?.schemaVersion === 1 && data.status === 'deleted' && data.contentPurged === true;
