import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { enableMocking } from './mocks';
import './styles/index.css';

enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
