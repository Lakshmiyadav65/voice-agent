import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { loginErrorMessage } from "@/lib/auth/callback-errors";

export default async function LoginPage(props: PageProps<"/login">) {
  const { error } = await props.searchParams;
  const initialError = loginErrorMessage(error);
  return (
    <AuthShell eyebrow="Welcome back" title="Log in" description="Access your business dashboard or trainer console.">
      <LoginForm initialError={initialError} />
    </AuthShell>
  );
}
