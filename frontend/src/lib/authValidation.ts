export type AuthMode = "signin" | "signup";

export interface AuthFormData {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  rememberMe: boolean;
  agreeTerms: boolean;
}

export function validateForm(formData: AuthFormData, mode: AuthMode): string | null {
  const email = formData.email.trim();

  if (!email || !formData.password.trim()) {
    return "Please fill in all required fields.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Please enter a valid email address.";
  }

  if (mode === "signup") {
    if (formData.password.length < 8) {
      return "Password must be at least 8 characters long.";
    }

    if (!formData.fullName.trim()) {
      return "Please enter your full name.";
    }

    if (formData.password !== formData.confirmPassword) {
      return "Passwords do not match.";
    }

    if (!formData.agreeTerms) {
      return "You must accept the Terms of Service to continue.";
    }
  }

  return null;
}
