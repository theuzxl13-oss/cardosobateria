/*
 * Configuração do frontend.
 * backend:
 *   'auto'    -> no GitHub Pages (ou abrindo o arquivo) usa o banco SQLite no navegador;
 *                em outro domínio tenta o servidor Node (/api) e, se não houver, usa o navegador.
 *   'browser' -> sempre usa o banco no navegador (demonstração sem servidor).
 *   'server'  -> sempre usa o servidor Node (npm start).
 */
window.CB_CONFIG = { backend: 'auto' };
