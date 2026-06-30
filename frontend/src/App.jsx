import { Routes, Route } from 'react-router-dom';
import { ToastProvider } from './hooks/useToast';
import Header from './components/Header';
import Annotate from './pages/Annotate';
import Extract from './pages/Extract';

export default function App() {
  return (
    <ToastProvider>
      <div className="bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>
      <Header />
      <main className="main">
        <Routes>
          <Route path="/" element={<Annotate />} />
          <Route path="/extract" element={<Extract />} />
        </Routes>
      </main>
    </ToastProvider>
  );
}
