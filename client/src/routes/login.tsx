import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { CloudCompanion } from "@/components/CloudCompanion";
import coatingWorkArchive from "@/assets/coating-work-archive.jpg";
import googleMark from "@/assets/google-mark.svg";
import {
  cognitoConfigured,
  confirmSignUp,
  localDev,
  refreshAuthUser,
  signInLocally,
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
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    setPasswordFocused(false);
  };

  const submitLocally = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter an email and password to continue.");
      return;
    }
    setError(null);
    signInLocally(email, mode === "signup" ? name : "");
    void navigate({ to: "/" });
  };

  const continueWithGoogleLocally = () => {
    signInLocally("google.preview@localhost.invalid", "Google Learner");
    void navigate({ to: "/" });
  };

  if (localDev) {
    return (
      <main className="auth-layout">
        <div className="auth-shell">
          <section className="auth-visual" aria-label="HTS learning">
            <img src={coatingWorkArchive} alt="Archive photograph of a worker spraying protective coating on a ship part" className="auth-visual-photo" />
            <div className="auth-visual-content">
              <blockquote className="auth-visual-quote">
                <p>“{mode === "login" ? "Welcome back. Keep your learning moving." : "Your next chapter starts here."}”</p>
                <cite>— HTS Coatings learning</cite>
              </blockquote>
              <p className="auth-photo-credit">Archival photograph: <a href="https://commons.wikimedia.org/wiki/File:A_worker_sprays_protective_(9605228043).jpg" target="_blank" rel="noreferrer">Tyne & Wear Archives &amp; Museums</a></p>
            </div>
          </section>
          <section className="auth-form-side" aria-labelledby="local-auth-title">
            <div className="auth-form-wrap">
              <CloudCompanion eyesClosed={passwordFocused && !showPassword} />
              <div className="auth-card">
                <h1 id="local-auth-title">{mode === "login" ? "Sign in to your account" : "Create an account"}</h1>
                <p className="auth-subtitle">
                  {mode === "login"
                    ? "Enter your email below to sign in"
                    : "Enter your details below to sign up"}
                </p>
                <form onSubmit={submitLocally} className="auth-fields" autoComplete="on">
                  {mode === "signup" && (
                    <label className="block">
                      <span className="auth-label">Full Name</span>
                      <input type="text" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required className="auth-input" placeholder="Your full name" />
                    </label>
                  )}
                  <label className="block">
                    <span className="auth-label">Email</span>
                    <input
                      type="text"
                      inputMode="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      required
                      className="auth-input"
                      placeholder="Your email"
                    />
                  </label>
                  <label className="block">
                    <span className="auth-label">Password</span>
                    <span className="auth-password-wrap">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        onFocus={() => setPasswordFocused(true)}
                        onBlur={() => setPasswordFocused(false)}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        required
                        className="auth-input"
                        placeholder="Password"
                      />
                      <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                      </button>
                    </span>
                  </label>
                  {error && <p className="auth-notice" role="alert">{error}</p>}
                  <button type="submit" className="auth-submit auth-submit-outline">
                    {mode === "login" ? "Sign In" : "Sign Up"}
                  </button>
                </form>
                <div className="auth-switch">
                  {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                  <button type="button" onClick={switchMode}>
                    {mode === "login" ? "Sign up" : "Sign in"}
                  </button>
                </div>
                <div className="auth-divider"><span>Or continue with</span></div>
                <button type="button" className="auth-google" onClick={continueWithGoogleLocally}>
                  <img src={googleMark} alt="" aria-hidden="true" /> Continue with Google
                </button>
                <p className="auth-help">Local preview: any details work. Google opens a demo account. No passwords are saved.</p>
              </div>
            </div>
            <p className="auth-footer">HTS Coatings · Knowledge that protects.</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-layout">
      <div className="auth-shell">
        <section className="auth-visual" aria-label="HTS learning">
          <img src={coatingWorkArchive} alt="Archive photograph of a worker spraying protective coating on a ship part" className="auth-visual-photo" />
          <div className="auth-visual-content">
            <blockquote className="auth-visual-quote">
              <p>“{mode === "login" ? "Welcome back. Keep your learning moving." : "Your next chapter starts here."}”</p>
              <cite>— HTS Coatings learning</cite>
            </blockquote>
            <p className="auth-photo-credit">Archival photograph: <a href="https://commons.wikimedia.org/wiki/File:A_worker_sprays_protective_(9605228043).jpg" target="_blank" rel="noreferrer">Tyne & Wear Archives &amp; Museums</a></p>
          </div>
        </section>

        <section className="auth-form-side" aria-labelledby="auth-title">

          <div className="auth-form-wrap">
            <CloudCompanion eyesClosed={passwordFocused && !showPassword} />
            <div className="auth-card">
          <h1 id="auth-title">
            {mode === "login" ? "Sign in to your account" : "Create an account"}
          </h1>
          <p className="auth-subtitle">
            {mode === "login"
              ? "Enter your email below to sign in"
              : "Enter your details below to sign up"}
          </p>

          {!cognitoConfigured && (
            <div className="auth-notice">
              Cognito is not configured. Add the <code>VITE_COGNITO</code> values to your client
              <code>.env</code> file.
            </div>
          )}

          <form onSubmit={submit} className="auth-fields" autoComplete="on">
            {mode === "signup" && (
              <div className="space-y-4">
                <label className="block">
                  <span className="auth-label">Candidate number</span>
                  <input
                    value={candidateNumber}
                    onChange={(event) => setCandidateNumber(event.target.value)}
                    inputMode="numeric"
                    autoComplete="username"
                    required
                    className="auth-input"
                    placeholder="The unique number provided to you"
                  />
                </label>

                <label className="block">
                  <span className="auth-label">Full Name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    required
                    className="auth-input"
                    placeholder="Your full name"
                  />
                </label>

                <label className="block">
                  <span className="auth-label">Gender</span>
                  <select
                    value={gender}
                    onChange={(event) => setGender(event.target.value)}
                    required
                    className="auth-input"
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
                  <span className="auth-label">Phone number with country code</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    autoComplete="tel"
                    required
                    className="auth-input"
                    placeholder="+919876543210"
                  />
                </label>
              </div>
            )}

            {awaitingConfirmation && (
              <label className="block">
                <span className="auth-label">Confirmation code</span>
                <input
                  value={confirmationCode}
                  onChange={(event) => setConfirmationCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  className="auth-input"
                  placeholder="Code from your email"
                />
              </label>
            )}

            {mode === "signup" ? (
              <label className="block">
                <span className="auth-label">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className="auth-input"
                  placeholder="Your email"
                />
              </label>
            ) : (
              <label className="block">
                <span className="auth-label">Candidate number or email</span>
                <input
                  value={loginIdentifier}
                  onChange={(event) => setLoginIdentifier(event.target.value)}
                  autoComplete="username"
                  required
                  className="auth-input"
                  placeholder="Candidate number or email"
                />
              </label>
            )}

            <label className="block">
              <span className="auth-label">Password</span>
              <span className="auth-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={8}
                  required
                  className="auth-input"
                  placeholder="Password"
                  aria-describedby={mode === "signup" ? "auth-password-hint" : undefined}
                />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </span>
            </label>
            {mode === "signup" && <p id="auth-password-hint" className="auth-help">Use 8+ characters with uppercase and lowercase letters, a number, and a symbol.</p>}

            {error && <p className="auth-notice" role="alert">{error}</p>}

            <button
              type="submit"
              disabled={loading || !cognitoConfigured}
              className="auth-submit auth-submit-outline"
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

          <div className="auth-switch">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              onClick={switchMode}
              type="button"
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </div>
          <div className="auth-divider"><span>Or continue with</span></div>
          <button type="button" className="auth-google" disabled title="Google sign-in is not configured for this site">
            <img src={googleMark} alt="" aria-hidden="true" /> Continue with Google
          </button>
          <p className="auth-help">Google sign-in is not configured. Use your HTS credentials to continue.</p>
            </div>
          </div>
          <p className="auth-footer">HTS Coatings · Knowledge that protects.</p>
        </section>
      </div>
    </main>
  );
}
