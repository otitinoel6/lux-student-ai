//========ROUTES(CONNECTIONS)====
import { BrowserRouter as Router, Routes, Route } from "react-router";
import { AuthProvider } from "@getmocha/users-service/react";
import HomePage from "@/react-app/pages/Home";
import AuthCallback from "@/react-app/pages/AuthCallback";
import Dashboard from "@/react-app/pages/Dashboard";
import Notes from "@/react-app/pages/Notes";
import GuestChat from "@/react-app/pages/GuestChat";
import Watermark from "@/react-app/components/Watermark";

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Watermark />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/guest" element={<GuestChat />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
//=================BY OTITI NOEL OCHIENG========