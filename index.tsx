import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Saneamiento de localStorage para prevenir errores de JSON.parse("undefined") en iframe/preview
try {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const val = localStorage.getItem(key);
      if (val === 'undefined' || val === 'null') {
        localStorage.removeItem(key);
        i--; // Ajustar el índice tras remover el elemento
      }
    }
  }
} catch (e) {
  console.warn("No se pudo sanear localStorage:", e);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);