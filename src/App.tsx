import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home, Login, Signup, AuthCallback, Dashboard, Onboarding, Roadmap, Skills } from './pages';

function App() {
  return (
    <BrowserRouter basename="/CareerGuide">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/roadmap/:id" element={<Roadmap />} />
        <Route path="/skills" element={<Skills />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
