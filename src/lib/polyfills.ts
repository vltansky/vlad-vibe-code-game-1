// Define an extended Window interface that includes the global property
interface ExtendedWindow extends Window {
  global?: typeof globalThis;
}

// Ensure global is defined in the browser
if (typeof (window as ExtendedWindow).global === 'undefined') {
  (window as ExtendedWindow).global = window;
}

// Other browser polyfills can be added here

export {};
