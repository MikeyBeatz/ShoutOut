final RegExp _nicknamePattern = RegExp(
  r'^(?=.{3,24}$)[\p{L}0-9]+(?:[-_][\p{L}0-9]+)*$',
  unicode: true,
);

bool isValidNickname(String nickname) => _nicknamePattern.hasMatch(nickname);
