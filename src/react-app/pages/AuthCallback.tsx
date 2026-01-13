import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@getmocha/users-service/react";
import { Sparkles } from "lucide-react";

export default function AuthCallback() {
  const { exchangeCodeForSessionToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        await exchangeCodeForSessionToken();
        navigate("/dashboard");
      } catch (error) {
        console.error("Authentication failed:", error);
        navigate("/");
      }
    };

    handleCallback();
  }, [exchangeCodeForSessionToken, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-900">
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <Sparkles className="w-16 h-16 text-purple-300 animate-pulse" />
        </div>
        <h2 className="text-2xl font-semibold text-white mb-2">Signing you in...</h2>
        <p className="text-purple-200/70">Please wait a moment</p>
      </div>
    </div>
  );
}
