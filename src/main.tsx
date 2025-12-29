import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

console.log('Main: Starting React app...');
const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Main: Root element not found!');
} else {
  console.log('Main: Root element found, rendering app...');
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  console.log('Main: App rendered');
}

