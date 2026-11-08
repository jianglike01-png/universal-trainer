import { createRouter, createWebHashHistory } from 'vue-router';
import Today from './views/Today.vue';
import Library from './views/Library.vue';
import Dashboard from './views/Dashboard.vue';
import Me from './views/Me.vue';
import SampleDetail from './views/SampleDetail.vue';
import NewSample from './views/NewSample.vue';
import NewDomain from './views/NewDomain.vue';

// 用 hash 路由：GitHub Pages 静态托管无需 404 fallback 配置，离线打开也不会 404
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'today', component: Today },
    { path: '/library', name: 'library', component: Library },
    { path: '/dashboard', name: 'dashboard', component: Dashboard },
    { path: '/me', name: 'me', component: Me },
    { path: '/s/:id', name: 'sample', component: SampleDetail },
    { path: '/new', name: 'new-sample', component: NewSample },
    { path: '/new-domain', name: 'new-domain', component: NewDomain },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(to, from, saved) {
    return saved || { top: 0 };
  },
});
