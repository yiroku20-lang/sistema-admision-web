// Utilidad para obtener la URL base del backend API.
// En Electron (protocolo file://), las rutas relativas como '/api/...' no funcionan
// porque no hay servidor web sirviendo la app. El backend Express escucha en localhost:5000.
export function getApiBase(): string {
  // Si estamos en Electron, usar URL absoluta al backend local
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return 'http://localhost:5000';
  }
  // En web (Netlify/Vite dev), usar VITE_API_URL o ruta relativa
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) {
    return (import.meta as any).env.VITE_API_URL;
  }
  return '';
}
