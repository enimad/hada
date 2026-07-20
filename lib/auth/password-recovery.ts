export const PASSWORD_RECOVERY_COOKIE = "hada-password-recovery";
export const PASSWORD_RECOVERY_MAX_AGE = 60 * 60;
export const PASSWORD_RESET_PATH = "/login/reset-password";

export function getPasswordResetRedirectUrl(origin: string) {
  return new URL(PASSWORD_RESET_PATH, origin).toString();
}
