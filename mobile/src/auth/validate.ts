/**
 * Client-side checks on the sign-in form.
 *
 * These exist to answer before a round trip, not to be the real gate — the
 * server decides. Anything rejected here would be rejected there too; the point
 * is to say so immediately and in a sentence a person can act on.
 */

/**
 * Deliberately loose. The only email that definitely works is one that receives
 * mail, and no regex settles that, so this rejects the shapes that are
 * certainly wrong and lets the server rule on the rest. Notably it allows the
 * plus-addressing, dots and long TLDs that stricter patterns wrongly reject.
 */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Firebase's own floor is six characters. Matching it keeps the errors local. */
export const MIN_PASSWORD = 6;

export type Field = 'email' | 'password' | 'confirm' | 'name';

export function emailProblem(email: string): string | null {
  const v = email.trim();
  if (!v) return 'Enter your email address.';
  if (!EMAIL.test(v)) return "That does not look like an email address.";
  return null;
}

export function passwordProblem(password: string): string | null {
  if (!password) return 'Enter a password.';
  if (password.length < MIN_PASSWORD) {
    return `Passwords need at least ${MIN_PASSWORD} characters.`;
  }
  return null;
}

export function nameProblem(name: string): string | null {
  const v = name.trim();
  if (!v) return 'Pick a name — it is what other players see.';
  if (v.length < 2) return 'That name is too short.';
  if (v.length > 24) return 'That name is too long — 24 characters at most.';
  return null;
}

export function confirmProblem(password: string, confirm: string): string | null {
  if (!confirm) return 'Type the password again to confirm it.';
  if (password !== confirm) return 'The two passwords do not match.';
  return null;
}

/**
 * The first problem with a whole form, as [field, message], or null when it is
 * ready to send. Returning the field lets the screen focus and outline it.
 */
export function formProblem(
  mode: 'signIn' | 'signUp',
  form: { email: string; password: string; confirm: string; name: string },
): [Field, string] | null {
  const email = emailProblem(form.email);
  if (email) return ['email', email];

  if (mode === 'signUp') {
    const name = nameProblem(form.name);
    if (name) return ['name', name];
  }

  const password = passwordProblem(form.password);
  if (password) return ['password', password];

  if (mode === 'signUp') {
    const confirm = confirmProblem(form.password, form.confirm);
    if (confirm) return ['confirm', confirm];
  }

  return null;
}
