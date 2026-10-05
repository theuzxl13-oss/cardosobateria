'use strict';
/**
 * Gera as imagens ILUSTRATIVAS (SVG) usadas na demonstração:
 * produtos, serviços, galeria e banners. Execute: npm run images
 */
const fs = require('fs');
const path = require('path');
const { PRODUCTS } = require('../core/services/seed');

const OUT = path.join(__dirname, '..', 'docs', 'img');
const Y = '#FFC400';
const K = '#111111';
const W = '#FFFFFF';
const font = "font-family='Barlow, Arial, Helvetica, sans-serif'";

const write = (rel, svg) => {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, svg.trim() + '\n');
};
const tag = (x, y, anchor = 'end', color = '#888') =>
  `<text x='${x}' y='${y}' ${font} font-size='13' fill='${color}' text-anchor='${anchor}' letter-spacing='1'>IMAGEM ILUSTRATIVA</text>`;

function battery({ brand, ah, tech, w = 600, h = 600, big: bigLabel }) {
  // Ilustração neutra no padrão visual da Cardoso Baterias (não reproduz a embalagem/logotipo do fabricante)
  const theme = { band: Y, text: K, accent: K };
  const big = ah >= 90;
  const bw = big ? 440 : 380;
  const bx = (w - bw) / 2;
  return `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' role='img' aria-label='Ilustração de bateria ${brand} ${ah}Ah'>
  <defs>
    <linearGradient id='bg' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#f6f6f6'/><stop offset='1' stop-color='#e4e4e4'/></linearGradient>
    <linearGradient id='body' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#2a2a2a'/><stop offset='.5' stop-color='#151515'/><stop offset='1' stop-color='#0a0a0a'/></linearGradient>
  </defs>
  <rect width='${w}' height='${h}' fill='url(#bg)'/>
  <ellipse cx='${w / 2}' cy='505' rx='${bw / 2 + 30}' ry='22' fill='#000' opacity='.15'/>
  <rect x='${bx + 40}' y='150' width='34' height='34' rx='5' fill='#c62828'/>
  <rect x='${bx + bw - 74}' y='150' width='34' height='34' rx='5' fill='#333'/>
  <text x='${bx + 57}' y='140' ${font} font-size='34' font-weight='700' fill='#c62828' text-anchor='middle'>+</text>
  <text x='${bx + bw - 57}' y='140' ${font} font-size='38' font-weight='700' fill='#333' text-anchor='middle'>−</text>
  <rect x='${bx}' y='175' width='${bw}' height='40' rx='8' fill='#2b2b2b'/>
  <rect x='${bx}' y='205' width='${bw}' height='295' rx='10' fill='url(#body)'/>
  <rect x='${bx}' y='250' width='${bw}' height='150' fill='${theme.band}'/>
  <path d='M${bx} 250 h60 l-30 150 h-30z' fill='${theme.accent}' opacity='.9'/>
  <text x='${bx + bw / 2 + 15}' y='300' ${font} font-size='34' font-weight='800' font-style='italic' fill='${theme.text}' text-anchor='middle' letter-spacing='2'>${brand.toUpperCase()}</text>
  <text x='${bx + bw / 2 + 15}' y='372' ${font} font-size='${bigLabel ? 54 : 76}' font-weight='800' fill='${theme.text}' text-anchor='middle'>${bigLabel || `${ah}Ah`}</text>
  <text x='${bx + bw / 2}' y='440' ${font} font-size='22' font-weight='600' fill='${W}' text-anchor='middle'>12V · ${tech}</text>
  <path d='M${bx + bw - 70} 425 l14 -26 h-10 l8 -18 h16 l-10 18 h10 z' fill='${Y}'/>
  <text x='${bx + bw / 2}' y='480' ${font} font-size='13' fill='#999' text-anchor='middle'>PRODUTO DEMONSTRATIVO</text>
  ${tag(w - 16, h - 16)}
</svg>`;
}

for (const p of PRODUCTS) {
  const [sku, , brand, , ah, , , , tech] = p;
  const shortTech = tech.includes('AGM') ? 'AGM' : tech.includes('EFB') ? 'EFB' : 'Selada';
  write(`products/${sku.toLowerCase()}.svg`, battery({ brand, ah, tech: shortTech }));
}
write('battery-placeholder.svg', battery({ brand: 'Cardoso', ah: 0, tech: 'Sem foto cadastrada', big: 'BATERIA' }));

/* ---------- ícones/cenas de serviços ---------- */
const scene = (w, h, inner, label = true, bg = K) => `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' role='img'>
  <rect width='${w}' height='${h}' fill='${bg}'/>
  ${inner}
  ${label ? tag(w - 16, h - 16, 'end', '#bbb') : ''}
</svg>`;

