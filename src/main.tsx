import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { FxProvider } from './state/FxProvider';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root 엘리먼트를 찾을 수 없습니다.');

createRoot(rootEl).render(
  <StrictMode>
    <FxProvider>
      <App />
    </FxProvider>
  </StrictMode>,
);
