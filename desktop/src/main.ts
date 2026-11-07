import { mount } from 'svelte';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './app.css';
import App from './App.svelte';
import CodeWindow from './components/CodeWindow.svelte';

// The code panel window loads this same entry point; which root it gets depends on its label
// (see tauri.conf.json's two window definitions).
const Root = getCurrentWindow().label === 'code' ? CodeWindow : App;

export default mount(Root, { target: document.getElementById('app')! });
