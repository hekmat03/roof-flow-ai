/** One set of password rules for signup, reset and change-password. */
export const MIN_PASSWORD_LENGTH = 8;

const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123',
  'iloveyou', 'letmein123', 'welcome1', 'welcome123', 'admin123', 'abc12345', '11111111', 'roofflow1',
]);

/** Null when the password is acceptable, otherwise a short message for the user. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw.length > 72) return 'Password must be 72 characters or fewer.';
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return 'Use at least one letter and one number.';
  if (COMMON.has(pw.toLowerCase())) return 'That password is too common. Choose another.';
  return null;
}

/** 0 (empty) to 4 (strong), for the strength bar. */
export function passwordScore(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  if (passwordProblem(pw)) return 1;
  let s = 2;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s) as 2 | 3 | 4;
}
