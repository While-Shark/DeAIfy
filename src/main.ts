import { createApp } from 'vue';
import App from './App.vue';
import './styles/main.css';
// Responsive overrides must load after the base styles.
import './styles/responsive.css';

createApp(App).mount('#app');
