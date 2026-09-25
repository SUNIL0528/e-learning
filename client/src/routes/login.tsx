import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  cognitoConfigured,
  confirmSignUp,
  refreshAuthUser,
  signInWithCognito,
  signUpWithCognito,
} from "@/lib/auth";
import { ensureUserProfile } from "@/lib/progress";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — HTS" },
      { name: "description", content: "Sign in to continue learning on HTS." },
    ],
  }),
  component: LoginPage,
});

function cognitoErrorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const messages: Record<string, string> = {
    NotAuthorizedException: "Email or password is incorrect.",
    UserNotFoundException: "Email or password is incorrect.",
    UsernameExistsException: "This candidate number is already registered.",
    InvalidPasswordException:
      "Password must meet Cognito policy: use 8+ characters with uppercase and lowercase letters, a number, and a symbol.",
    CodeMismatchException: "That confirmation code is incorrect.",
    ExpiredCodeException: "That confirmation code has expired. Request a new code.",
    CodeDeliveryFailureException: "Cognito could not send the confirmation email.",
    UserNotConfirmedException: "Please confirm your account with the email verification code first.",
    PasswordResetRequiredException: "You must reset your Cognito password before signing in.",
    InvalidParameterException: "Cognito rejected the sign-in details. Check the username and password.",
    TooManyRequestsException: "Too many sign-in attempts. Please wait and try again.",
    LimitExceededException: "Too many attempts. Please try again later.",
  };
  return messages[name] ?? (error instanceof Error ? error.message : "Unable to authenticate.");
}

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [candidateNumber, setCandidateNumber] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    if (loading) return;
    event.preventDefault();
    if (!cognitoConfigured) {
      setError("Cognito is not configured yet. Add the VITE_COGNITO values to your .env file.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const normalizedCandidateNumber = candidateNumber.trim();
      const normalizedName = name.trim();
      const normalizedEmail = email.trim();
      const normalizedPhone = phone.replace(/[\s()-]/g, "");

      if (mode === "signup") {
        if (!/^[A-Za-z0-9._+=@-]+$/.test(normalizedCandidateNumber)) {
          throw new Error(
            "Enter the candidate number provided to you using letters, numbers, or - . _",
          );
        }
        if (!normalizedName) {
          throw new Error("Name is required.");
        }
        if (!gender) {
          throw new Error("Gender is required.");
        }
        if (!normalizedEmail) {
          throw new Error("Email is required.");
        }
        if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
          throw new Error("Enter your phone number with country code, for example +919876543210.");
        }
        if (!password.trim()) {
          throw new Error("Password is required.");
        }
      }

      if (awaitingConfirmation) {
        await confirmSignUp({ username: normalizedCandidateNumber, confirmationCode });
        setAwaitingConfirmation(false);
        await signInWithCognito(normalizedCandidateNumber, password);
      } else {
        if (mode === "signup") {
          const result = await signUpWithCognito(
            normalizedCandidateNumber,
            normalizedEmail,
            normalizedPhone,
            gender,
            password,
            normalizedName,
          );
          if (result.nextStep.signUpStep === "CONFIRM_SIGN_UP") {
            setAwaitingConfirmation(true);
            setError("Check your email for the confirmation code.");
            return;
          }
          await signInWithCognito(normalizedCandidateNumber, password);
        } else {
          await signInWithCognito(loginIdentifier.trim(), password);
        }
      }

      const user = await refreshAuthUser();
      if (user) {
        await ensureUserProfile(user, {
          candidateNumber: user.username,
          name,
          phone: mode === "signup" ? normalizedPhone : undefined,
          gender: mode === "signup" ? gender : undefined,
        });
      }
      await navigate({ to: "/" });
    } catch (submitError) {
      setError(cognitoErrorMessage(submitError));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode((currentMode) => (currentMode === "login" ? "signup" : "login"));
    setAwaitingConfirmation(false);
    setError(null);
  };

  return (
    <main className="min-h-[calc(100vh-56px)] bg-sand px-6 py-10 md:py-16">
      <div className="mx-auto grid max-w-[1080px] overflow-hidden border-2 border-ink bg-paper md:grid-cols-[1.1fr_0.9fr]">
        <section className="relative min-h-[300px] overflow-hidden bg-ink p-8 text-paper md:p-12">
          <div className="absolute -right-12 -top-12 size-48 rounded-full border-[28px] border-clay/80" />
          <div className="absolute -bottom-20 -left-12 size-64 rounded-full border-[36px] border-moss/80" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <Link
              to="/"
              className="flex items-center gap-2 font-mono text-sm font-bold tracking-tight"
            >
              <span className="size-4 bg-clay" />
              HTS
            </Link>
            <div className="mt-16 max-w-[28rem]">
              <div className="rule-label text-clay">Learning platform</div>
              <h1 className="mt-3 text-4xl font-black leading-[0.92] tracking-tight md:text-6xl">
                Keep your learning moving.
              </h1>
              <p className="mt-5 max-w-[30ch] text-sm leading-relaxed text-paper/70">
                Continue your courses, module assessments, discussions, and progress from one place.
              </p>
            </div>
          </div>
        </section>

        <section className="p-6 md:p-10">
          <div className="rule-label text-clay">
            {mode === "login" ? "Welcome back" : "New learner"}
          </div>
          <h2 className="mt-2 text-3xl font-black tracking-tight">
            {mode === "login" ? "Sign in" : "Create account"}
          </h2>
          <p className="mt-2 text-sm text-fog">
            {mode === "login"
              ? "Enter your details to continue."
              : "Set up your HTS learner account."}
          </p>

          {!cognitoConfigured && (
            <div className="mt-5 border-2 border-clay bg-sand p-3 text-sm">
              Cognito is not configured. Add the <code>VITE_COGNITO</code> values to your client
              <code>.env</code> file.
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div className="space-y-4">
                <label className="block">
                  <span className="rule-label">Candidate number</span>
                  <input
                    value={candidateNumber}
                    onChange={(event) => setCandidateNumber(event.target.value)}
                    inputMode="numeric"
                    autoComplete="username"
                    required
                    className="mt-2 w-full border-2 border-ink bg-paper px-3 py-2.5 text-sm outline-none focus:border-clay"
                    placeholder="The unique number provided to you"
                  />
                </label>

                <label className="block">
                  <span className="rule-label">Full name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    required
                    className="mt-2 w-full border-2 border-ink bg-paper px-3 py-2.5 text-sm outline-none focus:border-clay"
                    placeholder="Your full name"
                  />
                </label>

                <label className="block">
                  <span className="rule-label">Gender</span>
                  <select
                    value={gender}
                    onChange={(event) => setGender(event.target.value)}
                    required
                    className="mt-2 w-full border-2 border-ink bg-paper px-3 py-2.5 text-sm outline-none focus:border-clay"
                  >
                    <option value="" disabled>
                      Select your gender
                    </option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="nonbinary">Non-binary</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </label>

                <label className="block">
                  <span className="rule-label">Phone number with country code</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    autoComplete="tel"
                    required
                    className="mt-2 w-full border-2 border-ink bg-paper px-3 py-2.5 text-sm outline-none focus:border-clay"
                    placeholder="+919876543210"
                  />
                </label>
              </div>
            )}

            {awaitingConfirmation && (
              <label className="block">
                <span className="rule-label">Confirmation code</span>
                <input
                  value={confirmationCode}
                  onChange={(event) => setConfirmationCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  className="mt-2 w-full border-2 border-ink bg-paper px-3 py-2.5 text-sm outline-none focus:border-clay"
                  placeholder="Code from your email"
                />
              </label>
            )}

            {mode === "signup" ? (
              <label className="block">
                <span className="rule-label">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className="mt-2 w-full border-2 border-ink bg-paper px-3 py-2.5 text-sm outline-none focus:border-clay"
                  placeholder="you@example.com"
                />
              </label>
            ) : (
              <label className="block">
                <span className="rule-label">Candidate number or email</span>
                <input
                  value={loginIdentifier}
                  onChange={(event) => setLoginIdentifier(event.target.value)}
                  autoComplete="username"
                  required
                  className="mt-2 w-full border-2 border-ink bg-paper px-3 py-2.5 text-sm outline-none focus:border-clay"
                  placeholder="Candidate number or email"
                />
              </label>
            )}

            <label className="block">
              <span className="rule-label">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={8}
                required
                className="mt-2 w-full border-2 border-ink bg-paper px-3 py-2.5 text-sm outline-none focus:border-clay"
                placeholder="8+ chars, upper/lowercase, number, symbol"
              />
            </label>

            {error && <p className="border-2 border-clay bg-sand p-3 text-sm text-ink">{error}</p>}

            <button
              type="submit"
              disabled={loading || !cognitoConfigured}
              className="w-full bg-ink px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-paper transition-colors hover:bg-moss disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading
                ? "Connecting..."
                : awaitingConfirmation
                  ? "Confirm account"
                  : mode === "login"
                    ? "Sign in"
                    : "Create account"}
            </button>
          </form>

          <div className="mt-6 border-t border-ink/15 pt-4 text-center text-sm text-fog">
            {mode === "login" ? "New to HTS?" : "Already have an account?"}{" "}
            <button
              onClick={switchMode}
              className="font-bold text-ink underline underline-offset-4"
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