const miniBattery = (x, y, s = 1, band = Y) => `
  <g transform='translate(${x} ${y}) scale(${s})'>
    <rect x='20' y='0' width='22' height='18' rx='3' fill='#c62828'/><rect x='118' y='0' width='22' height='18' rx='3' fill='#555'/>
    <rect x='0' y='14' width='160' height='110' rx='8' fill='#1b1b1b' stroke='#444' stroke-width='2'/>
    <rect x='0' y='45' width='160' height='45' fill='${band}'/>
    <path d='M84 52 l-16 22 h12 l-6 14 l18 -24 h-12 z' fill='${K}'/>
  </g>`;

const wrench = (x, y, s = 1, c = Y) =>
  `<g transform='translate(${x} ${y}) scale(${s}) rotate(-35)'><rect x='-8' y='0' width='16' height='130' rx='8' fill='${c}'/><circle cx='0' cy='0' r='26' fill='${c}'/><rect x='-9' y='-30' width='18' height='30' fill='${K}'/></g>`;

const meter = (x, y, s = 1) => `
  <g transform='translate(${x} ${y}) scale(${s})'>
    <rect x='0' y='0' width='120' height='170' rx='14' fill='${Y}'/>
    <rect x='14' y='14' width='92' height='50' rx='6' fill='#1b2b1b'/>
    <text x='60' y='50' ${font} font-size='26' font-weight='700' fill='#7CFC7C' text-anchor='middle'>12.6V</text>
    <circle cx='60' cy='115' r='28' fill='${K}'/><rect x='57' y='92' width='6' height='24' fill='${Y}'/>
  </g>
  <path d='M${x + 30 * s} ${y + 170 * s} C ${x} ${y + 260 * s}, ${x - 80 * s} ${y + 160 * s}, ${x - 110 * s} ${y + 200 * s}' stroke='#c62828' stroke-width='${6 * s}' fill='none'/>
  <path d='M${x + 90 * s} ${y + 170 * s} C ${x + 120 * s} ${y + 260 * s}, ${x - 40 * s} ${y + 230 * s}, ${x - 50 * s} ${y + 205 * s}' stroke='#222' stroke-width='${6 * s}' fill='none'/>`;

const person = (x, y, s = 1, shirt = Y) => `
  <g transform='translate(${x} ${y}) scale(${s})'>
    <circle cx='0' cy='0' r='28' fill='#e0b48a'/><path d='M-28 -6 q28 -40 56 0 q-4 -24 -28 -26 q-24 2 -28 26z' fill='#2b2b2b'/>
    <path d='M-50 110 q0 -70 50 -72 q50 2 50 72z' fill='${shirt}'/>
  </g>`;

const car = (x, y, s = 1, c = '#d9d9d9') => `
  <g transform='translate(${x} ${y}) scale(${s})'>
    <path d='M0 70 q4 -26 30 -30 l40 -34 q10 -6 24 -6 h90 q16 0 26 10 l34 30 q36 4 44 30 v20 h-288z' fill='${c}'/>
    <path d='M78 12 h50 v30 h-80z M138 12 h40 q8 0 14 6 l22 24 h-76z' fill='#9fc3d9'/>
    <circle cx='60' cy='92' r='26' fill='#222'/><circle cx='60' cy='92' r='11' fill='#888'/>
    <circle cx='230' cy='92' r='26' fill='#222'/><circle cx='230' cy='92' r='11' fill='#888'/>
  </g>`;

const services = {
  troca: scene(600, 400, `${car(60, 190, 1.4)}${miniBattery(390, 60, 1)}<path d='M380 150 q-40 20 -60 60' stroke='${Y}' stroke-width='6' fill='none' stroke-dasharray='10 8'/><text x='30' y='60' ${font} font-size='40' font-weight='800' fill='${W}'>TROCA</text>`),
  instalacao: scene(600, 400, `${miniBattery(210, 150, 1.2)}${wrench(140, 120, 1)}${wrench(470, 110, 0.8, W)}<text x='30' y='60' ${font} font-size='40' font-weight='800' fill='${W}'>INSTALAÇÃO</text>`),
  teste: scene(600, 400, `${miniBattery(80, 210, 1.1)}${meter(380, 70, 1)}<text x='30' y='60' ${font} font-size='40' font-weight='800' fill='${W}'>TESTE</text>`),
  atendimento: scene(600, 400, `${person(200, 200, 1.3)}${person(400, 210, 1.2, W)}<rect x='250' y='70' width='120' height='60' rx='14' fill='${Y}'/><path d='M290 130 l-10 22 l30 -22z' fill='${Y}'/><text x='310' y='110' ${font} font-size='30' font-weight='800' fill='${K}' text-anchor='middle'>Ah?</text><text x='30' y='60' ${font} font-size='40' font-weight='800' fill='${W}'>ATENDIMENTO</text>`),
};
for (const [k, v] of Object.entries(services)) write(`services/${k}.svg`, v);

