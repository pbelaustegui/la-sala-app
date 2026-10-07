import { mount } from 'svelte';
import App from './App.svelte';
import { createBrowserEnv } from './env';
import { registerServiceWorker } from './pwa/service-worker';
import './app.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app mount point');

export default mount(App, { target, props: { env: { ...createBrowserEnv(), updates: registerServiceWorker() } } });
