import { Box, TextField, Typography, InputAdornment } from "@mui/material";

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

export interface AuthTextFieldProps {
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label: React.ReactNode;
  placeholder?: string;
  type?: string;
  helperText?: string;
  mb?: number | string;
  startIcon?: React.ReactNode;
  endAdornment?: React.ReactNode;
}

export default function AuthTextField({
  name,
  value,
  onChange,
  label,
  placeholder,
  type = "text",
  helperText,
  mb,
  startIcon,
  endAdornment,
}: AuthTextFieldProps) {
  return (
    <Box sx={{ mb: mb ?? 1.8 }}>
      <Typography variant="caption" sx={{ color: "#A6A6A6", fontWeight: 600, mb: 0.5, display: "block" }}>
        {label}
      </Typography>
      <TextField
        fullWidth
        type={type}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        size="small"
        helperText={helperText}
        slotProps={{
          input: {
            startAdornment: startIcon ? (
              <InputAdornment position="start">{startIcon}</InputAdornment>
            ) : undefined,
            endAdornment,
          },
        }}
        sx={textFieldSx}
      />
    </Box>
  );
}
