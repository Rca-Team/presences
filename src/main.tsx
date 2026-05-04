import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import App from './App.tsx'
import './index.css'
import { loadModels, areModelsLoaded } from './services/FaceRecognitionService'
import { toast } from 'sonner'

// If a previous PWA service worker cached an older bundle (common after remixing),
// it can serve JS built without the latest env injection, causing `supabaseUrl is required`.
// We proactively unregister and clear caches once on startup to force a fresh load.
const unregisterStaleServiceWorkers = async () => {
  if (!('serviceWorker' in navigator)) return;

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) {
    // Best-effort only; do not block app startup.
    console.warn('Service worker cleanup skipped:', e);
  }
};

void unregisterStaleServiceWorkers();

// One-time cleanup: drop the legacy IndexedDB face descriptor cache so the app
// works exclusively against Lovable Cloud. Safe to run on every load.
const dropLegacyFaceDescriptorDB = () => {
  try {
    if (typeof indexedDB !== 'undefined' && 'deleteDatabase' in indexedDB) {
      indexedDB.deleteDatabase('FaceDescriptorCache');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('faceSamplesResetSnapshot');
      localStorage.removeItem('offline_attendance_records');
      localStorage.removeItem('pending_sync_count');
    }
    // Remove any other legacy IndexedDB databases used by the app
    if (typeof indexedDB !== 'undefined' && (indexedDB as any).databases) {
      (indexedDB as any).databases().then((dbs: Array<{ name?: string }>) => {
        dbs.forEach((db) => {
          if (db.name) indexedDB.deleteDatabase(db.name);
        });
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('Legacy descriptor cache cleanup skipped:', e);
  }
};

dropLegacyFaceDescriptorDB();


// Improved model loading with retry mechanism
const loadFaceModels = async (retries = 2, delay = 1500) => {
  let attempt = 0;
  
  while (attempt <= retries) {
    try {
      if (areModelsLoaded()) {
        console.log('Face recognition models already loaded');
        return true;
      }
      
      console.log(`Loading face recognition models (attempt ${attempt + 1}/${retries + 1})...`);
      await loadModels();
      console.log('Face recognition models loaded successfully');
      return true;
    } catch (err) {
      console.error(`Error loading face models (attempt ${attempt + 1}/${retries + 1}):`, err);
      
      if (attempt < retries) {
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        // Increase delay for each retry using exponential backoff
        delay = delay * 1.5;
      }
      
      attempt++;
    }
  }
  
  console.error(`Failed to load face models after ${retries + 1} attempts`);
  return false;
}

// Global error handler to prevent white screens
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// Initialize application
const initApp = () => {
  try {
    const root = document.getElementById("root");
    if (!root) {
      console.error('Root element not found');
      return;
    }
    
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    
    // Load face models after app is rendered
    loadFaceModels()
      .then(success => {
        if (!success) {
          setTimeout(() => {
            toast.error('Failed to pre-load face recognition models. Some features may not work correctly.', {
              duration: 6000,
              id: 'face-models-error'
            });
          }, 1000);
        }
      });
  } catch (err) {
    console.error('Failed to initialize app:', err);
    const root = document.getElementById("root");
    if (root) {
      root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#fff;font-family:sans-serif;padding:20px;text-align:center;">
        <div><h2>Something went wrong</h2><p style="color:#94a3b8;margin-top:8px;">Please refresh the page. If the issue persists, clear your browser cache.</p><button onclick="location.reload()" style="margin-top:16px;padding:8px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;">Refresh</button></div>
      </div>`;
    }
  }
}

// Start the application
initApp();
