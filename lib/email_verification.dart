import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import 'web_environment.dart';

final emailVerificationActionSettings = ActionCodeSettings(
  url: kIsWeb
      ? WebEnvironment.current.appUrl
      : 'https://shoutout-dev-46c81.web.app',
  handleCodeInApp: false,
);
