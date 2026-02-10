/**
 * Clone Dance - Shared config loader
 * Loads config.json once and exposes it on window.AppConfig
 */
(() => {
    const CONFIG_PATH = 'config.json';

    async function fetchConfig() {
        const response = await fetch(CONFIG_PATH, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Failed to load ${CONFIG_PATH}: ${response.status}`);
        }

        const data = await response.json();
        if (!data || typeof data !== 'object') {
            throw new Error(`Invalid config format in ${CONFIG_PATH}`);
        }

        if (!data.common || !data.game || !data.visualizer) {
            throw new Error('Config must include common, game, and visualizer sections');
        }

        window.AppConfig = data;
        return data;
    }

    window.loadAppConfig = () => {
        if (window.__appConfigPromise) {
            return window.__appConfigPromise;
        }

        window.__appConfigPromise = fetchConfig();
        return window.__appConfigPromise;
    };
})();
