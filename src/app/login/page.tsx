import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <AuthShell eyebrow="Welcome back" title="Log in" description="Access your business dashboard or trainer console.">
      <LoginForm />
    </AuthShell>
  );
}
