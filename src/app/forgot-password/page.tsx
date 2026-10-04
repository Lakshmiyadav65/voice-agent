import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default async function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  // /auth/callback sends people back here when their reset link was used or expired.
  const { error } = await props.searchParams;
  const initialError =
    error === "link_expired" ? "That reset link has expired or was already used. Send yourself a new one." : null;
  return (
    <AuthShell
      eyebrow="Account"
      title="Forgot password"
      description="Enter your email and we'll send you a link to set a new password."
    >
      <ForgotPasswordForm initialError={initialError} />
    </AuthShell>
  );
}
