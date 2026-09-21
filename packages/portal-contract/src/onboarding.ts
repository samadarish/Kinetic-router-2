import { z } from 'zod';

export const verificationEmailSchema = z.object({ email: z.string().trim().email().max(254) });
export const turnstileTokenSchema = z.string().min(1).max(2048);
export const verificationCodeInputSchema = verificationEmailSchema.extend({
  turnstileToken: turnstileTokenSchema.optional(),
});
const signupPassword = z.string().min(8).refine(value => value.trim().length > 0 && new TextEncoder().encode(value).length <= 72, 'Use a password of at most 72 bytes.');
export const googleRegistrationSchema = z.object({
  password: signupPassword,
  invitationCode: z.string().trim().max(128).optional(),
});
export const signupInputSchema = verificationEmailSchema.extend({
  password: signupPassword,
  verifyCode: z.string().trim().regex(/^\d{6}$/),
  invitationCode: z.string().trim().max(128).optional(),
});
export const googleStartSchema = z.object({ next: z.string().max(2048).optional() });
export type SignupInput = z.infer<typeof signupInputSchema>;
export type GoogleRegistrationInput = z.infer<typeof googleRegistrationSchema>;
export type AuthOptions = {
  emailSignup: boolean;
  googleSignin: boolean;
  invitationRequired: boolean;
  turnstile: { enabled: boolean; siteKey: string | null };
};
export type GoogleRegistrationView = { email: string; invitationRequired: boolean };
