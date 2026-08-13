enum BusinessApplicationGateState {
  ordinaryAccount,
  awaitingActivation,
  activeBusiness,
}

bool requiresBusinessActivationChecks(String? applicationStatus) =>
    applicationStatus == 'active';

BusinessApplicationGateState resolveBusinessApplicationGateState({
  required bool applicationExists,
  Map<String, dynamic>? role,
  required bool businessProfileExists,
  Map<String, dynamic>? businessProfile,
}) {
  if (!applicationExists) {
    return BusinessApplicationGateState.ordinaryAccount;
  }
  final isBusiness = role?['role'] == 'business' || role?['level'] == 2;
  if (isBusiness &&
      businessProfileExists &&
      businessProfile?['status'] == 'active') {
    return BusinessApplicationGateState.activeBusiness;
  }
  return BusinessApplicationGateState.awaitingActivation;
}
