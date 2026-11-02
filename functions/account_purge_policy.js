import { FieldValue } from 'firebase-admin/firestore';
import { AccountPurgeNeedsReview } from './account_purge_guard.js';

const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const queryStage = (collection, field, action = 'delete', group = false, operator = '==') =>
  ({ collection, field, action, group, operator });

export function accountPurgeStages(uid) {
  return [
    queryStage('shouts', 'authorId', 'freeze'),
    queryStage('reactions', 'actorId', 'delete', true), // Archived copies, not live counter-bearing votes.
    queryStage('accessAudits', 'actorId', 'delete', true),
    queryStage('accountContentArchive', 'subjectUserIds', 'archive', false, 'array-contains'),
    queryStage('comments', 'authorId', 'comment', true),
    queryStage('privateReplies', 'authorId', 'privateReply', true),
    queryStage('privateReplies', 'recipientId', 'privateReply', true),
    queryStage('reactions', 'userId', 'reaction', true),
    queryStage('saves', 'userId', 'save', true),
    queryStage('notifications', 'actorId', 'delete', true),
    queryStage('following', 'targetUserId', 'delete', true),
    queryStage('blocked', 'targetUserId', 'delete', true),
    ...['reports', 'commentReports', 'privateReplyReports', 'accountReports'].map(c => queryStage(c, 'reporterId', 'report')),
    queryStage('privateReplyReports', 'authorId', 'report'), queryStage('accountReports', 'targetUserId', 'report'),
    ...['sanctions', 'warnings', 'sanctionRevocations', 'bugReports', 'clientErrorLogs', 'technicalLogAccessAudits', 'serverOperations'].map(c => queryStage(c, 'userId')),
    ...['authorId', 'recipientId', 'reporterId'].map(field => queryStage('sanctions', `contentSnapshot.${field}`, 'evidence')),
    queryStage('serverOperations', 'authorId'), queryStage('businessActivationAudits', 'applicationId'),
    ...['sanctions', 'warnings', 'moderationClearances'].map(c => queryStage(c, 'moderatorId', 'scrub')),
    queryStage('sanctionRevocations', 'revokedBy', 'scrub'),
    queryStage('businessActivationAudits', 'administratorId', 'scrub'),
    queryStage('businessApplications', 'activatedBy', 'scrub'),
    queryStage('accountRoles', 'grantedBy', 'scrub'), queryStage('moderators', 'grantedBy', 'scrub'),
    queryStage('accountRoles', 'assignedBy', 'scrub'), queryStage('moderators', 'assignedBy', 'scrub'),
    queryStage('shouts', 'authorId', 'shout'),
    { action: 'storage', prefix: `businessLogos/${uid}/` },
    { action: 'storage', prefix: `bugReports/${uid}/` },
    ...['businessProfiles', 'businessApplications', 'rateLimits', 'bans', 'contentRestrictions', 'accountRoles', 'moderators', 'users']
      .map(collection => ({ action: 'delete', direct: `${collection}/${uid}` })),
  ];
}

export function queryAccountPurgeStage(db, stage, uid) {
  return (stage.group ? db.collectionGroup(stage.collection) : db.collection(stage.collection))
    .where(stage.field, stage.operator ?? '==', uid).limit(1);
}

export function validatePurgeSelection(snapshot, stage, uid) {
  if (stage.direct) return snapshot.ref.path === stage.direct;
  const parts = snapshot.ref.path.split('/'), value = snapshot.get(stage.field);
  if (stage.operator === 'array-contains' ? !Array.isArray(value) || !value.includes(uid) : value !== uid) return false;
  if (!stage.group) {
    if (parts.length !== 2 || parts[0] !== stage.collection) return false;
    if (stage.collection === 'accountContentArchive') {
      const data = snapshot.data();
      if (data.kind === 'comment') return data.content?.authorId === uid;
      if (data.kind === 'privateReply') return data.content?.authorId === uid || data.content?.recipientId === uid;
      return ['shoutReaction', 'commentReaction'].includes(data.kind) && data.retentionOwnerId === uid && data.sourcePath?.split('/').at(-1) === uid;
    }
    return true;
  }
  if (stage.collection === 'comments' || stage.collection === 'privateReplies') {
    return parts.length === 4 && parts[0] === 'shouts' && parts[2] === stage.collection && id(parts[1]) && id(parts[3]);
  }
  if (['following', 'blocked', 'notifications'].includes(stage.collection)) {
    return parts.length === 4 && parts[0] === 'users' && parts[2] === stage.collection && id(parts[1]) &&
      (stage.collection === 'notifications' || parts[3] === uid);
  }
  if (stage.field === 'actorId') {
    return parts.length === 4 && parts[0] === 'accountContentArchive' && parts[2] === stage.collection &&
      (stage.collection !== 'reactions' || parts[3] === uid);
  }
  return parts[0] === 'shouts' && parts.at(-1) === uid &&
    (parts.length === 4 && parts[2] === stage.collection ||
      stage.collection === 'reactions' && parts.length === 6 && parts[2] === 'comments' && parts[4] === 'reactions');
}

