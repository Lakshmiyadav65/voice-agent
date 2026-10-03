import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account"
      title="Forgot password"
      description="Enter your email and we'll send you a link to set a new password."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
