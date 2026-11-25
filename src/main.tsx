import { createRoot } from 'react-dom/client';
import App from './app/App';
import Login from './features/auth/LoginPage';
import './styles/globals.css';
createRoot(document.getElementById('root')!).render(
  window.location.pathname === '/login' ? <Login /> : <App />,
);