export function purgeSourceIdentity(snapshot, action) {
  if (action === 'report') return { kind: 'report', reportId: snapshot.id };
  const data = snapshot.data(), sourcePath = action === 'archive' ? data.sourcePath : snapshot.ref.path;
  if (action === 'archive' && !['comment', 'privateReply', 'shoutReaction', 'commentReaction'].includes(data.kind)) {
    throw new AccountPurgeNeedsReview('unknown-purge-archive-kind');
  }
  const kind = action === 'archive' ? data.kind : action;
  const parts = sourcePath?.split('/') ?? [];
  if (['shout', 'comment', 'privateReply'].includes(kind) &&
      (parts[0] !== 'shouts' || !id(parts[1]) ||
        kind !== 'shout' && (parts.length !== 4 || parts[2] !== (kind === 'comment' ? 'comments' : 'privateReplies') || !id(parts[3])))) {
    throw new AccountPurgeNeedsReview('unknown-purge-source-path');
  }
  return { kind, shoutId: parts[1] ?? null, childId: parts[3] ?? null,
    archived: action === 'archive', originalCreateTime: action === 'archive' ? data.sourceCreateTime ?? null : snapshot.createTime };
}

export function accountPurgeLinks(source) {
  const { kind, shoutId, childId } = source;
  if (kind === 'report') return [
    { collection: 'sanctions', filters: [['sourceReportId', source.reportId]], action: 'copiedReport' },
    { collection: 'moderationClearances', filters: [['sourceReportIds', source.reportId, 'array-contains']], action: 'reportReference', reportId: source.reportId },
  ];
  if (kind === 'comment') return [
    { collection: `shouts/${shoutId}/comments`, filters: [['replyToCommentId', childId]], action: 'reply' },
    { collection: 'accountContentArchive', filters: [['sourceShoutId', shoutId], ['replyToCommentId', childId]], action: 'archivedReply' },
    { collection: 'sanctions', filters: [['contentSnapshot.shoutId', shoutId], ['contentSnapshot.replyToCommentId', childId]], action: 'sanctionReply' },
    { collection: 'commentReports', filters: [['shoutId', shoutId], ['commentId', childId]], action: 'delete' },
    { direct: `moderationClearances/comment_${shoutId}_${childId}`, action: 'delete' },
  ];
  if (kind === 'privateReply') return [
    { collection: 'privateReplyReports', filters: [['shoutId', shoutId], ['privateReplyId', childId]], action: 'delete' },
    { direct: `moderationClearances/privateReply_${shoutId}_${childId}`, action: 'delete' },
  ];
  if (kind === 'shout') return [
    { collection: 'notifications', group: true, filters: [['targetShoutId', shoutId]], action: 'title' },
    { collection: 'reports', filters: [['shoutId', shoutId]], action: 'delete' },
    { direct: `moderationClearances/shout_${shoutId}`, action: 'delete' },
    { collection: `shouts/${shoutId}/reactions`, filters: [], action: 'delete' },
    { collection: `shouts/${shoutId}/saves`, filters: [], action: 'delete' },
  ];
  return [];
}

function stripAutomaticReplyPrefix(data) {
  if (typeof data.replyToNickname !== 'string' || typeof data.text !== 'string') return {};
  const prefix = '@' + data.replyToNickname;
  return data.text === prefix || data.text.startsWith(prefix + ' ') || data.text.startsWith(prefix + '\n')
    ? { text: data.text.slice(prefix.length).trimStart() } : {};
}

export function purgeScrubPatch(data, action, field = null, link = null) {
  const remove = FieldValue.delete();
  if (action === 'reply') return { replyToCommentId: remove, replyToNickname: remove, ...stripAutomaticReplyPrefix(data) };
  if (action === 'archivedReply') {
    const text = stripAutomaticReplyPrefix(data.content ?? {});
    return { replyToCommentId: remove, 'content.replyToCommentId': remove, 'content.replyToNickname': remove,
      ...(Object.hasOwn(text, 'text') ? { 'content.text': text.text } : {}) };
  }
  if (action === 'sanctionReply') {
    const text = stripAutomaticReplyPrefix(data.contentSnapshot ?? {});
    return { 'contentSnapshot.replyToCommentId': remove, 'contentSnapshot.replyToNickname': remove,
      ...(Object.hasOwn(text, 'text') ? { 'contentSnapshot.text': text.text } : {}) };
  }
  if (action === 'title') return { targetTitle: '', targetShoutId: remove };
  if (action === 'copiedReport') return { contentSnapshot: remove, reason: remove, sourceReportId: remove };
  if (action === 'reportReference') return { sourceReportIds: FieldValue.arrayRemove(link.reportId), reason: remove };
  return { [field]: remove };
}
