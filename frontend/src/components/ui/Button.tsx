import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

export function Button({ variant = "secondary", className, ...rest }: ButtonProps) {
  const classes = ["button", `button--${variant}`, className].filter(Boolean).join(" ");
  return <button className={classes} {...rest} />;
}
