enum BusinessApplicationGateState {
  ordinaryAccount,
  awaitingActivation,
  activeBusiness,
  suspendedBusiness,
}

bool requiresBusinessActivationChecks(
  String? applicationStatus, {
  bool allowSuspended = false,
}) =>
    applicationStatus == 'active' ||
    allowSuspended && applicationStatus == 'suspended';

BusinessApplicationGateState resolveBusinessApplicationGateState({
  required bool applicationExists,
  Map<String, dynamic>? role,
  required bool businessProfileExists,
  Map<String, dynamic>? businessProfile,
  bool allowSuspended = false,
}) {
  if (!applicationExists) {
    return BusinessApplicationGateState.ordinaryAccount;
  }
  final isBusiness = role?['role'] == 'business' || role?['level'] == 2;
  if (allowSuspended &&
      isBusiness &&
      businessProfileExists &&
      businessProfile?['status'] == 'suspended') {
    return BusinessApplicationGateState.suspendedBusiness;
  }
  if (isBusiness &&
      businessProfileExists &&
      businessProfile?['status'] == 'active') {
    return BusinessApplicationGateState.activeBusiness;
  }
  return BusinessApplicationGateState.awaitingActivation;
}
