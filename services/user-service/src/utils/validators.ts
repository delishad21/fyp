export const validateUsername = (username: string): string[] => {
  const errors: string[] = [];

  if (!username || username.trim().length === 0) {
    errors.push("Username is required.");
    return errors;
  }

  const trimmed = username.trim();

  if (trimmed.length < 3) {
    errors.push("Username must be at least 3 characters long.");
  }
  if (trimmed.length > 30) {
    errors.push("Username must be at most 30 characters long.");
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    errors.push(
      "Username can only contain letters, numbers, '.', '_', or '-'. No spaces allowed."
    );
  }
  if (/([._-]){2,}/.test(trimmed)) {
    errors.push("Username cannot have consecutive special characters.");
  }
  if (/^[._-]/.test(trimmed) || /[._-]$/.test(trimmed)) {
    errors.push("Username cannot start or end with '.', '_', or '-'.");
  }

  return errors;
};

export const validateEmail = (email: string): string[] => {
  const errors: string[] = [];

  if (!email || email.trim().length === 0) {
    errors.push("Email is required.");
    return errors;
  }

  const trimmed = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(trimmed)) {
    errors.push("Please enter a valid email.");
  }

  return errors;
};

export const validatePassword = (password: string): string[] => {
  const errors: string[] = [];

  if (!password || password.trim().length === 0) {
    errors.push("Password is required.");
    return errors;
  }

  const trimmed = password.trim();

  if (trimmed.length < 8) {
    errors.push("Be at least 8 characters long");
  }
  if (!/[a-zA-Z]/.test(trimmed)) {
    errors.push("Contain at least one letter.");
  }
  if (!/[0-9]/.test(trimmed)) {
    errors.push("Contain at least one number.");
  }
  if (!/[^a-zA-Z0-9]/.test(trimmed)) {
    errors.push("Contain at least one special character.");
  }

  return errors;
};

export const validateStudentPassword = (password: string): string[] => {
  const errors: string[] = [];

  if (!password || password.trim().length === 0) {
    errors.push("Password is required.");
    return errors;
  }

  const trimmed = password.trim();

  if (trimmed.length < 8) {
    errors.push("Be at least 8 characters long.");
  }

  return errors;
};

export const validateName = (name: string): string[] => {
  const errors: string[] = [];

  // Empty / whitespace only
  if (!name || name.trim().length === 0) {
    errors.push("Name is required.");
    return errors;
  }

  // Normalize to NFC for consistent Unicode comparison
  const trimmed = name.trim().normalize("NFC");

  // Length
  if (trimmed.length < 2) {
    errors.push("Name must be at least 2 characters long.");
  }
  if (trimmed.length > 100) {
    errors.push("Name must be at most 100 characters long.");
  }

  // Allow:
  //  - Unicode letters: \p{L}
  //  - Combining marks (accents attached to letters): \p{M}
  //  - spaces
  //  - apostrophes ' and ’
  //  - hyphen -, period ., slash /, ampersand &, comma , and parentheses ().
  //  - digits 0-9 (for suffixes like II, III, 2nd)
  const allowedCharsRE = /^[\p{L}\p{M}0-9\s.'’\-\/&,()]+$/u;

  // Require at least one letter (prevents inputs like "----" or "123")
  const hasLetterRE = /[\p{L}]/u;

  if (!allowedCharsRE.test(trimmed)) {
    errors.push(
      "Name can contain letters (any language), spaces, apostrophes (’ or '), hyphens (-), periods (.), slashes (/), ampersands (&), commas (,), parentheses, and digits."
    );
  }
  if (!hasLetterRE.test(trimmed)) {
    errors.push("Name must include at least one letter.");
  }

  return errors;
};

export const validateHonorific = (honorific: string | undefined): string[] => {
  const errors: string[] = [];

  if (!honorific || honorific.trim().length === 0) {
    return errors; // Honorific is optional, so we return an empty array if not provided
  }

  const trimmed = honorific.trim();

  const honorifics = [
    "Mr.",
    "Mrs.",
    "Ms.",
    "Miss",
    "Mx.",
    "Dr.",
    "Prof.",
    "None",
  ];
  if (!honorifics.includes(trimmed)) {
    errors.push(
      `Honorific must be one of the following: ${honorifics.join(", ")}`
    );
  }

  return errors;
};

export const validateUserData = ({
  username,
  email,
  password,
  honorific,
  name,
}: {
  username: string;
  email: string;
  password: string;
  honorific: string | undefined;
  name: string;
}) => {
  return {
    username: validateUsername(username),
    email: validateEmail(email),
    password: validatePassword(password),
    honorific: validateHonorific(honorific),
    name: validateName(name),
  };
};

export const isValidUsername = (username: string): boolean => {
  const errors = validateUsername(username);
  return errors.length === 0;
};

export const isValidEmail = (email: string): boolean => {
  const errors = validateEmail(email);
  return errors.length === 0;
};

export const isValidPassword = (password: string): boolean => {
  const errors = validatePassword(password);
  return errors.length === 0;
};

export const isValidStudentPassword = (password: string): boolean => {
  const errors = validateStudentPassword(password);
  return errors.length === 0;
};

export const isValidName = (name: string): boolean => {
  const errors = validateName(name);
  return errors.length === 0;
};

export const isValidHonorific = (honorific: string | undefined): boolean => {
  const errors = validateHonorific(honorific);
  return errors.length === 0;
};

export const validateStudentUserData = (
  {
    username,
    name,
    email,
    password,
  }: { username: string; name: string; email?: string; password?: string },
  opts: { emailRequired?: boolean; passwordRequired?: boolean } = {}
): {
  username: string[];
  name: string[];
  email: string[];
  password: string[];
} => {
  const { emailRequired = false, passwordRequired = false } = opts;

  const result: {
    username: string[];
    name: string[];
    email: string[];
    password: string[];
  } = {
    username: validateUsername(username),
    name: validateName(name),
    email: [],
    password: [],
  };

  // Validate email only if required or provided
  if (emailRequired || (email && email.trim().length > 0)) {
    result.email = validateEmail(email ?? "");
  }

  // Validate password only if required or provided
  if (passwordRequired || (password && password.trim().length > 0)) {
    result.password = validateStudentPassword(password ?? "");
  }

  return result;
};

// Optional helper, also inline-typed
export const isValidStudentUserData = (
  data: { username: string; name: string; email?: string; password?: string },
  opts?: { emailRequired?: boolean; passwordRequired?: boolean }
): boolean => {
  const r = validateStudentUserData(data, opts);
  return (
    r.username.length === 0 &&
    r.name.length === 0 &&
    r.email.length === 0 &&
    r.password.length === 0
  );
};
