import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home, Login, Signup, Dashboard, Onboarding, Roadmap } from './pages';

function App() {
  return (
    <BrowserRouter basename="/CareerGuide">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/roadmap/:id" element={<Roadmap />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
