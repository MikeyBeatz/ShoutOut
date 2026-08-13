import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/business_application_state.dart';

void main() {
  test('ordinary account without a Business application continues', () {
    expect(
      resolveBusinessApplicationGateState(
        applicationExists: false,
        businessProfileExists: false,
      ),
      BusinessApplicationGateState.ordinaryAccount,
    );
  });

  test('verified applicant waits without trusted activation', () {
    expect(
      resolveBusinessApplicationGateState(
        applicationExists: true,
        businessProfileExists: false,
      ),
      BusinessApplicationGateState.awaitingActivation,
    );
    expect(
      resolveBusinessApplicationGateState(
        applicationExists: true,
        role: const {'role': 'business', 'level': 2},
        businessProfileExists: false,
      ),
      BusinessApplicationGateState.awaitingActivation,
    );
  });

  test('only role two with an active Business profile continues', () {
    expect(
      resolveBusinessApplicationGateState(
        applicationExists: true,
        role: const {'role': 'business', 'level': 2},
        businessProfileExists: true,
        businessProfile: const {'status': 'checking'},
      ),
      BusinessApplicationGateState.awaitingActivation,
    );
    expect(
      resolveBusinessApplicationGateState(
        applicationExists: true,
        role: const {'role': 'business', 'level': 2},
        businessProfileExists: true,
        businessProfile: const {'status': 'active'},
      ),
      BusinessApplicationGateState.activeBusiness,
    );
  });
}
