import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ProveedorSesion } from './lib/sesion.jsx';
import App from './App.jsx';
import RedDeErrores from './components/RedDeErrores.jsx';
import { BASE } from './lib/base.js';
import './styles.css';
import { aplicarAjustes, seguirAlSistema } from './lib/ajustes.js';

// Tema y tamaño de letra elegidos en Ajustes, antes de dibujar la app.
aplicarAjustes();
seguirAlSistema();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RedDeErrores>
      <BrowserRouter basename={BASE.replace(/\/$/, '')}>
        <ProveedorSesion>
          <App />
        </ProveedorSesion>
      </BrowserRouter>
    </RedDeErrores>
  </React.StrictMode>
);