/* ---------- galeria ---------- */
const sign = (x, y) => `<rect x='${x}' y='${y}' width='360' height='70' rx='8' fill='${K}'/><text x='${x + 180}' y='${y + 47}' ${font} font-size='30' font-weight='800' font-style='italic' fill='${W}' text-anchor='middle'>CARDOSO <tspan fill='${Y}'>BATERIAS</tspan></text>`;
const gallery = {
  fachada: scene(800, 600, `<rect x='0' y='420' width='800' height='180' fill='#3a3a3a'/><rect x='120' y='130' width='560' height='300' fill='#f2f2f2'/><rect x='120' y='130' width='560' height='26' fill='${Y}'/>${sign(220, 170)}<rect x='170' y='270' width='200' height='160' fill='#9fc3d9'/><rect x='420' y='270' width='210' height='160' fill='#2a2a2a'/>${miniBattery(190, 300, 0.7)}${miniBattery(300, 330, 0.5)}`, true, '#6fa8cf'),
  balcao: scene(800, 600, `<rect x='0' y='380' width='800' height='220' fill='#2a2a2a'/><rect x='80' y='330' width='640' height='70' fill='${Y}'/>${person(400, 250, 1.3, W)}${miniBattery(120, 220, 0.8)}${sign(220, 60)}`, true, '#e9e9e9'),
  estoque: scene(800, 600, `${[0, 1, 2].map((r) => `<rect x='60' y='${150 + r * 140}' width='680' height='12' fill='${Y}'/>` + [0, 1, 2, 3].map((c) => miniBattery(80 + c * 165, 40 + r * 140, 0.8, c % 2 ? W : Y)).join('')).join('')}`, true, '#d8d8d8'),
  teste: scene(800, 600, `${car(30, 320, 1.6)}${meter(560, 120, 1.1)}${miniBattery(300, 120, 0.9)}`, true, '#1c1c1c'),
  troca: scene(800, 600, `${car(60, 300, 1.7, '#c8c8c8')}${person(620, 300, 1.2)}${miniBattery(560, 120, 0.8)}`, true, '#2b2b2b'),
  pickup: scene(800, 600, `<g transform='translate(40 260) scale(2.2)'><path d='M0 70 v-30 q0 -8 8 -8 h60 l30 -30 h70 q8 0 10 8 l8 30 h60 q8 0 8 8 v22z' fill='#e0e0e0'/><circle cx='50' cy='76' r='20' fill='#222'/><circle cx='230' cy='76' r='20' fill='#222'/></g>${miniBattery(560, 100, 1.1)}`, true, '#14202b'),
};
for (const [k, v] of Object.entries(gallery)) write(`gallery/${k}.svg`, v);

/* ---------- banners ---------- */
const banner = (inner) => `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 500' preserveAspectRatio='xMidYMid slice' role='img'>
  <defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='#0b0b0b'/><stop offset='.55' stop-color='#161616'/><stop offset='1' stop-color='#262626'/></linearGradient></defs>
  <rect width='1200' height='500' fill='url(#g)'/>
  <path d='M760 0 h440 v500 h-640z' fill='${Y}' opacity='.08'/>
  <path d='M900 0 h300 v500 h-460z' fill='${Y}' opacity='.10'/>
  ${inner}
  ${tag(1184, 486, 'end', '#777')}
</svg>`;
write('banners/banner1.svg', banner(`${miniBattery(760, 120, 2.1)}<path d='M1110 90 l-40 70 h30 l-20 50 l60 -80 h-32 l22 -40z' fill='${Y}'/>`));
write('banners/banner2.svg', banner(`${meter(900, 110, 1.4)}${miniBattery(640, 230, 1.4)}`));
write('banners/banner3.svg', banner(`<circle cx='980' cy='170' r='120' fill='${Y}'/><text x='980' y='205' ${font} font-size='110' font-weight='800' fill='${K}' text-anchor='middle'>%</text>${miniBattery(640, 60, 1.2)}`));

/* ---------- hero ---------- */
write('hero.svg', banner(`${miniBattery(700, 90, 2.4)}<path d='M1120 60 l-50 90 h38 l-26 64 l76 -104 h-40 l28 -50z' fill='${Y}'/>`));
write('og.svg', banner(`<text x='60' y='240' ${font} font-size='80' font-weight='800' font-style='italic' fill='${W}'>CARDOSO</text><text x='64' y='300' ${font} font-size='40' font-weight='700' fill='${Y}' letter-spacing='12'>BATERIAS</text>${miniBattery(800, 130, 1.8)}`));

console.log('Imagens geradas em', OUT);
