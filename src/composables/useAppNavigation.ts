import { onMounted, onUnmounted, ref, watch } from 'vue';

export type AppView = 'studio' | 'docs';

export function viewFromPath(path: string): AppView {
  return /^\/docs\/?$/.test(path) ? 'docs' : 'studio';
}

/** Minimal two-page navigation without adding a router dependency. */
export function useAppNavigation() {
  const view = ref<AppView>(viewFromPath(window.location.pathname));
  const syncLocation = () => { view.value = viewFromPath(window.location.pathname); };

  function navigate(target: AppView): void {
    const path = target === 'docs' ? '/docs' : '/';
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
    view.value = target;
    window.scrollTo(0, 0);
  }

  watch(view, next => {
    document.title = next === 'docs'
      ? 'DeAIfy Docs — HTTP API 接入指南'
      : 'DeAIfy — Image, made natural.';
  }, { immediate: true });

  onMounted(() => window.addEventListener('popstate', syncLocation));
  onUnmounted(() => window.removeEventListener('popstate', syncLocation));
  return { view, navigate };
}
