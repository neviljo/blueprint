import React, { useState } from "react";
import type { SubmitEvent } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  InputAdornment,
  IconButton,
  FormControlLabel,
  Checkbox,
  Link,
  Divider,
  Alert,
  CircularProgress,
  Paper,
  Tooltip,
} from "@mui/material";
import {
  EmailOutlined,
  LockOutlined,
  PersonOutlined,
  Visibility,
  VisibilityOff,
  Google as GoogleIcon,
  GitHub as GitHubIcon,
  ArrowForwardRounded,
} from "@mui/icons-material";
import { useNavigate } from "@tanstack/react-router";
import { authApi } from "../lib/api";
import { clearSessionCache } from "../lib/auth";

const textFieldSx = {
  "& .MuiOutlinedInput-root": {
    bgcolor: "#121212",
    color: "#ECECEC",
    borderRadius: 2,
    "& fieldset": { borderColor: "#3F3F3F" },
    "&:hover fieldset": { borderColor: "#555" },
    "&.Mui-focused fieldset": { borderColor: "#ECECEC" },
  },
  "& input": { py: "10px", fontSize: "0.92rem" },
};

interface FormData {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  rememberMe: boolean;
  agreeTerms: boolean;
}

function validateForm(formData: FormData, mode: "signin" | "signup"): string | null {
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

interface AuthFormProps {
  initialMode?: "signin" | "signup";
  onSuccess?: () => void;
}

export default function AuthForm({
  initialMode = "signin",
  onSuccess,
}: AuthFormProps) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    rememberMe: false,
    agreeTerms: false,
  });

  const navigate = useNavigate();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (error) setError(null);
  };

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError(null);

    const error = validateForm(formData, mode);
    if (error) {
      setError(error);
      return;
    }

    setLoading(true);

    try {
      if (mode === "signin") {
        await authApi.signIn(formData.email.trim(), formData.password, formData.rememberMe);
      } else {
        await authApi.signUp(formData.fullName, formData.email.trim(), formData.password);
      }

      clearSessionCache();
      setLoading(false);
      if (onSuccess) onSuccess();
      navigate({ to: "/dashboard" });
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  const renderSocialButton = (label: string, icon: React.ReactNode) => (
    <Tooltip title={`${label} coming soon`} placement="top">
      <span>
        <Button
          fullWidth
          variant="outlined"
          startIcon={icon}
          disabled
          sx={{
            py: 0.9,
            color: "#ECECEC",
            borderColor: "#3F3F3F",
            bgcolor: "#212121",
            textTransform: "none",
            fontWeight: 500,
            fontSize: "0.9rem",
            borderRadius: 2,
          }}
        >
          Continue with {label}
        </Button>
      </span>
    </Tooltip>
  );

  return (
    <Paper
      elevation={0}
      sx={{
        width: "100%",
        maxWidth: 440,
        mx: "auto",
        p: { xs: 2.5, sm: 3.5 },
        bgcolor: "#1A1A1A",
        border: "1px solid #2F2F2F",
        borderRadius: 3,
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
        color: "#ECECEC",
        maxHeight: "85vh",
        overflowY: "auto",
        "&::-webkit-scrollbar": {
          width: "6px",
        },
        "&::-webkit-scrollbar-thumb": {
          bgcolor: "#333",
          borderRadius: "3px",
        },
      }}
    >
      {/* Header */}
      <Box sx={{ textAlign: "center", mb: 2.5 }}>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 1.5,
            mb: 1,
          }}
        >
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 2,
              bgcolor: "#ECECEC",
              color: "#111",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 18,
              boxShadow: "0 0 12px rgba(236, 236, 236, 0.2)",
            }}
          >
            B
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: -0.5 }}>
            Blueprint
          </Typography>
        </Box>

        <Typography variant="h5" sx={{ fontWeight: 700, color: "#FFFFFF", mb: 0.5, fontSize: "1.35rem" }}>
          {mode === "signin" ? "Welcome back" : "Create an account"}
        </Typography>

        <Typography variant="body2" sx={{ color: "#A6A6A6", fontSize: "0.85rem" }}>
          {mode === "signin"
            ? "Enter your credentials to access your workspaces"
            : "Get started with your collaborative visual workspace"}
        </Typography>
      </Box>

      {/* Social Logins */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.2, mb: 2 }}>
        {renderSocialButton(
          "Google",
          <GoogleIcon sx={{ fontSize: "1.1rem !important", color: "#4285F4" }} />
        )}

        {renderSocialButton(
          "GitHub",
          <GitHubIcon sx={{ fontSize: "1.1rem !important" }} />
        )}
      </Box>

      <Divider
        sx={{
          my: 2,
          color: "#A6A6A6",
          borderColor: "#2F2F2F",
          fontSize: "0.75rem",
          fontWeight: 600,
          "&::before, &::after": { borderColor: "#2F2F2F" },
        }}
      >
        OR CONTINUATION WITH EMAIL
      </Divider>

      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 2,
            bgcolor: "rgba(239, 68, 68, 0.1)",
            color: "#fca5a5",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 2,
            fontSize: "0.85rem",
            "& .MuiAlert-icon": { color: "#f87171" },
          }}
        >
          {error}
        </Alert>
      )}

      {/* Form Inputs */}
      <Box component="form" onSubmit={handleSubmit} noValidate>
        {mode === "signup" && (
          <Box sx={{ mb: 1.8 }}>
            <Typography variant="caption" sx={{ color: "#A6A6A6", fontWeight: 600, mb: 0.5, display: "block" }}>
              FULL NAME
            </Typography>
            <TextField
              fullWidth
              name="fullName"
              placeholder="John Doe"
              value={formData.fullName}
              onChange={handleInputChange}
              size="small"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutlined sx={{ color: "#777777", fontSize: 18 }} />
                    </InputAdornment>
                  ),
                },
              }}
              sx={textFieldSx}
            />
          </Box>
        )}

        <Box sx={{ mb: 1.8 }}>
          <Typography variant="caption" sx={{ color: "#A6A6A6", fontWeight: 600, mb: 0.5, display: "block" }}>
            EMAIL ADDRESS
          </Typography>
          <TextField
            fullWidth
            type="email"
            name="email"
            placeholder="name@example.com"
            value={formData.email}
            onChange={handleInputChange}
            size="small"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailOutlined sx={{ color: "#777777", fontSize: 18 }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={textFieldSx}
          />
        </Box>

        <Box sx={{ mb: mode === "signup" ? 1.8 : 1 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: "#A6A6A6", fontWeight: 600 }}>
              PASSWORD
            </Typography>
            {mode === "signin" && (
              <Tooltip title="Password reset coming soon" placement="top">
                <span>
                  <Link
                    component="button"
                    type="button"
                    onClick={() => {}}
                    disabled
                    aria-disabled="true"
                    sx={{
                      color: "#c084fc",
                      textDecoration: "none",
                      fontWeight: 500,
                      fontSize: "0.78rem",
                      cursor: "not-allowed",
                      opacity: 0.6,
                    }}
                  >
                    Forgot password?
                  </Link>
                </span>
              </Tooltip>
            )}
          </Box>
          <TextField
            fullWidth
            type={showPassword ? "text" : "password"}
            name="password"
            placeholder="••••••••"
            value={formData.password}
            onChange={handleInputChange}
            size="small"
            helperText={mode === "signup" ? "At least 8 characters" : undefined}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlined sx={{ color: "#777777", fontSize: 18 }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      size="small"
                      sx={{ color: "#777777" }}
                    >
                      {showPassword ? <VisibilityOff sx={{ fontSize: 18 }} /> : <Visibility sx={{ fontSize: 18 }} />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            sx={textFieldSx}
          />
        </Box>

        {mode === "signup" && (
          <Box sx={{ mb: 1.8 }}>
            <Typography variant="caption" sx={{ color: "#A6A6A6", fontWeight: 600, mb: 0.5, display: "block" }}>
              CONFIRM PASSWORD
            </Typography>
            <TextField
              fullWidth
              type={showConfirmPassword ? "text" : "password"}
              name="confirmPassword"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              size="small"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlined sx={{ color: "#777777", fontSize: 18 }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        edge="end"
                        size="small"
                        sx={{ color: "#777777" }}
                      >
                        {showConfirmPassword ? (
                          <VisibilityOff sx={{ fontSize: 18 }} />
                        ) : (
                          <Visibility sx={{ fontSize: 18 }} />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
              sx={textFieldSx}
            />
          </Box>
        )}

        {mode === "signin" ? (
          <FormControlLabel
            control={
              <Checkbox
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleInputChange}
                size="small"
                sx={{
                  color: "#555",
                  "&.Mui-checked": { color: "#ECECEC" },
                }}
              />
            }
            label={
              <Typography variant="body2" sx={{ color: "#A6A6A6", fontSize: "0.82rem" }}>
                Keep me signed in
              </Typography>
            }
            sx={{ mb: 2 }}
          />
        ) : (
          <FormControlLabel
            control={
              <Checkbox
                name="agreeTerms"
                checked={formData.agreeTerms}
                onChange={handleInputChange}
                size="small"
                sx={{
                  color: "#555",
                  "&.Mui-checked": { color: "#ECECEC" },
                }}
              />
            }
            label={
              <Typography variant="body2" sx={{ color: "#A6A6A6", fontSize: "0.8rem" }}>
                I agree to the{" "}
                <Link sx={{ color: "#c084fc", textDecoration: "none" }}>Terms of Service</Link> and{" "}
                <Link sx={{ color: "#c084fc", textDecoration: "none" }}>Privacy Policy</Link>
              </Typography>
            }
            sx={{ mb: 2 }}
          />
        )}

        <Button
          type="submit"
          fullWidth
          disabled={loading}
          endIcon={!loading && <ArrowForwardRounded />}
          sx={{
            py: 1.1,
            bgcolor: "#ECECEC",
            color: "#111",
            fontWeight: 700,
            fontSize: "0.92rem",
            textTransform: "none",
            borderRadius: 2,
            boxShadow: "0 4px 12px rgba(255, 255, 255, 0.15)",
            "&:hover": {
              bgcolor: "#FFFFFF",
              boxShadow: "0 6px 16px rgba(255, 255, 255, 0.25)",
            },
          }}
        >
          {loading ? (
            <CircularProgress size={22} sx={{ color: "#111" }} />
          ) : mode === "signin" ? (
            "Sign In"
          ) : (
            "Create Account"
          )}
        </Button>
      </Box>

      {/* Switch Mode Footer */}
      <Box sx={{ mt: 2.5, pt: 1.5, borderTop: "1px solid #2F2F2F", textAlign: "center" }}>
        <Typography variant="body2" sx={{ color: "#A6A6A6", fontSize: "0.85rem" }}>
          {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
          <Link
            component="button"
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            sx={{
              color: "#c084fc",
              fontWeight: 600,
              textDecoration: "none",
              cursor: "pointer",
              "&:hover": { textDecoration: "underline" },
            }}
          >
            {mode === "signin" ? "Sign Up" : "Sign In"}
          </Link>
        </Typography>
      </Box>
    </Paper>
  );
}
