// Signed cursors are readable: never place private point coordinates in them.
export function packDeltaPosition(position) {
  if (!position) return position;
  const route = row => ({ id: row.id, geohash: row.geohash });
  return { ...(position.after ? { after: position.after } : {}), ...(position.dropped === undefined ? {} : { dropped: position.dropped }),
    ...(position.pending ? { pending: position.pending.map(route) } : {}),
    ...(position.candidates ? { candidates: position.candidates.map(route) } : {}),
    ...(position.frontier ? { frontier: position.frontier.map(({ hash, path, exact }) => ({ hash, path, exact })) } : {}) };
}
