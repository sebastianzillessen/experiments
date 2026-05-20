// next-yak build-time constants — exported colors, spacings, etc.
// These are statically read at build time when used in template literals.

export const colors = {
  bg: "#f5f4ef",
  surface: "#ffffff",
  surface2: "#faf9f5",
  ink: "#1a1f2c",
  ink2: "#4a5366",
  ink3: "#8a92a3",
  line: "#e4e2d9",
  line2: "#d4d1c4",
  primary: "#2b5d8b",
  primaryInk: "#1a3a5c",
  primarySoft: "#e6effa",
  accent: "#d97743",
  accentSoft: "#fbeee3",
  success: "#4a8a4a",
  successSoft: "#e3efe3",
  warn: "#b88a2c",
  danger: "#b8453e",
  dangerSoft: "#fbe5e3",
};

export const radii = {
  sm: "10px",
  md: "14px",
  pill: "999px",
};

export const shadows = {
  sm: "0 1px 2px rgba(20, 30, 50, 0.04), 0 2px 6px rgba(20, 30, 50, 0.04)",
  md: "0 4px 12px rgba(20, 30, 50, 0.08), 0 12px 32px rgba(20, 30, 50, 0.06)",
};

export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "14px",
  lg: "20px",
  xl: "28px",
};

export const breakpoints = {
  mobile: "600px",
};
