import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AuthShell eyebrow="Account" title="Set a new password" description="Choose the password you'll log in with from now on.">
      <ResetPasswordForm />
    </AuthShell>
  );
}
